import asyncio
import logging
from contextlib import asynccontextmanager

log = logging.getLogger("claudius")
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core.config import settings
from app.core.database import engine
from app.models.activity import Base
from app.models import health as _health_models  # noqa: F401 — registers DailyHealth in Base.metadata
from app.models import conversation as _conversation_models  # noqa: F401 — registers Conversation + Message in Base.metadata
from app.models import memory as _memory_models  # noqa: F401 — registers UserMemory, TrainingPattern, CoachingSuggestion
from app.models import calendar_entry as _calendar_entry_models  # noqa: F401 — registers UserCalendarEntry
from app.models import eval as _eval_models  # noqa: F401 — registers ConversationEval
from app.api.routes import auth, activities, agent, sync, health, memory, calendar_entries

_NEW_ACTIVITY_COLS = [
    ("norm_power",     "FLOAT"),
    ("elevation_gain", "FLOAT"),
    ("elevation_loss", "FLOAT"),
    ("calories",       "INTEGER"),
    ("avg_cadence",    "INTEGER"),
    ("avg_speed",      "FLOAT"),
    ("max_hr",         "INTEGER"),
    ("laps_json",      "TEXT"),
]

_NEW_HEALTH_COLS = [
    ("vo2_max", "FLOAT"),
]


async def _warm_calendar_cache() -> None:
    try:
        from app.services.garmin import get_planned_workouts
        workouts = await get_planned_workouts(weeks_ahead=8, weeks_back=4)
        log.info("Calendar cache warmed: %d planned workouts", len(workouts))
    except Exception as e:
        log.warning("Calendar cache warm failed: %s", e)


async def _startup_sync() -> None:
    from app.services.garmin import sync_garmin
    from app.services.garmin_health import sync_garmin_health
    from app.services.strava import sync_strava
    try:
        await sync_garmin()
        log.info("Startup Garmin activity sync complete")
    except Exception as e:
        log.warning("Startup Garmin activity sync failed: %s", e)
    try:
        await sync_garmin_health()
        log.info("Startup Garmin health sync complete")
    except Exception as e:
        log.warning("Startup Garmin health sync failed: %s", e)
    try:
        await sync_strava()
        log.info("Startup Strava sync complete")
    except Exception as e:
        log.warning("Startup Strava sync failed: %s", e)

    # Refresh ML patterns and followthrough after all data is synced
    try:
        from app.core.database import AsyncSessionLocal
        from app.services.pattern_service import detect_patterns
        from app.services.feedback_service import check_suggestion_followthrough
        async with AsyncSessionLocal() as db:
            await detect_patterns(db)
            await check_suggestion_followthrough(db)
        log.info("Startup ML pattern detection complete")
    except Exception as e:
        log.warning("Startup ML tasks failed: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
        for col_name, col_type in _NEW_ACTIVITY_COLS:
            await conn.execute(
                text(f"ALTER TABLE activities ADD COLUMN IF NOT EXISTS {col_name} {col_type}")
            )
        for col_name, col_type in _NEW_HEALTH_COLS:
            await conn.execute(
                text(f"ALTER TABLE daily_health ADD COLUMN IF NOT EXISTS {col_name} {col_type}")
            )
    asyncio.create_task(_startup_sync())
    asyncio.create_task(_warm_calendar_cache())
    yield

app = FastAPI(
    title="Claudius API",
    description="Personal training data aggregator with AI coaching",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,       prefix="/api/auth",       tags=["auth"])
app.include_router(activities.router, prefix="/api/activities", tags=["activities"])
app.include_router(agent.router,      prefix="/api/agent",      tags=["agent"])
app.include_router(sync.router,       prefix="/api/sync",       tags=["sync"])
app.include_router(health.router,     prefix="/api/health",     tags=["health"])
app.include_router(memory.router,          prefix="/api/memory",    tags=["memory"])
app.include_router(calendar_entries.router, prefix="/api/calendar",  tags=["calendar"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
