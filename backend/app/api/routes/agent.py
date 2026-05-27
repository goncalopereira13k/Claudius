import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.agents.claude_agent import chat
from app.agents.context import build_training_context
from app.core.database import get_db, AsyncSessionLocal
from app.models.conversation import Conversation, Message

log = logging.getLogger("claudius")
router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    conversation_id: int | None = None


class ChatResponse(BaseModel):
    reply: str
    conversation_id: int


class ConversationOut(BaseModel):
    id: int
    title: str
    created_at: str

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: str

    class Config:
        from_attributes = True


async def _run_memory_extraction(conversation_id: int, messages: list[dict]) -> None:
    try:
        from app.services.memory_service import extract_and_save_memories
        async with AsyncSessionLocal() as db:
            await extract_and_save_memories(conversation_id, messages, db)
    except Exception as e:
        log.warning("Memory extraction task failed: %s", e)


async def _run_suggestion_extraction(reply: str, conversation_id: int) -> None:
    try:
        from app.services.feedback_service import extract_suggestions
        async with AsyncSessionLocal() as db:
            await extract_suggestions(reply, conversation_id, db)
    except Exception as e:
        log.warning("Suggestion extraction task failed: %s", e)


@router.post("/conversations", response_model=ConversationOut)
async def create_conversation(db: AsyncSession = Depends(get_db)):
    conv = Conversation()
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return ConversationOut(id=conv.id, title=conv.title or "", created_at=conv.created_at.isoformat())


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
async def get_messages(conversation_id: int, db: AsyncSession = Depends(get_db)):
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.id)
    )
    msgs = result.scalars().all()
    return [
        MessageOut(id=m.id, role=m.role, content=m.content, created_at=m.created_at.isoformat())
        for m in msgs
    ]


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    # Resolve or create conversation
    if req.conversation_id:
        conv = await db.get(Conversation, req.conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        conv = Conversation()
        db.add(conv)
        await db.flush()

    # Save incoming user message
    user_msg = Message(conversation_id=conv.id, role="user", content=req.message)
    db.add(user_msg)
    await db.flush()

    # Load prior messages (excluding the one just added)
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv.id)
        .where(Message.id != user_msg.id)
        .order_by(Message.id)
    )
    prior_msgs = result.scalars().all()
    history = [{"role": m.role, "content": m.content} for m in prior_msgs]

    # Build training + memory + pattern context only on the first message of a conversation
    context = await build_training_context(db) if not prior_msgs else None

    reply = await chat(req.message, history=history, context=context)

    db.add(Message(conversation_id=conv.id, role="assistant", content=reply))

    if not prior_msgs and not conv.title:
        conv.title = req.message[:80]

    await db.commit()

    # Fire-and-forget: memory extraction and suggestion tracking
    all_msgs = [{"role": m.role, "content": m.content} for m in prior_msgs]
    all_msgs.append({"role": "user", "content": req.message})
    all_msgs.append({"role": "assistant", "content": reply})

    asyncio.create_task(_run_memory_extraction(conv.id, all_msgs))
    asyncio.create_task(_run_suggestion_extraction(reply, conv.id))

    return ChatResponse(reply=reply, conversation_id=conv.id)
