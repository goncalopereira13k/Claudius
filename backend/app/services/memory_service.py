"""Conversation memory: extract facts from chats and retrieve them for future sessions."""
import json
import logging
import math
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.memory import UserMemory, MemoryCategory
from app.services.embedding_service import get_embedding, cosine_similarity

log = logging.getLogger("claudius")

_DEDUP_THRESHOLD = 0.85  # cosine similarity above which a memory is considered a duplicate

_EXTRACTION_PROMPT = """\
You are extracting structured knowledge from a coaching conversation.
Return ONLY a valid JSON array. Each item must have exactly these keys:
- "content": a single declarative sentence about the athlete (e.g. "Athlete's goal is to qualify for Boston Marathon in 2027.")
- "category": one of: goal, preference, fact, feedback
- "importance": float 0.0-1.0 (goals=0.9, facts=0.7, preferences=0.6, feedback=0.8)

Rules:
- Extract ONLY information useful in a future conversation about this athlete.
- Skip small talk, one-off session questions, and anything already obvious from training data.
- If there is nothing worth remembering, return [].
- No trailing commas. No explanation outside the JSON array.

Conversation:
{conversation}"""


def _format_messages(messages: list[dict]) -> str:
    parts = []
    for m in messages:
        role = "Athlete" if m["role"] == "user" else "Coach"
        parts.append(f"{role}: {m['content']}")
    return "\n".join(parts)


async def extract_and_save_memories(
    conversation_id: int,
    messages: list[dict],
    db: AsyncSession,
) -> list[UserMemory]:
    """Call Claude to extract key learnings from a conversation and persist new ones."""
    from app.agents.claude_agent import client

    formatted = _format_messages(messages)
    prompt = _EXTRACTION_PROMPT.format(conversation=formatted)

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        extracted = json.loads(raw)
        if not isinstance(extracted, list):
            return []
    except Exception as e:
        log.warning("Memory extraction failed (parse/API): %s", e)
        return []

    # Load recent memories for deduplication (top 50 by recency)
    existing_result = await db.execute(
        select(UserMemory).order_by(UserMemory.created_at.desc()).limit(50)
    )
    existing = existing_result.scalars().all()

    saved: list[UserMemory] = []
    for item in extracted:
        content = (item.get("content") or "").strip()
        if not content:
            continue
        try:
            category = MemoryCategory(item.get("category", "fact"))
        except ValueError:
            category = MemoryCategory.fact
        importance = float(item.get("importance", 0.5))

        embedding = get_embedding(content)

        # Skip if too similar to an existing memory
        is_duplicate = any(
            m.embedding is not None
            and cosine_similarity(embedding, list(m.embedding)) >= _DEDUP_THRESHOLD
            for m in existing
        )
        if is_duplicate:
            continue

        mem = UserMemory(
            content=content,
            category=category,
            source_type="conversation",
            source_conversation_id=conversation_id,
            embedding=embedding,
            importance_score=importance,
        )
        db.add(mem)
        existing.append(mem)  # prevent same-batch duplicates
        saved.append(mem)

    if saved:
        await db.commit()
        log.info("Saved %d new memories from conversation %d", len(saved), conversation_id)

    return saved


async def retrieve_relevant_memories(
    query: str,
    db: AsyncSession,
    limit: int = 5,
) -> list[UserMemory]:
    """Return the most semantically relevant memories for a given query string."""
    query_vec = get_embedding(query)

    # pgvector cosine distance operator: <=>
    result = await db.execute(
        select(UserMemory)
        .order_by(UserMemory.embedding.cosine_distance(query_vec))
        .limit(limit)
    )
    memories = result.scalars().all()

    # Increment access count
    for m in memories:
        m.access_count = (m.access_count or 0) + 1
    if memories:
        await db.commit()

    return memories


async def get_memory_context(db: AsyncSession) -> str:
    """Return a formatted block of the most important/frequently-used memories."""
    result = await db.execute(select(UserMemory))
    all_memories = result.scalars().all()

    if not all_memories:
        return ""

    # Score = importance * log(1 + access_count) — surfaces frequently-used + high-importance
    scored = sorted(
        all_memories,
        key=lambda m: m.importance_score * math.log(1 + (m.access_count or 0) + 1),
        reverse=True,
    )
    top = scored[:10]

    lines = ["Athlete memory (what I know about this athlete):"]
    for m in top:
        lines.append(f"- [{m.category.value}] {m.content}")
    return "\n".join(lines)
