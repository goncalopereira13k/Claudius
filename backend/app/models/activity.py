from sqlalchemy import Column, Integer, String, Float, DateTime, Enum as SAEnum
from sqlalchemy.orm import DeclarativeBase
import enum


class Base(DeclarativeBase):
    pass


class Source(str, enum.Enum):
    garmin = "garmin"
    strava = "strava"


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String, unique=True, index=True)
    source = Column(SAEnum(Source), nullable=False)
    name = Column(String, default="")
    sport_type = Column(String, default="")
    start_date = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, default=0)
    distance_meters = Column(Float, default=0.0)
    avg_hr = Column(Integer, nullable=True)
    avg_power = Column(Integer, nullable=True)
    tss = Column(Float, nullable=True)
    training_effect = Column(Float, nullable=True)
    description = Column(String, default="")

    # Extended metrics (from Garmin activity list)
    norm_power      = Column(Float,   nullable=True)   # NP — Normalized Power (W)
    elevation_gain  = Column(Float,   nullable=True)   # metres
    elevation_loss  = Column(Float,   nullable=True)   # metres
    calories        = Column(Integer, nullable=True)
    avg_cadence     = Column(Integer, nullable=True)   # spm (run) or rpm (bike)
    avg_speed       = Column(Float,   nullable=True)   # m/s
    max_hr          = Column(Integer, nullable=True)
