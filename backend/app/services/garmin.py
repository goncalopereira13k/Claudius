import asyncio
import time
from datetime import date, timedelta, datetime
import garth
from sqlalchemy import select
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.activity import Activity, Source

# In-memory cache for planned workouts — avoids a live Garmin API hit on every calendar view
_planned_cache: dict = {}   # keys: "ts" (float), "data" (list[dict])
_CACHE_TTL = 900            # seconds (15 minutes)


def _login():
    garth.login(settings.GARMIN_EMAIL, settings.GARMIN_PASSWORD)


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace(" ", "T"))
    except ValueError:
        return None


def _tss_from_item(item: dict) -> float | None:
    """Extract training load from a Garmin activity item, trying multiple field names."""
    native = (
        item.get("activityTrainingLoad")
        or item.get("trainingLoad")
        or item.get("trainingStressScore")
    )
    if native:
        return float(native)

    # TRIMP fallback: duration × hr_ratio × e^(1.92 × hr_ratio)
    import math
    duration_min = (item.get("duration") or 0) / 60
    avg_hr = item.get("averageHR") or 0
    max_hr = item.get("maxHR") or 0
    if duration_min > 0 and avg_hr > 0 and max_hr > avg_hr:
        hr_ratio = avg_hr / max_hr
        return round(duration_min * hr_ratio * math.exp(1.92 * hr_ratio), 1)
    return None


async def sync_garmin() -> list[dict]:
    """Fetch the last 30 completed activities from Garmin Connect and upsert to DB."""
    _login()
    all_raw: list[dict] = []
    start = 0
    page_size = 100
    while True:
        page = garth.connectapi(
            "/activitylist-service/activities/search/activities",
            params={"limit": page_size, "start": start},
        ) or []
        all_raw.extend(page)
        if len(page) < page_size:
            break
        start += page_size
    raw = all_raw

    async with AsyncSessionLocal() as session:
        for item in raw:
            external_id = str(item.get("activityId", ""))
            if not external_id:
                continue
            existing = await session.scalar(
                select(Activity).where(Activity.external_id == external_id)
            )
            tss = _tss_from_item(item)
            training_effect = item.get("aerobicTrainingEffect")
            norm_power     = item.get("normPower") or item.get("normalizedPower")
            elevation_gain = item.get("elevationGain")
            elevation_loss = item.get("elevationLoss")
            calories       = item.get("calories")
            avg_cadence    = (
                item.get("averageRunningCadenceInStepsPerMinute")
                or item.get("avgBikeCadence")
                or item.get("averageCadence")
                or item.get("avgCadence")
            )
            avg_speed  = item.get("avgSpeed")
            max_hr_val = item.get("maxHR")

            if existing:
                existing.tss             = tss
                existing.training_effect = training_effect
                if existing.norm_power     is None: existing.norm_power     = norm_power
                if existing.elevation_gain is None: existing.elevation_gain = elevation_gain
                if existing.elevation_loss is None: existing.elevation_loss = elevation_loss
                if existing.calories       is None: existing.calories       = calories
                if existing.avg_cadence    is None: existing.avg_cadence    = avg_cadence
                if existing.avg_speed      is None: existing.avg_speed      = avg_speed
                if existing.max_hr         is None: existing.max_hr         = max_hr_val
                continue

            session.add(Activity(
                external_id=external_id,
                source=Source.garmin,
                name=item.get("activityName", ""),
                sport_type=item.get("activityType", {}).get("typeKey", ""),
                start_date=_parse_dt(item.get("startTimeLocal")),
                duration_seconds=int(item.get("duration") or 0),
                distance_meters=float(item.get("distance") or 0),
                avg_hr=item.get("averageHR"),
                avg_power=item.get("avgPower"),
                tss=tss,
                training_effect=training_effect,
                norm_power=norm_power,
                elevation_gain=elevation_gain,
                elevation_loss=elevation_loss,
                calories=calories,
                avg_cadence=avg_cadence,
                avg_speed=avg_speed,
                max_hr=max_hr_val,
            ))
        await session.commit()

    return raw


def _fetch_planned_workouts_sync(weeks_ahead: int) -> list[dict]:
    """Blocking implementation — call via asyncio.to_thread."""
    _login()

    today = date.today()
    end = today + timedelta(weeks=weeks_ahead)

    # Collect every year/month between today and end
    months: set[tuple[int, int]] = set()
    cur = today.replace(day=1)
    while cur <= end:
        months.add((cur.year, cur.month))
        cur = cur.replace(month=1, year=cur.year + 1) if cur.month == 12 else cur.replace(month=cur.month + 1)

    planned = []
    for year, month in sorted(months):
        data = garth.connectapi(f"/calendar-service/year/{year}/month/{month}") or {}
        for item in data.get("calendarItems", []):
            item_type = (item.get("itemType") or "").lower()
            if item_type not in ("workout", "event"):
                continue
            item_date = (item.get("date") or "")[:10]
            if not item_date or not (today.isoformat() <= item_date <= end.isoformat()):
                continue
            planned.append({
                "date":       item_date,
                "title":      item.get("title") or "",
                "sport":      item.get("sportTypeKey") or "",
                "description": item.get("location") or "",
                "workout_id": item.get("workoutId"),
                "item_type":  item_type,
            })

    return planned


async def get_planned_workouts(weeks_ahead: int = 2) -> list[dict]:
    """Return planned workouts from cache when fresh, otherwise fetch from Garmin."""
    global _planned_cache
    now = time.time()
    if _planned_cache.get("ts") and now - _planned_cache["ts"] < _CACHE_TTL:
        return _planned_cache["data"]
    # Always fetch at least 8 weeks so any month the user browses is already cached
    result = await asyncio.to_thread(_fetch_planned_workouts_sync, max(weeks_ahead, 8))
    _planned_cache = {"ts": now, "data": result}
    return result


def invalidate_planned_cache() -> None:
    global _planned_cache
    _planned_cache.clear()


async def get_workout_detail(workout_id: str) -> dict:
    """Fetch the full structured workout (steps, targets, zones) for a planned workout."""
    _login()
    detail = garth.connectapi(f"/workout-service/workout/{workout_id}")
    return detail or {}
