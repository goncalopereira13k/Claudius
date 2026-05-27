import asyncio
from datetime import date, datetime, timedelta

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.health import DailyHealth
from app.services.garmin import _get_client


# ── Synchronous helpers (run in thread) ──────────────────────────────────────

def _parse_ts_ms(ts_ms: int | None) -> datetime | None:
    if not ts_ms:
        return None
    return datetime.utcfromtimestamp(ts_ms / 1000)


def _parse_sleep_score(sleep_dto: dict) -> int | None:
    score = sleep_dto.get("overallScore")
    if isinstance(score, dict):
        return score.get("value")
    return score


def _collect_all_days(days: int) -> list[dict]:
    """Fetch all health data for the last `days` days. Runs in a thread."""
    client = _get_client()
    today  = date.today()
    start  = today - timedelta(days=days - 1)

    # Bulk fetches (one call covers the whole range)
    weight_by_date: dict[str, dict] = {}
    try:
        body_comp = client.get_body_composition(start.isoformat(), today.isoformat()) or {}
        for entry in body_comp.get("dateWeightList", []):
            d = entry.get("calendarDate", "")
            if d:
                weight_by_date[d] = entry
    except Exception:
        pass

    vo2_by_date: dict[str, float] = {}
    try:
        vo2_data = client.get_max_metrics(start.isoformat()) or []
        for entry in (vo2_data if isinstance(vo2_data, list) else []):
            d = entry.get("calendarDate")
            v = entry.get("generic") or entry.get("cycling")
            if d and v is not None:
                vo2_by_date[d] = float(v)
    except Exception:
        pass

    results = []
    for i in range(days):
        target = start + timedelta(days=i)
        cdate  = target.isoformat()

        wellness, hr, hrv, sleep = {}, {}, {}, {}
        try:
            wellness = client.get_stats(cdate) or {}
        except Exception:
            pass
        try:
            hr = client.get_heart_rates(cdate) or {}
        except Exception:
            pass
        try:
            hrv = client.get_hrv_data(cdate) or {}
        except Exception:
            pass
        try:
            sleep = client.get_sleep_data(cdate) or {}
        except Exception:
            pass

        results.append({
            "date":    target,
            "wellness": wellness,
            "hr":      hr,
            "hrv":     hrv,
            "sleep":   sleep,
            "weight":  weight_by_date.get(cdate, {}),
            "vo2":     vo2_by_date.get(cdate),
        })

    return results


# ── Public async API ──────────────────────────────────────────────────────────

async def sync_garmin_health(days: int = 30) -> dict:
    """Fetch last `days` days of Garmin health data and upsert to DB."""
    all_data = await asyncio.to_thread(_collect_all_days, days)

    async with AsyncSessionLocal() as session:
        for item in all_data:
            target:   date = item["date"]
            wellness       = item["wellness"]
            hr             = item["hr"]
            hrv_summary    = item["hrv"].get("hrvSummary", {})
            sleep_dto      = item["sleep"].get("dailySleepDTO", {})
            weight         = item["weight"]

            existing = await session.scalar(
                select(DailyHealth).where(DailyHealth.date == target)
            )
            record = existing or DailyHealth(date=target)

            # Wellness
            record.total_steps      = wellness.get("totalSteps")
            record.active_calories  = wellness.get("activeKilocalories")
            record.total_calories   = wellness.get("totalKilocalories")
            record.floors_ascended  = wellness.get("floorsAscended")
            record.avg_stress       = wellness.get("averageStressLevel")
            record.max_stress       = wellness.get("maxStressLevel")
            record.body_battery_high = (
                wellness.get("highestBodyBattery") or wellness.get("bodyBatteryHighestValue")
            )
            record.body_battery_low = (
                wellness.get("lowestBodyBattery") or wellness.get("bodyBatteryLowestValue")
            )

            # Heart rate
            record.resting_hr = hr.get("restingHeartRate")
            record.max_hr     = hr.get("maxHeartRate")
            record.min_hr     = hr.get("minHeartRate")

            # HRV
            record.avg_hrv    = hrv_summary.get("lastNight") or hrv_summary.get("weeklyAvg")
            record.hrv_status = hrv_summary.get("status")

            # Sleep
            record.sleep_score           = _parse_sleep_score(sleep_dto)
            record.sleep_start           = _parse_ts_ms(sleep_dto.get("sleepStartTimestampGMT"))
            record.sleep_end             = _parse_ts_ms(sleep_dto.get("sleepEndTimestampGMT"))
            record.sleep_duration_seconds = sleep_dto.get("sleepTimeSeconds")
            record.deep_sleep_seconds    = sleep_dto.get("deepSleepSeconds")
            record.light_sleep_seconds   = sleep_dto.get("lightSleepSeconds")
            record.rem_sleep_seconds     = sleep_dto.get("remSleepSeconds")
            record.awake_seconds         = sleep_dto.get("awakeSleepSeconds")
            record.avg_spo2 = (
                sleep_dto.get("averageSpO2Value")
                or sleep_dto.get("avgSpo2")
                or sleep_dto.get("averageSPO2Value")
            )

            # Weight / body composition
            record.weight_grams  = weight.get("weight")
            record.body_fat_pct  = weight.get("bodyFat")
            record.bmi           = weight.get("bmi")

            # VO2 max
            record.vo2_max = item["vo2"]

            if not existing:
                session.add(record)

        await session.commit()

    return {"synced_days": len(all_data)}


async def get_latest_health() -> dict:
    async with AsyncSessionLocal() as session:
        record = await session.scalar(
            select(DailyHealth).order_by(DailyHealth.date.desc())
        )
    if not record:
        return {}
    return {c.name: getattr(record, c.name) for c in DailyHealth.__table__.columns}
