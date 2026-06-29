from datetime import datetime
from sqlalchemy import Column, Float, Integer, String, Text, DateTime
from app.models.activity import Base


class UserCalendarEntry(Base):
    """A workout or event added to the Claudius calendar (by AI or user)."""
    __tablename__ = "user_calendar_entries"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    date = Column(String, nullable=False, index=True)  # YYYY-MM-DD
    time_of_day = Column(String, nullable=True)        # HH:MM (24h)
    duration_minutes = Column(Integer, nullable=True)
    sport_type = Column(String, nullable=True, default="other")
    description = Column(Text, nullable=True)
    created_by = Column(String, nullable=False, default="ai")  # "ai" | "user"
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    # Structured race / workout details
    surface_type = Column(String, nullable=True)   # "road" | "trail" | "track" | "indoor"
    distance_km = Column(Float, nullable=True)
    target_pace = Column(String, nullable=True)    # e.g. "3:43/km"
    goal_time = Column(String, nullable=True)      # e.g. "29:47"
