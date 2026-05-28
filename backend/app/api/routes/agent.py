import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.agents.claude_agent import chat_with_tools
from app.agents.context import build_training_context
from app.core.database import get_db, AsyncSessionLocal
from app.models.conversation import Conversation, Message
from app.models.calendar_entry import UserCalendarEntry

log = logging.getLogger("claudius")
router = APIRouter()

ADD_CALENDAR_ENTRY_TOOL = {
    "name": "add_calendar_entry",
    "description": (
        "Add a planned workout or event to the Claudius internal calendar. "
        "Use this when the athlete asks to schedule or add something to the calendar. "
        "This does NOT sync to Garmin, TrainingPeaks, or Google Calendar."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Name of the workout or event (e.g. 'Knee Strength Work')",
            },
            "date": {
                "type": "string",
                "description": "Date in YYYY-MM-DD format",
            },
            "time_of_day": {
                "type": "string",
                "description": "Time in HH:MM 24h format, optional (e.g. '19:00')",
            },
            "duration_minutes": {
                "type": "integer",
                "description": "Duration in minutes, optional (e.g. 20)",
            },
            "sport_type": {
                "type": "string",
                "description": "Type: run, bike, swim, gym, or other",
            },
            "description": {
                "type": "string",
                "description": "Workout details or notes, optional",
            },
        },
        "required": ["title", "date"],
    },
}

TOOLS = [ADD_CALENDAR_ENTRY_TOOL]


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

    # Build training + memory + pattern context only on the first message
    context = await build_training_context(db) if not prior_msgs else None

    # Tool executor — has access to the request-scoped DB session
    async def tool_executor(tool_name: str, inputs: dict) -> str:
        if tool_name == "add_calendar_entry":
            entry = UserCalendarEntry(
                title=inputs["title"],
                date=inputs["date"],
                time_of_day=inputs.get("time_of_day"),
                duration_minutes=inputs.get("duration_minutes"),
                sport_type=inputs.get("sport_type", "other"),
                description=inputs.get("description"),
                created_by="ai",
            )
            db.add(entry)
            await db.flush()
            time_str = f" at {inputs['time_of_day']}" if inputs.get("time_of_day") else ""
            dur_str = f" ({inputs['duration_minutes']} min)" if inputs.get("duration_minutes") else ""
            return f"Added to Claudius calendar: '{inputs['title']}' on {inputs['date']}{time_str}{dur_str}."
        return f"Unknown tool: {tool_name}"

    reply = await chat_with_tools(
        req.message,
        tools=TOOLS,
        tool_executor=tool_executor,
        history=history,
        context=context,
    )

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
