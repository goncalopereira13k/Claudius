import asyncio
import os
import threading
import time
from datetime import date, timedelta, datetime

from garminconnect import Garmin
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.activity import Activity, Source

# ── Session singleton ────────────────────────────────────────────────────────
# One Garmin client per process. login() is called once; the library handles
# OAuth token refresh automatically without touching the SSO endpoint again.

_client_lock = threading.Lock()
_client: Garmin | None = None
_blocked_until: float = 0.0
_TOKENSTORE = os.environ.get("GARTH_HOME", "/tmp/garth_tokens")


def _get_client() -> Garmin:
    """Return the shared, authenticated Garmin client.

    First call: tries saved tokens (no SSO), falls back to full login and saves tokens.
    Subsequent calls (including after hot-reload): loads tokens from disk — no SSO hit.
    On 429: raises immediately and blocks retries for 15 minutes.
    """
    global _client, _blocked_until

    with _client_lock:
        if _client is not None:
            return _client

        if time.time() < _blocked_until:
            secs = int(_blocked_until - time.time())
            raise RuntimeError(f"Garmin SSO rate-limited — retry in {secs}s")

        client = Garmin(settings.GARMIN_EMAIL, settings.GARMIN_PASSWORD)
        try:
            # Positional arg matches README pattern: client.login("~/.garminconnect")
            # First call: full SSO login + saves tokens; subsequent: loads from disk, no SSO
            client.login(_TOKENSTORE)
        except Exception as e:
            if "429" in str(e):
                _blocked_until = time.time() + 900  # 15-min back-off
            raise

        _client = client
        return _client


# ── In-memory cache for planned workouts ────────────────────────────────────

_planned_cache: dict = {}
_CACHE_TTL = 900  # 15 minutes


# ── Helpers ──────────────────────────────────────────────────────────────────

def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace(" ", "T"))
    except ValueError:
        return None


def _tss_from_item(item: dict) -> float | None:
    native = (
        item.get("activityTrainingLoad")
        or item.get("trainingLoad")
        or item.get("trainingStressScore")
    )
    if native:
        return float(native)
    import math
    duration_min = (item.get("duration") or 0) / 60
    avg_hr = item.get("averageHR") or 0
    max_hr = item.get("maxHR") or 0
    if duration_min > 0 and avg_hr > 0 and max_hr > avg_hr:
        hr_ratio = avg_hr / max_hr
        return round(duration_min * hr_ratio * math.exp(1.92 * hr_ratio), 1)
    return None


# ── Activity sync ─────────────────────────────────────────────────────────────

async def sync_garmin() -> list[dict]:
    """Fetch completed activities from Garmin Connect and upsert to DB."""

    def _fetch() -> list[dict]:
        client = _get_client()
        all_raw: list[dict] = []
        start = 0
        page_size = 100
        while True:
            page = client.get_activities(start, page_size) or []
            all_raw.extend(page)
            if len(page) < page_size:
                break
            start += page_size
        return all_raw

    raw = await asyncio.to_thread(_fetch)

    async with AsyncSessionLocal() as session:
        for item in raw:
            external_id = str(item.get("activityId", ""))
            if not external_id:
                continue

            existing = await session.scalar(
                select(Activity).where(Activity.external_id == external_id)
            )
            tss            = _tss_from_item(item)
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


# ── Calendar / planned workouts ───────────────────────────────────────────────

def _fetch_planned_workouts_sync(start_date: date, end_date: date) -> list[dict]:
    client = _get_client()

    months: set[tuple[int, int]] = set()
    cur = start_date.replace(day=1)
    while cur <= end_date:
        months.add((cur.year, cur.month))
        cur = cur.replace(year=cur.year + 1, month=1) if cur.month == 12 else cur.replace(month=cur.month + 1)

    planned = []
    for year, month in sorted(months):
        data = client.get_scheduled_workouts(year, month) or {}
        for item in data.get("calendarItems", []):
            item_type = (item.get("itemType") or "").lower()
            if item_type not in ("workout", "event"):
                continue
            item_date = (item.get("date") or "")[:10]
            if not item_date or not (start_date.isoformat() <= item_date <= end_date.isoformat()):
                continue
            planned.append({
                "date":        item_date,
                "title":       item.get("title") or "",
                "sport":       item.get("sportTypeKey") or "",
                "description": item.get("location") or "",
                "workout_id":  item.get("workoutId"),
                "item_type":   item_type,
            })

    # Garmin can return the same item in adjacent months' responses — deduplicate
    seen: set[tuple[str, str]] = set()
    deduped: list[dict] = []
    for w in planned:
        key = (w["date"], w["title"] or w["sport"])
        if key not in seen:
            seen.add(key)
            deduped.append(w)
    return deduped


async def get_planned_workouts(weeks_ahead: int = 2, weeks_back: int = 0) -> list[dict]:
    """Return planned workouts from cache, filtered to the requested window."""
    global _planned_cache
    today = date.today()
    start = today - timedelta(weeks=weeks_back)
    end   = today + timedelta(weeks=weeks_ahead)

    now = time.time()
    cache_start = _planned_cache.get("start")
    cache_end   = _planned_cache.get("end")

    if (
        _planned_cache.get("ts")
        and now - _planned_cache["ts"] < _CACHE_TTL
        and cache_start and cache_end
        and cache_start <= start.isoformat()
        and cache_end   >= end.isoformat()
    ):
        return [w for w in _planned_cache["data"] if start.isoformat() <= w["date"] <= end.isoformat()]

    fetch_start = today - timedelta(weeks=max(weeks_back, 4))
    fetch_end   = today + timedelta(weeks=max(weeks_ahead, 8))
    result = await asyncio.to_thread(_fetch_planned_workouts_sync, fetch_start, fetch_end)
    _planned_cache = {"ts": now, "data": result, "start": fetch_start.isoformat(), "end": fetch_end.isoformat()}
    return [w for w in result if start.isoformat() <= w["date"] <= end.isoformat()]


def invalidate_planned_cache() -> None:
    global _planned_cache
    _planned_cache.clear()


# ── Workout detail ────────────────────────────────────────────────────────────

async def get_workout_detail(workout_id: str) -> dict:
    def _fetch():
        client = _get_client()
        # get_workout_by_id returns the full structured workout (steps, targets, zones)
        try:
            return client.get_workout_by_id(workout_id) or {}
        except AttributeError:
            return client.garth.connectapi(f"/workout-service/workout/{workout_id}") or {}
    return await asyncio.to_thread(_fetch)
