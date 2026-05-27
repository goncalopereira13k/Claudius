import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.garmin import sync_garmin, get_planned_workouts, invalidate_planned_cache
from app.services.garmin_health import sync_garmin_health
from app.services.strava import sync_strava

log = logging.getLogger("claudius")

router = APIRouter()


async def _warm_planned_cache() -> None:
    """Pre-warm the planned workouts cache after a sync so the next calendar load is instant."""
    try:
        invalidate_planned_cache()
        await get_planned_workouts(weeks_ahead=8, weeks_back=4)
    except Exception:
        pass  # best-effort; calendar will fetch on demand if this fails


async def _refresh_ml_context() -> None:
    """Re-run pattern detection and suggestion followthrough check after a sync."""
    try:
        from app.core.database import AsyncSessionLocal
        from app.services.pattern_service import detect_patterns
        from app.services.feedback_service import check_suggestion_followthrough
        async with AsyncSessionLocal() as db:
            await detect_patterns(db)
            await check_suggestion_followthrough(db)
    except Exception as e:
        log.warning("Post-sync ML refresh failed: %s", e)


@router.post("/trigger")
async def trigger_sync(background_tasks: BackgroundTasks, garmin: bool = True, strava: bool = True, health: bool = True):
    if garmin:
        background_tasks.add_task(sync_garmin)
        background_tasks.add_task(_warm_planned_cache)  # runs after sync_garmin
    if health:
        background_tasks.add_task(sync_garmin_health)
    if strava:
        background_tasks.add_task(sync_strava)
    background_tasks.add_task(_refresh_ml_context)
    return {"status": "sync_queued"}


@router.get("/calendar")
async def get_calendar(weeks_ahead: int = 2):
    """Planned workouts from Garmin calendar (synced from TrainingPeaks coach plan)."""
    try:
        planned = await get_planned_workouts(weeks_ahead=weeks_ahead)
        log.info("Calendar returned %d planned workouts", len(planned))
        return {"planned_workouts": planned}
    except Exception as e:
        log.error("Calendar fetch failed: %s", e, exc_info=True)
        return {"planned_workouts": []}


@router.post("/strava-now")
async def strava_now():
    """Run Strava sync synchronously and return result for debugging."""
    from app.services.strava import get_valid_access_token
    import httpx
    token = await get_valid_access_token()
    if not token:
        return {"error": "no_token", "detail": "STRAVA_DEV_ACCESS_TOKEN missing or refresh failed"}
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.strava.com/api/v3/athlete/activities",
            headers={"Authorization": f"Bearer {token}"},
            params={"per_page": 5},
        )
    return {"status": resp.status_code, "count": len(resp.json()) if resp.status_code == 200 else 0, "sample": resp.json()[:1] if resp.status_code == 200 else resp.text}


@router.get("/workout/{workout_id}")
async def get_workout(workout_id: str):
    """Full structured workout detail (steps, targets, zones) for a planned workout."""
    try:
        from app.services.garmin import get_workout_detail
        return await get_workout_detail(workout_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": type(e).__name__, "message": str(e)})


@router.get("/status")
async def sync_status(db: AsyncSession = Depends(get_db)):
    from app.models.activity import Activity
    result = await db.execute(select(func.max(Activity.start_date)))
    last = result.scalar()
    return {
        "last_sync": last.isoformat() if last else None,
        "status": "synced" if last else "never_synced",
    }
