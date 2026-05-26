import asyncio
from datetime import date, datetime, timedelta

import garth
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.health import DailyHealth


# ---------------------------------------------------------------------------
# Synchronous helpers — all garth I/O happens in a thread via asyncio.to_thread
# ---------------------------------------------------------------------------

def _login() -> str:
    """Login to Garmin Connect and return the user's display name."""
    garth.login(settings.GARMIN_EMAIL, settings.GARMIN_PASSWORD)
    profile = garth.connectapi("/userprofile-service/socialProfile") or {}
    return profile.get("displayName", "")


def _parse_ts_ms(ts_ms: int | None) -> datetime | None:
    if not ts_ms:
        return None
    return datetime.utcfromtimestamp(ts_ms / 1000)


def _fetch_wellness(display_name: str, target: date) -> dict:
    data = garth.connectapi(
        f"/usersummary-service/usersummary/daily/{display_name}",
        params={"calendarDate": target.isoformat()},
    )
    return data or {}


def _fetch_heart_rate(display_name: str, target: date) -> dict:
    data = garth.connectapi(
        f"/wellness-service/wellness/dailyHeartRate/{display_name}",
        params={"date": target.isoformat()},
    )
    return data or {}


def _fetch_hrv(target: date) -> dict:
    data = garth.connectapi(f"/hrv-service/hrv/{target.isoformat()}")
    return data or {}


def _fetch_sleep(display_name: str, target: date) -> dict:
    data = garth.connectapi(
        f"/wellness-service/wellness/dailySleepData/{display_name}",
        params={"date": target.isoformat(), "nonSleepBufferMinutes": 60},
    )
    return data or {}


def _fetch_weight_range(start: date, end: date) -> list[dict]:
    data = garth.connectapi(
        "/weight-service/weight/dateRange",
        params={"startDate": start.isoformat(), "endDate": end.isoformat()},
    )
    return (data or {}).get("dateWeightList", [])


def _fetch_vo2_range(display_name: str, start: date, end: date) -> dict[str, float]:
    try:
        data = garth.connectapi(
            f"/metrics-service/metrics/maxmet/daily/{display_name}",
            params={"startDate": start.isoformat(), "endDate": end.isoformat()},
        )
        result: dict[str, float] = {}
        for entry in (data or []):
            d = entry.get("calendarDate")
            v = entry.get("generic") or entry.get("cycling")
            if d and v is not None:
                result[d] = float(v)
        return result
    except Exception:
        return {}


def _collect_all_days(days: int) -> list[dict]:
    """Fetch all health data for the last `days` days. Runs in a thread."""
    display_name = _login()
    today = date.today()
    start = today - timedelta(days=days - 1)

    weight_by_date: dict[str, dict] = {}
    for entry in _fetch_weight_range(start, today):
        d = entry.get("calendarDate", "")
        if d:
            weight_by_date[d] = entry

    vo2_by_date = _fetch_vo2_range(display_name, start, today)

    results = []
    for i in range(days):
        target = start + timedelta(days=i)
        results.append({
            "date": target,
            "wellness": _fetch_wellness(display_name, target),
            "hr": _fetch_heart_rate(display_name, target),
            "hrv": _fetch_hrv(target),
            "sleep": _fetch_sleep(display_name, target),
            "weight": weight_by_date.get(target.isoformat(), {}),
            "vo2": vo2_by_date.get(target.isoformat()),
        })
    return results


def _parse_sleep_score(sleep_dto: dict) -> int | None:
    score = sleep_dto.get("overallScore")
    if isinstance(score, dict):
        return score.get("value")
    return score


# ---------------------------------------------------------------------------
# Public async API
# ---------------------------------------------------------------------------

async def sync_garmin_health(days: int = 30) -> dict:
    """Fetch last `days` days of Garmin health data and upsert to DB."""
    all_data = await asyncio.to_thread(_collect_all_days, days)

    async with AsyncSessionLocal() as session:
        for item in all_data:
            target: date = item["date"]
            wellness = item["wellness"]
            hr = item["hr"]
            hrv_summary = item["hrv"].get("hrvSummary", {})
            sleep_dto = item["sleep"].get("dailySleepDTO", {})
            weight = item["weight"]

            existing = await session.scalar(
                select(DailyHealth).where(DailyHealth.date == target)
            )
            record = existing or DailyHealth(date=target)

            # Wellness
            record.total_steps = wellness.get("totalSteps")
            record.active_calories = wellness.get("activeKilocalories")
            record.total_calories = wellness.get("totalKilocalories")
            record.floors_ascended = wellness.get("floorsAscended")
            record.avg_stress = wellness.get("averageStressLevel")
            record.max_stress = wellness.get("maxStressLevel")
            record.body_battery_high = (
                wellness.get("highestBodyBattery") or wellness.get("bodyBatteryHighestValue")
            )
            record.body_battery_low = (
                wellness.get("lowestBodyBattery") or wellness.get("bodyBatteryLowestValue")
            )

            # Heart rate
            record.resting_hr = hr.get("restingHeartRate")
            record.max_hr = hr.get("maxHeartRate")
            record.min_hr = hr.get("minHeartRate")

            # HRV
            record.avg_hrv = hrv_summary.get("lastNight") or hrv_summary.get("weeklyAvg")
            record.hrv_status = hrv_summary.get("status")

            # Sleep
            record.sleep_score = _parse_sleep_score(sleep_dto)
            record.sleep_start = _parse_ts_ms(sleep_dto.get("sleepStartTimestampGMT"))
            record.sleep_end = _parse_ts_ms(sleep_dto.get("sleepEndTimestampGMT"))
            record.sleep_duration_seconds = sleep_dto.get("sleepTimeSeconds")
            record.deep_sleep_seconds = sleep_dto.get("deepSleepSeconds")
            record.light_sleep_seconds = sleep_dto.get("lightSleepSeconds")
            record.rem_sleep_seconds = sleep_dto.get("remSleepSeconds")
            record.awake_seconds = sleep_dto.get("awakeSleepSeconds")
            record.avg_spo2 = (
                sleep_dto.get("averageSpO2Value") or sleep_dto.get("avgSpo2") or sleep_dto.get("averageSPO2Value")
            )

            # Weight
            record.weight_grams = weight.get("weight")
            record.body_fat_pct = weight.get("bodyFat")
            record.bmi = weight.get("bmi")

            # VO2 max
            record.vo2_max = item["vo2"]

            if not existing:
                session.add(record)

        await session.commit()

    return {"synced_days": len(all_data)}


async def get_latest_health() -> dict:
    """Return the most recent daily health record as a plain dict."""
    async with AsyncSessionLocal() as session:
        record = await session.scalar(
            select(DailyHealth).order_by(DailyHealth.date.desc())
        )
    if not record:
        return {}
    return {c.name: getattr(record, c.name) for c in DailyHealth.__table__.columns}
