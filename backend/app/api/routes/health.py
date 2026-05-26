from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.health import DailyHealth
from app.services.garmin_health import sync_garmin_health

router = APIRouter()


@router.post("/sync")
async def trigger_health_sync(background_tasks: BackgroundTasks, days: int = 30):
    background_tasks.add_task(sync_garmin_health, days)
    return {"status": "sync_queued", "days": days}


@router.get("/")
async def list_health(limit: int = 30, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DailyHealth).order_by(DailyHealth.date.desc()).limit(limit)
    )
    return result.scalars().all()


@router.get("/latest")
async def latest_health(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DailyHealth).order_by(DailyHealth.date.desc()).limit(1)
    )
    return result.scalar_one_or_none() or {}


@router.get("/{target_date}")
async def get_health_by_date(target_date: date, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DailyHealth).where(DailyHealth.date == target_date)
    )
    return result.scalar_one_or_none() or {}
