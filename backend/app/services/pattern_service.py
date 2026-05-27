"""Detect statistical patterns in training and health data and cache them in the DB."""
import logging
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

import numpy as np

from app.models.activity import Activity
from app.models.health import DailyHealth
from app.models.memory import TrainingPattern

log = logging.getLogger("claudius")


async def _get_fresh_pattern(pattern_type: str, db: AsyncSession) -> TrainingPattern | None:
    """Return an existing non-expired pattern, or None if it needs re-detection."""
    result = await db.execute(
        select(TrainingPattern).where(TrainingPattern.pattern_type == pattern_type)
    )
    existing = result.scalar_one_or_none()
    if existing is None:
        return None
    if existing.expires_at is not None and existing.expires_at < datetime.utcnow():
        await db.delete(existing)
        await db.flush()
        return None
    return existing


async def _upsert_pattern(pattern_type: str, pattern: TrainingPattern | None, db: AsyncSession) -> None:
    if pattern is None:
        return
    # Delete any old record of this type (may be stale/expired)
    await db.execute(delete(TrainingPattern).where(TrainingPattern.pattern_type == pattern_type))
    db.add(pattern)
    await db.flush()


async def _detect_sleep_performance(db: AsyncSession) -> TrainingPattern | None:
    """Pearson r between sleep score and next-day running HR (28 days)."""
    since = datetime.utcnow() - timedelta(days=28)

    health_rows = (await db.execute(
        select(DailyHealth)
        .where(DailyHealth.date >= since.date())
        .order_by(DailyHealth.date)
    )).scalars().all()

    act_rows = (await db.execute(
        select(Activity)
        .where(Activity.start_date >= since)
        .where(Activity.sport_type.ilike("%run%"))
        .where(Activity.avg_hr.is_not(None))
    )).scalars().all()

    health_by_date = {h.date.isoformat(): h for h in health_rows if h.sleep_score}
    act_by_date = {}
    for a in act_rows:
        d = a.start_date.date().isoformat()
        if a.avg_hr:
            act_by_date.setdefault(d, []).append(a.avg_hr)

    sleep_scores, next_day_hr = [], []
    for h_date, h in health_by_date.items():
        dt = datetime.fromisoformat(h_date) + timedelta(days=1)
        next_date = dt.date().isoformat()
        if next_date in act_by_date:
            sleep_scores.append(h.sleep_score)
            next_day_hr.append(np.mean(act_by_date[next_date]))

    if len(sleep_scores) < 7:
        return None

    r = float(np.corrcoef(sleep_scores, next_day_hr)[0, 1])
    if abs(r) < 0.3:
        return None

    direction = "Better sleep → lower running HR" if r < 0 else "Higher sleep score → higher running HR (unusual)"
    description = (
        f"Sleep quality correlates with next-day running HR "
        f"(r={r:.2f} over {len(sleep_scores)} data points). {direction}."
    )
    return TrainingPattern(
        pattern_type="sleep_performance",
        description=description,
        data_summary={"n_pairs": len(sleep_scores), "pearson_r": round(r, 3)},
        confidence_score=min(abs(r), 1.0),
        expires_at=datetime.utcnow() + timedelta(days=7),
    )


async def _detect_hrv_trend(db: AsyncSession) -> TrainingPattern | None:
    """Linear regression on HRV over 21 days to detect improving/declining trend."""
    since = datetime.utcnow() - timedelta(days=21)
    rows = (await db.execute(
        select(DailyHealth)
        .where(DailyHealth.date >= since.date())
        .where(DailyHealth.avg_hrv.is_not(None))
        .order_by(DailyHealth.date)
    )).scalars().all()

    if len(rows) < 7:
        return None

    hrv_values = np.array([r.avg_hrv for r in rows], dtype=float)
    x = np.arange(len(hrv_values))
    slope, intercept = np.polyfit(x, hrv_values, 1)
    residuals = hrv_values - (slope * x + intercept)
    ss_res = np.sum(residuals ** 2)
    ss_tot = np.sum((hrv_values - hrv_values.mean()) ** 2)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

    if abs(slope) < 0.2:
        return None

    trend = "improving" if slope > 0 else "declining"
    action = "" if slope > 0 else " Consider reducing training intensity."
    description = (
        f"HRV {trend} {abs(slope):.1f}ms/day over last {len(rows)} days "
        f"(R²={r2:.2f}, mean={hrv_values.mean():.0f}ms).{action}"
    )
    return TrainingPattern(
        pattern_type="hrv_trend",
        description=description,
        data_summary={"slope_ms_per_day": round(float(slope), 2), "r2": round(float(r2), 3), "n_days": len(rows)},
        confidence_score=min(float(r2), 1.0),
        expires_at=datetime.utcnow() + timedelta(days=3),
    )


async def _detect_training_load_trend(db: AsyncSession) -> TrainingPattern | None:
    """Compare TSS/duration in the last 2 weeks vs prior 2 weeks."""
    now = datetime.utcnow()
    two_weeks_ago = now - timedelta(days=14)
    four_weeks_ago = now - timedelta(days=28)

    recent_rows = (await db.execute(
        select(Activity).where(Activity.start_date >= two_weeks_ago)
    )).scalars().all()
    prior_rows = (await db.execute(
        select(Activity)
        .where(Activity.start_date >= four_weeks_ago)
        .where(Activity.start_date < two_weeks_ago)
    )).scalars().all()

    if len(recent_rows) < 3 or len(prior_rows) < 3:
        return None

    def _week_load(rows):
        tss_vals = [r.tss for r in rows if r.tss]
        dur_vals = [r.duration_seconds / 60 for r in rows if r.duration_seconds]
        if tss_vals:
            return sum(tss_vals)
        return sum(dur_vals) if dur_vals else 0

    recent_load = _week_load(recent_rows)
    prior_load = _week_load(prior_rows)
    if prior_load == 0:
        return None

    pct_change = (recent_load - prior_load) / prior_load * 100
    if abs(pct_change) < 10:
        return None

    unit = "TSS" if any(r.tss for r in recent_rows) else "training minutes"
    direction = "increased" if pct_change > 0 else "decreased"
    warning = " Risk of overtraining — consider a recovery week." if pct_change > 30 else ""
    description = (
        f"Training load {direction} {abs(pct_change):.0f}% in the last 2 weeks "
        f"vs prior 2 weeks ({recent_load:.0f} vs {prior_load:.0f} {unit}).{warning}"
    )
    return TrainingPattern(
        pattern_type="training_load_trend",
        description=description,
        data_summary={"recent": round(recent_load, 1), "prior": round(prior_load, 1), "pct_change": round(pct_change, 1)},
        confidence_score=min(abs(pct_change) / 50, 1.0),
        expires_at=datetime.utcnow() + timedelta(days=7),
    )


async def _detect_dow_performance(db: AsyncSession) -> TrainingPattern | None:
    """Average TSS per weekday to find best/worst training days."""
    rows = (await db.execute(
        select(Activity).where(Activity.tss.is_not(None))
    )).scalars().all()

    if len(rows) < 14:
        return None

    dow_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    tss_by_dow: dict[int, list[float]] = {i: [] for i in range(7)}
    for a in rows:
        if a.start_date:
            tss_by_dow[a.start_date.weekday()].append(a.tss)

    avg_by_dow = {d: np.mean(v) for d, v in tss_by_dow.items() if len(v) >= 2}
    if len(avg_by_dow) < 3:
        return None

    best_dow = max(avg_by_dow, key=avg_by_dow.get)
    worst_dow = min(avg_by_dow, key=avg_by_dow.get)
    description = (
        f"Best training days: {dow_names[best_dow]} (avg TSS {avg_by_dow[best_dow]:.0f}). "
        f"Lowest load: {dow_names[worst_dow]} (avg TSS {avg_by_dow[worst_dow]:.0f})."
    )
    return TrainingPattern(
        pattern_type="dow_performance",
        description=description,
        data_summary={dow_names[d]: round(float(v), 1) for d, v in avg_by_dow.items()},
        confidence_score=0.7,
        expires_at=datetime.utcnow() + timedelta(days=14),
    )


async def _detect_recovery_patterns(db: AsyncSession) -> TrainingPattern | None:
    """Mean recovery gap between hard efforts (TSS > 80)."""
    rows = (await db.execute(
        select(Activity)
        .where(Activity.tss.is_not(None))
        .where(Activity.start_date.is_not(None))
        .order_by(Activity.start_date)
    )).scalars().all()

    hard_efforts = [a for a in rows if a.tss and a.tss > 80]
    if len(hard_efforts) < 4:
        return None

    gaps_hours = []
    for i in range(1, len(hard_efforts)):
        gap = hard_efforts[i].start_date - hard_efforts[i - 1].start_date
        gaps_hours.append(gap.total_seconds() / 3600)

    if not gaps_hours:
        return None

    mean_gap = float(np.mean(gaps_hours))
    description = (
        f"Average gap between hard efforts (TSS>80): {mean_gap:.0f}h "
        f"(based on {len(hard_efforts)} sessions)."
    )
    return TrainingPattern(
        pattern_type="recovery_patterns",
        description=description,
        data_summary={"mean_gap_hours": round(mean_gap, 1), "n_hard_efforts": len(hard_efforts)},
        confidence_score=min(len(hard_efforts) / 10, 1.0),
        expires_at=datetime.utcnow() + timedelta(days=7),
    )


_DETECTORS = [
    ("sleep_performance", _detect_sleep_performance),
    ("hrv_trend", _detect_hrv_trend),
    ("training_load_trend", _detect_training_load_trend),
    ("dow_performance", _detect_dow_performance),
    ("recovery_patterns", _detect_recovery_patterns),
]


async def detect_patterns(db: AsyncSession) -> list[TrainingPattern]:
    """Run all pattern detectors and persist new/refreshed patterns."""
    results = []
    for pattern_type, detector in _DETECTORS:
        try:
            if await _get_fresh_pattern(pattern_type, db) is not None:
                continue  # still fresh, skip
            pattern = await detector(db)
            await _upsert_pattern(pattern_type, pattern, db)
            if pattern:
                results.append(pattern)
                log.info("Pattern detected: %s", pattern_type)
        except Exception as e:
            log.warning("Pattern detector %s failed: %s", pattern_type, e)

    await db.commit()
    return results


async def get_pattern_context(db: AsyncSession) -> str:
    """Return a formatted block of all current non-expired patterns."""
    result = await db.execute(select(TrainingPattern))
    all_patterns = result.scalars().all()
    now = datetime.utcnow()
    active = [p for p in all_patterns if p.expires_at is None or p.expires_at > now]

    if not active:
        return ""

    lines = ["Detected training patterns:"]
    for p in sorted(active, key=lambda x: x.detected_at, reverse=True):
        lines.append(f"- [{p.pattern_type}] {p.description}")
    return "\n".join(lines)
