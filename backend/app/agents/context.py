from datetime import date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.activity import Activity
from app.models.health import DailyHealth


def _pace_str(avg_speed_ms: float) -> str:
    if not avg_speed_ms or avg_speed_ms <= 0:
        return ""
    sec_per_km = 1000 / avg_speed_ms
    return f"{int(sec_per_km // 60)}:{int(sec_per_km % 60):02d}/km"


async def build_training_context(db: AsyncSession) -> str:
    today = date.today()

    act_rows = (await db.execute(
        select(Activity).order_by(Activity.start_date.desc()).limit(10)
    )).scalars().all()

    health_rows = (await db.execute(
        select(DailyHealth).order_by(DailyHealth.date.desc()).limit(7)
    )).scalars().all()

    planned = []
    try:
        from app.services.garmin import get_planned_workouts
        planned = await get_planned_workouts(weeks_ahead=2, weeks_back=2)
    except Exception:
        pass

    # Build date-keyed lookup of completed activities for plan-vs-actual matching
    activities_by_date: dict[str, list] = {}
    for a in act_rows:
        if a.start_date:
            activities_by_date.setdefault(a.start_date.date().isoformat(), []).append(a)

    past_planned = sorted([w for w in planned if w["date"] < today.isoformat()], key=lambda x: x["date"])
    upcoming = [w for w in planned if w["date"] >= today.isoformat()]

    lines = [f"Today: {today.isoformat()}"]

    if not act_rows and not health_rows:
        lines.append("\nNo training data found in database. Tell the user to trigger a sync from the Dashboard before asking coaching questions.")

    if act_rows:
        lines.append("\nRecent activities (last 10):")
        for a in act_rows:
            dist = f"{a.distance_meters / 1000:.1f}km" if a.distance_meters else "—"
            dur = f"{int(a.duration_seconds // 60)}min" if a.duration_seconds else "—"
            day = a.start_date.date() if a.start_date else "?"
            parts = [f"  {day}", a.sport_type or "?", dist, dur]
            if a.avg_hr:
                hr = f"HR:{a.avg_hr}"
                if a.max_hr:
                    hr += f"/{a.max_hr}"
                parts.append(hr)
            if a.avg_speed and a.sport_type and "run" in a.sport_type.lower():
                parts.append(f"pace:{_pace_str(a.avg_speed)}")
            if a.norm_power:
                parts.append(f"NP:{a.norm_power:.0f}W")
            elif a.avg_power:
                parts.append(f"power:{a.avg_power}W")
            if a.tss:
                parts.append(f"TSS:{a.tss:.0f}")
            if a.elevation_gain:
                parts.append(f"elev:{a.elevation_gain:.0f}m")
            lines.append("  ".join(parts))

    if health_rows:
        lines.append("\nHealth & recovery (last 7 days):")
        for h in health_rows:
            parts = [f"  {h.date}"]
            if h.resting_hr:
                parts.append(f"RHR:{h.resting_hr}bpm")
            if h.avg_hrv:
                hrv = f"HRV:{h.avg_hrv:.0f}ms"
                if h.hrv_status:
                    hrv += f"({h.hrv_status})"
                parts.append(hrv)
            if h.sleep_duration_seconds:
                sl = f"sleep:{h.sleep_duration_seconds / 3600:.1f}h"
                if h.sleep_score:
                    sl += f"(score:{h.sleep_score})"
                if h.deep_sleep_seconds:
                    sl += f" deep:{h.deep_sleep_seconds / 3600:.1f}h"
                parts.append(sl)
            if h.body_battery_high is not None:
                parts.append(f"battery:{h.body_battery_low}-{h.body_battery_high}")
            if h.avg_stress:
                parts.append(f"stress:{h.avg_stress}")
            if h.total_steps:
                parts.append(f"steps:{h.total_steps:,}")
            if h.vo2_max:
                parts.append(f"VO2max:{h.vo2_max:.1f}")
            if h.weight_grams:
                parts.append(f"weight:{h.weight_grams / 1000:.1f}kg")
            lines.append("  ".join(parts))

    if past_planned:
        lines.append("\nPlan vs actual (last 2 weeks) — PLAN is what was scheduled, ACTUAL is what was completed:")
        for w in past_planned:
            sport = w.get("sport", "")
            title = w.get("title", "")
            matches = activities_by_date.get(w["date"], [])
            if matches:
                for a in matches:
                    dist = f"{a.distance_meters / 1000:.1f}km" if a.distance_meters else "—"
                    dur = f"{int(a.duration_seconds // 60)}min" if a.duration_seconds else "—"
                    actual_parts = [dist, dur]
                    if a.avg_hr:
                        actual_parts.append(f"HR:{a.avg_hr}")
                    if a.tss:
                        actual_parts.append(f"TSS:{a.tss:.0f}")
                    if a.norm_power:
                        actual_parts.append(f"NP:{a.norm_power:.0f}W")
                    lines.append(
                        f"  {w['date']}  {sport}  PLAN:\"{title}\"  →  ACTUAL: {' '.join(actual_parts)}"
                    )
            else:
                lines.append(f"  {w['date']}  {sport}  PLAN:\"{title}\"  →  NOT DONE")

    if upcoming:
        lines.append("\nUpcoming workouts (next 2 weeks):")
        for w in upcoming:
            lines.append(f"  {w.get('date')}  {w.get('sport', '')}  {w.get('title', '')}")

    # Append learned memories and detected patterns (failures are non-fatal)
    try:
        from app.services.memory_service import get_memory_context
        memory_block = await get_memory_context(db)
        if memory_block:
            lines.append(f"\n{memory_block}")
    except Exception:
        pass

    try:
        from app.services.pattern_service import get_pattern_context
        pattern_block = await get_pattern_context(db)
        if pattern_block:
            lines.append(f"\n{pattern_block}")
    except Exception:
        pass

    return "\n".join(lines)
