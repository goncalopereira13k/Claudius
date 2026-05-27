"""Coaching feedback loop: track actionable suggestions and detect if they were followed."""
import json
import logging
import re
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.memory import CoachingSuggestion
from app.models.activity import Activity
from app.services.embedding_service import get_embedding

log = logging.getLogger("claudius")

_SUGGESTION_PROMPT = """\
Extract specific, actionable coaching suggestions from this response.
Return ONLY a valid JSON array of objects with a single key "text".
Include ONLY concrete, time-bound recommendations (e.g. "Do an easy 45-minute run tomorrow at HR under 140").
Exclude vague advice, general principles, or explanations.
If there are no actionable suggestions, return [].

Response:
{response}"""


async def extract_suggestions(
    assistant_response: str,
    conversation_id: int,
    db: AsyncSession,
) -> list[CoachingSuggestion]:
    """Extract concrete suggestions from an assistant reply and persist them."""
    from app.agents.claude_agent import client

    prompt = _SUGGESTION_PROMPT.format(response=assistant_response)
    try:
        result = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = result.content[0].text.strip()
        items = json.loads(raw)
        if not isinstance(items, list):
            return []
    except Exception as e:
        log.warning("Suggestion extraction failed: %s", e)
        return []

    saved: list[CoachingSuggestion] = []
    for item in items:
        text = (item.get("text") or "").strip()
        if not text:
            continue
        embedding = get_embedding(text)
        suggestion = CoachingSuggestion(
            conversation_id=conversation_id,
            suggestion_text=text,
            suggestion_embedding=embedding,
        )
        db.add(suggestion)
        saved.append(suggestion)

    if saved:
        await db.commit()
        log.info("Saved %d coaching suggestions for conversation %d", len(saved), conversation_id)

    return saved


def _extract_hr_target(text: str) -> int | None:
    """Pull the first HR number from a suggestion like 'HR under 140'."""
    m = re.search(r"HR\s+(?:under|below|<)\s*(\d+)", text, re.IGNORECASE)
    return int(m.group(1)) if m else None


async def check_suggestion_followthrough(db: AsyncSession) -> int:
    """Heuristically determine whether pending suggestions were followed.

    Runs after data syncs. Updates was_followed on CoachingSuggestion rows.
    Returns the count of rows updated.
    """
    cutoff = datetime.utcnow() - timedelta(days=14)
    result = await db.execute(
        select(CoachingSuggestion)
        .where(CoachingSuggestion.was_followed.is_(None))
        .where(CoachingSuggestion.created_at > cutoff)
    )
    pending = result.scalars().all()

    updated = 0
    for suggestion in pending:
        # Look for activities in the 48h window after the suggestion was made
        window_end = suggestion.created_at + timedelta(hours=48)
        act_result = await db.execute(
            select(Activity)
            .where(Activity.start_date >= suggestion.created_at)
            .where(Activity.start_date <= window_end)
        )
        activities = act_result.scalars().all()

        if not activities:
            continue  # too early to judge

        text = suggestion.suggestion_text.lower()

        # Rest day / recovery check
        if any(kw in text for kw in ("rest day", "rest", "recovery day", "no training")):
            hard_after = [a for a in activities if a.tss and a.tss > 50]
            suggestion.was_followed = len(hard_after) == 0
            suggestion.outcome_notes = (
                "No high-TSS activity found — rest day followed."
                if suggestion.was_followed
                else f"Hard activity detected (TSS {hard_after[0].tss:.0f}) — rest day not followed."
            )
            updated += 1
            continue

        # Sport-specific check
        sport_keywords = {"run": "run", "ride": "cycling", "bike": "cycling", "swim": "swimming"}
        matched_sport = next((sport_keywords[k] for k in sport_keywords if k in text), None)
        if matched_sport:
            sport_activity = [
                a for a in activities
                if a.sport_type and matched_sport.lower() in a.sport_type.lower()
            ]
            suggestion.was_followed = len(sport_activity) > 0
            suggestion.outcome_notes = (
                f"Matching {matched_sport} activity found."
                if suggestion.was_followed
                else f"No {matched_sport} activity in 48h window."
            )

            # Additional HR check if suggestion contained an HR target
            hr_target = _extract_hr_target(suggestion.suggestion_text)
            if hr_target and sport_activity:
                a = sport_activity[0]
                if a.avg_hr:
                    hr_met = a.avg_hr <= hr_target
                    suggestion.was_followed = hr_met
                    suggestion.outcome_notes += (
                        f" HR target <{hr_target}bpm: {'met' if hr_met else 'not met'} (actual avg {a.avg_hr}bpm)."
                    )

            updated += 1
            continue

        # No heuristic matched — leave unknown but annotate
        suggestion.outcome_notes = "Could not automatically determine followthrough."

    if updated:
        await db.commit()
        log.info("Updated followthrough for %d suggestions", updated)

    return updated
