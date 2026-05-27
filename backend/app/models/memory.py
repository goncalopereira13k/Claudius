import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean,
    DateTime, ForeignKey, Enum as SAEnum, JSON,
)
from pgvector.sqlalchemy import Vector
from app.models.activity import Base


class MemoryCategory(str, enum.Enum):
    goal = "goal"
    preference = "preference"
    fact = "fact"
    pattern = "pattern"
    feedback = "feedback"


class UserMemory(Base):
    """A single fact/preference/goal extracted from a conversation."""
    __tablename__ = "user_memories"

    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    category = Column(SAEnum(MemoryCategory), nullable=False)
    source_type = Column(String, nullable=False)  # "conversation" | "pattern_detection"
    source_conversation_id = Column(
        Integer,
        ForeignKey("conversations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    embedding = Column(Vector(384), nullable=True)
    importance_score = Column(Float, default=0.5, nullable=False)
    access_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class TrainingPattern(Base):
    """A statistical pattern detected from activity/health data."""
    __tablename__ = "training_patterns"

    id = Column(Integer, primary_key=True, index=True)
    pattern_type = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=False)
    data_summary = Column(JSON, nullable=True)
    confidence_score = Column(Float, nullable=False, default=0.0)
    detected_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)  # null = never expires


class CoachingSuggestion(Base):
    """An actionable coaching suggestion and whether the athlete followed it."""
    __tablename__ = "coaching_suggestions"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    suggestion_text = Column(Text, nullable=False)
    suggestion_embedding = Column(Vector(384), nullable=True)
    was_followed = Column(Boolean, nullable=True)  # None=unknown, True/False=determined
    outcome_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
