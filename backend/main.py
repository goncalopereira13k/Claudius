import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core.config import settings
from app.core.database import engine
from app.models.activity import Base
from app.models import health as _health_models  # noqa: F401 — registers DailyHealth in Base.metadata
from app.api.routes import auth, activities, agent, sync, health

_NEW_ACTIVITY_COLS = [
    ("norm_power",     "FLOAT"),
    ("elevation_gain", "FLOAT"),
    ("elevation_loss", "FLOAT"),
    ("calories",       "INTEGER"),
    ("avg_cadence",    "INTEGER"),
    ("avg_speed",      "FLOAT"),
    ("max_hr",         "INTEGER"),
]

_NEW_HEALTH_COLS = [
    ("vo2_max", "FLOAT"),
]


async def _warm_calendar_cache() -> None:
    try:
        from app.services.garmin import get_planned_workouts
        await get_planned_workouts(weeks_ahead=8)
    except Exception:
        pass  # Garmin credentials may not be set; skip silently


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for col_name, col_type in _NEW_ACTIVITY_COLS:
            await conn.execute(
                text(f"ALTER TABLE activities ADD COLUMN IF NOT EXISTS {col_name} {col_type}")
            )
        for col_name, col_type in _NEW_HEALTH_COLS:
            await conn.execute(
                text(f"ALTER TABLE daily_health ADD COLUMN IF NOT EXISTS {col_name} {col_type}")
            )
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


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
