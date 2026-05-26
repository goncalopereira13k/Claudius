import traceback
from fastapi import APIRouter, BackgroundTasks, HTTPException
from app.services.garmin import sync_garmin, get_planned_workouts, invalidate_planned_cache
from app.services.garmin_health import sync_garmin_health
from app.services.strava import sync_strava

router = APIRouter()


async def _warm_planned_cache() -> None:
    """Pre-warm the planned workouts cache after a sync so the next calendar load is instant."""
    try:
        invalidate_planned_cache()
        await get_planned_workouts(weeks_ahead=8)
    except Exception:
        pass  # best-effort; calendar will fetch on demand if this fails


@router.post("/trigger")
async def trigger_sync(background_tasks: BackgroundTasks, garmin: bool = True, strava: bool = True, health: bool = True):
    if garmin:
        background_tasks.add_task(sync_garmin)
        background_tasks.add_task(_warm_planned_cache)  # runs after sync_garmin
    if health:
        background_tasks.add_task(sync_garmin_health)
    if strava:
        background_tasks.add_task(sync_strava)
    return {"status": "sync_queued"}


@router.get("/calendar")
async def get_calendar(weeks_ahead: int = 2):
    """Planned workouts from Garmin calendar (synced from TrainingPeaks coach plan)."""
    try:
        planned = await get_planned_workouts(weeks_ahead=weeks_ahead)
        return {"planned_workouts": planned}
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": type(e).__name__, "message": str(e), "trace": traceback.format_exc()})


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


@router.get("/garmin-raw")
async def garmin_raw():
    """Return raw Garmin API response for the latest activity — use to inspect available fields."""
    from app.services.garmin import _login
    _login()
    import garth
    raw = garth.connectapi(
        "/activitylist-service/activities/search/activities",
        params={"limit": 1, "start": 0},
    ) or []
    return raw[0] if raw else {}


@router.get("/calendar-raw")
async def calendar_raw():
    """Return raw Garmin calendar API response for the current month — use to inspect item types and field names."""
    import asyncio, traceback as tb
    from app.services.garmin import _login
    from datetime import date, timedelta
    import garth

    def _fetch():
        _login()
        today = date.today()
        y, m = today.year, today.month
        data = garth.connectapi(f"/calendar-service/year/{y}/month/{m}") or {}
        items = data.get("calendarItems", [])
        return {
            "total": len(items),
            "types": list({i.get("itemType") for i in items}),
            "sample": items[:10],
        }

    return await asyncio.to_thread(_fetch)


@router.get("/status")
async def sync_status():
    return {"last_sync": None, "status": "unknown"}
