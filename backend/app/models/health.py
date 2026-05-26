from datetime import date, datetime
from sqlalchemy import Column, Integer, String, Float, Date, DateTime
from app.models.activity import Base


class DailyHealth(Base):
    __tablename__ = "daily_health"

    id = Column(Integer, primary_key=True)
    date = Column(Date, unique=True, index=True, nullable=False)

    # Daily wellness / steps
    total_steps = Column(Integer, nullable=True)
    active_calories = Column(Integer, nullable=True)
    total_calories = Column(Integer, nullable=True)
    floors_ascended = Column(Integer, nullable=True)
    avg_stress = Column(Integer, nullable=True)
    max_stress = Column(Integer, nullable=True)
    body_battery_high = Column(Integer, nullable=True)
    body_battery_low = Column(Integer, nullable=True)

    # Heart rate
    resting_hr = Column(Integer, nullable=True)
    max_hr = Column(Integer, nullable=True)
    min_hr = Column(Integer, nullable=True)

    # HRV
    avg_hrv = Column(Float, nullable=True)
    hrv_status = Column(String, nullable=True)

    # Sleep
    sleep_score = Column(Integer, nullable=True)
    sleep_start = Column(DateTime, nullable=True)
    sleep_end = Column(DateTime, nullable=True)
    sleep_duration_seconds = Column(Integer, nullable=True)
    deep_sleep_seconds = Column(Integer, nullable=True)
    light_sleep_seconds = Column(Integer, nullable=True)
    rem_sleep_seconds = Column(Integer, nullable=True)
    awake_seconds = Column(Integer, nullable=True)
    avg_spo2 = Column(Float, nullable=True)

    # Weight / body composition
    weight_grams = Column(Integer, nullable=True)
    body_fat_pct = Column(Float, nullable=True)
    bmi = Column(Float, nullable=True)

    # VO2 max (running, from maxmet service)
    vo2_max = Column(Float, nullable=True)
