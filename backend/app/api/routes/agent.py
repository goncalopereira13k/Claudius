import asyncio
import logging
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.agents.claude_agent import chat_with_tools
from app.agents.context import build_training_context
from app.core.database import get_db, AsyncSessionLocal
from app.models.conversation import Conversation, Message
from app.models.calendar_entry import UserCalendarEntry
from app.models.activity import Activity

log = logging.getLogger("claudius")
router = APIRouter()

ADD_CALENDAR_ENTRY_TOOL = {
    "name": "add_calendar_entry",
    "description": (
        "Add a planned workout or event to the Claudius internal calendar. "
        "Use this when the athlete asks to schedule or add something to the calendar. "
        "This does NOT sync to Garmin or Google Calendar."
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

GET_ACTIVITIES_TOOL = {
    "name": "get_activities",
    "description": (
        "Fetch the athlete's recent activities from the database. "
        "Use this when the athlete asks about recent workouts, wants to review performance, "
        "or when you need up-to-date activity data during the conversation."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "limit": {
                "type": "integer",
                "description": "Number of activities to return (default 10, max 30)",
            },
            "sport_type": {
                "type": "string",
                "description": "Filter by sport type (e.g. 'running', 'cycling'). Optional.",
            },
        },
        "required": [],
    },
}

GET_CALENDAR_TOOL = {
    "name": "get_calendar",
    "description": (
        "Read the Claudius internal calendar entries. "
        "Use this before suggesting a new workout, checking what is already scheduled, "
        "or when the athlete asks what they have planned."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "from_date": {
                "type": "string",
                "description": "Start date in YYYY-MM-DD format. Defaults to today.",
            },
            "to_date": {
                "type": "string",
                "description": "End date in YYYY-MM-DD format. Defaults to 14 days from today.",
            },
        },
        "required": [],
    },
}

DELETE_CALENDAR_ENTRY_TOOL = {
    "name": "delete_calendar_entry",
    "description": (
        "Delete a calendar entry from the Claudius internal calendar. "
        "Use this when the athlete asks to remove or cancel a scheduled workout. "
        "Call get_calendar first to find the correct entry id."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "entry_id": {
                "type": "integer",
                "description": "The id of the calendar entry to delete.",
            },
        },
        "required": ["entry_id"],
    },
}

SEARCH_TRAINING_HISTORY_TOOL = {
    "name": "search_training_history",
    "description": (
        "Search the athlete's training history by sport type, date range, or metrics. "
        "Use this when the athlete asks historical questions like 'how many times did I run last month' "
        "or 'show me my long rides'."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "sport_type": {
                "type": "string",
                "description": "Filter by sport type (e.g. 'running', 'cycling'). Optional.",
            },
            "from_date": {
                "type": "string",
                "description": "Start date in YYYY-MM-DD format. Optional.",
            },
            "to_date": {
                "type": "string",
                "description": "End date in YYYY-MM-DD format. Optional.",
            },
            "min_distance_km": {
                "type": "number",
                "description": "Minimum distance in km. Optional.",
            },
            "limit": {
                "type": "integer",
                "description": "Max results to return (default 20).",
            },
        },
        "required": [],
    },
}

GET_ACTIVITY_DETAIL_TOOL = {
    "name": "get_activity_detail",
    "description": (
        "Fetch the full lap-by-lap breakdown of a specific activity: "
        "pace per km, HR per lap, cadence, elevation, duration. "
        "Use this when the athlete asks to analyse a specific workout in detail, "
        "or when you need to understand the structure of a session (Z2 drift, interval execution, etc.). "
        "Call get_activities first to get the activity id."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "activity_id": {
                "type": "integer",
                "description": "The internal DB id of the activity (shown as [id:X] in get_activities output).",
            },
        },
        "required": ["activity_id"],
    },
}

TOOLS = [
    ADD_CALENDAR_ENTRY_TOOL,
    GET_ACTIVITIES_TOOL,
    GET_CALENDAR_TOOL,
    DELETE_CALENDAR_ENTRY_TOOL,
    SEARCH_TRAINING_HISTORY_TOOL,
    GET_ACTIVITY_DETAIL_TOOL,
]


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

        if tool_name == "get_activities":
            limit = min(inputs.get("limit", 10), 30)
            query = select(Activity).order_by(Activity.start_date.desc()).limit(limit)
            if sport_type_filter := inputs.get("sport_type"):
                query = select(Activity).where(
                    Activity.sport_type.ilike(f"%{sport_type_filter}%")
                ).order_by(Activity.start_date.desc()).limit(limit)
            rows = (await db.execute(query)).scalars().all()
            if not rows:
                return "No activities found."
            lines = []
            for a in rows:
                day = a.start_date.date() if a.start_date else "?"
                dist = f"{a.distance_meters / 1000:.1f}km" if a.distance_meters else "—"
                dur = f"{int(a.duration_seconds // 60)}min" if a.duration_seconds else "—"
                has_laps = "✓laps" if a.laps_json else ""
                parts = [f"[id:{a.id}]", f"{day}", a.sport_type or "?", dist, dur]
                if a.avg_hr:
                    parts.append(f"HR:{a.avg_hr}/{a.max_hr}" if a.max_hr else f"HR:{a.avg_hr}")
                if a.tss:
                    parts.append(f"TSS:{a.tss:.0f}")
                if a.norm_power:
                    parts.append(f"NP:{a.norm_power:.0f}W")
                if has_laps:
                    parts.append(has_laps)
                lines.append("  ".join(parts))
            return "\n".join(lines)

        if tool_name == "get_calendar":
            today = date.today().isoformat()
            from_date = inputs.get("from_date", today)
            to_date = inputs.get("to_date") or str(date.today().replace(day=date.today().day + 14))
            rows = (await db.execute(
                select(UserCalendarEntry)
                .where(and_(UserCalendarEntry.date >= from_date, UserCalendarEntry.date <= to_date))
                .order_by(UserCalendarEntry.date)
            )).scalars().all()
            if not rows:
                return f"No calendar entries between {from_date} and {to_date}."
            lines = []
            for e in rows:
                parts = [f"[id:{e.id}]", e.date, e.sport_type or "other", e.title]
                if e.time_of_day:
                    parts.append(f"at {e.time_of_day}")
                if e.duration_minutes:
                    parts.append(f"{e.duration_minutes}min")
                if e.description:
                    parts.append(f"— {e.description}")
                lines.append("  ".join(parts))
            return "\n".join(lines)

        if tool_name == "delete_calendar_entry":
            entry_id = inputs["entry_id"]
            entry = await db.get(UserCalendarEntry, entry_id)
            if not entry:
                return f"No calendar entry found with id {entry_id}."
            title, entry_date = entry.title, entry.date
            await db.delete(entry)
            await db.flush()
            return f"Deleted calendar entry '{title}' on {entry_date} (id:{entry_id})."

        if tool_name == "search_training_history":
            limit = min(inputs.get("limit", 20), 50)
            conditions = []
            if sport_type_filter := inputs.get("sport_type"):
                conditions.append(Activity.sport_type.ilike(f"%{sport_type_filter}%"))
            if from_date := inputs.get("from_date"):
                conditions.append(Activity.start_date >= from_date)
            if to_date := inputs.get("to_date"):
                conditions.append(Activity.start_date <= to_date)
            if min_dist := inputs.get("min_distance_km"):
                conditions.append(Activity.distance_meters >= min_dist * 1000)
            query = select(Activity).order_by(Activity.start_date.desc()).limit(limit)
            if conditions:
                query = select(Activity).where(and_(*conditions)).order_by(Activity.start_date.desc()).limit(limit)
            rows = (await db.execute(query)).scalars().all()
            if not rows:
                return "No activities match the search criteria."
            lines = []
            for a in rows:
                day = a.start_date.date() if a.start_date else "?"
                dist = f"{a.distance_meters / 1000:.1f}km" if a.distance_meters else "—"
                dur = f"{int(a.duration_seconds // 60)}min" if a.duration_seconds else "—"
                parts = [f"{day}", a.sport_type or "?", dist, dur]
                if a.avg_hr:
                    parts.append(f"HR:{a.avg_hr}")
                if a.tss:
                    parts.append(f"TSS:{a.tss:.0f}")
                if a.elevation_gain:
                    parts.append(f"elev:{a.elevation_gain:.0f}m")
                lines.append("  ".join(parts))
            return f"Found {len(rows)} activities:\n" + "\n".join(lines)

        if tool_name == "get_activity_detail":
            activity = await db.get(Activity, inputs["activity_id"])
            if not activity:
                return f"No activity found with id {inputs['activity_id']}."

            # Use cached laps if available; otherwise fetch from source API
            laps_raw = None
            if activity.laps_json:
                import json as _json
                laps_raw = _json.loads(activity.laps_json)
            elif activity.external_id and activity.source and activity.source.value == "garmin":
                from app.services.garmin import get_activity_laps
                laps_raw = await get_activity_laps(activity.external_id)
                if laps_raw:
                    import json as _json
                    activity.laps_json = _json.dumps(laps_raw)
                    await db.flush()

            def _pace(speed_ms: float | None) -> str:
                if not speed_ms or speed_ms <= 0:
                    return "—"
                secs = 1000 / speed_ms
                return f"{int(secs // 60)}:{int(secs % 60):02d}/km"

            header = (
                f"Activity id:{activity.id} | {activity.start_date.date() if activity.start_date else '?'} "
                f"| {activity.sport_type} | {activity.distance_meters / 1000:.1f}km "
                f"| {int(activity.duration_seconds // 60)}min "
                f"| avg HR:{activity.avg_hr} max HR:{activity.max_hr} "
                f"| TSS:{activity.tss:.0f}" if activity.tss else ""
            )

            if not laps_raw:
                return f"{header}\nNo lap data available for this activity."

            lines = [header, "Laps:"]
            for i, lap in enumerate(laps_raw, 1):
                # Normalise Garmin vs Strava field names
                dist = lap.get("distance") or 0
                dur = lap.get("elapsedDuration") or lap.get("elapsed_time") or 0
                speed = lap.get("averageSpeed") or lap.get("average_speed")
                avg_hr = lap.get("averageHR") or lap.get("average_heartrate")
                max_hr = lap.get("maxHR") or lap.get("max_heartrate")
                cadence = lap.get("averageRunCadence") or lap.get("average_cadence")
                elev = lap.get("elevationGain") or lap.get("total_elevation_gain")

                parts = [f"  Lap {i}: {dist / 1000:.2f}km", f"{int(dur // 60)}:{int(dur % 60):02d}", _pace(speed)]
                if avg_hr:
                    parts.append(f"HR:{int(avg_hr)}" + (f"/{int(max_hr)}" if max_hr else ""))
                if cadence:
                    parts.append(f"cad:{int(cadence)}")
                if elev:
                    parts.append(f"elev:+{elev:.0f}m")
                lines.append("  ".join(parts))

            return "\n".join(lines)

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
