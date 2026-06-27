from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, Text, DateTime, ForeignKey
from app.models.activity import Base


class ConversationEval(Base):
    """LLM-as-judge quality score for one coach reply."""
    __tablename__ = "conversation_evals"

    id               = Column(Integer, primary_key=True, index=True)
    conversation_id  = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    message_id       = Column(Integer, ForeignKey("messages.id",       ondelete="SET NULL"), nullable=True, index=True)

    data_grounding     = Column(Float, nullable=False)  # 0-1: cited real numbers from training data?
    actionability      = Column(Float, nullable=False)  # 0-1: specific actionable advice?
    hallucination_risk = Column(Float, nullable=False)  # 0-1: unsupported claims? higher = worse

    # Pre-computed: 0.35·grounding + 0.40·actionability + 0.25·(1 − hallucination_risk)
    overall_score    = Column(Float, nullable=False)

    judge_model      = Column(String, nullable=False, default="claude-haiku-4-5-20251001")
    judge_reasoning  = Column(Text,   nullable=True)

    created_at       = Column(DateTime, default=datetime.utcnow, nullable=False)
