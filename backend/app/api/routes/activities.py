from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, cast, Date
from app.core.database import get_db
from app.models.activity import Activity, Source
from app.agents.claude_agent import analyse_activity

router = APIRouter()


@router.get("/")
async def list_activities(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Activity).order_by(Activity.start_date.desc())
    )
    return result.scalars().all()


_GENERIC_NAMES = {
    "morning run", "afternoon run", "evening run",
    "morning ride", "afternoon ride", "evening ride",
    "lunch run", "morning walk", "evening walk", "afternoon walk",
    "morning swim", "afternoon swim",
}

@router.delete("/deduplicate")
async def deduplicate(db: AsyncSession = Depends(get_db)):
    """Delete duplicate activities: same day + ±5% distance, any source combination.
    Prefers specific names over generic Garmin defaults; among equals prefers Garmin over Strava."""
    all_acts = (await db.execute(
        select(Activity).order_by(Activity.start_date, Activity.id)
    )).scalars().all()

    removed = 0
    kept: list[Activity] = []

    for a in all_acts:
        if not a.start_date or a.distance_meters <= 100:
            kept.append(a)
            continue

        day = a.start_date.date()
        dup = next(
            (k for k in kept
             if k.start_date and k.start_date.date() == day
             and k.distance_meters > 100
             and abs(k.distance_meters - a.distance_meters) / max(k.distance_meters, a.distance_meters) <= 0.05),
            None,
        )
        if not dup:
            kept.append(a)
            continue

        a_generic   = a.name.lower().strip() in _GENERIC_NAMES
        dup_generic = dup.name.lower().strip() in _GENERIC_NAMES

        if a_generic and not dup_generic:
            await db.delete(a)                    # `a` is the generic one — drop it
        elif dup_generic and not a_generic:
            await db.delete(dup)                  # existing `dup` is the generic one — swap
            kept.remove(dup)
            kept.append(a)
        elif a.source == Source.strava:
            await db.delete(a)                    # both equal — prefer Garmin
        else:
            await db.delete(dup)
            kept.remove(dup)
            kept.append(a)
        removed += 1

    await db.commit()
    return {"removed": removed}


@router.get("/{activity_id}")
async def get_activity(activity_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Activity).where(Activity.id == activity_id))
    return result.scalar_one_or_none() or {}


@router.post("/{activity_id}/analyse")
async def analyse(activity_id: int):
    # TODO: fetch activity from DB and pass to Claude
    activity = {"id": activity_id}
    analysis = await analyse_activity(activity)
    return {"analysis": analysis}
