from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.core.database import get_db
from app.models.memory import UserMemory, TrainingPattern, CoachingSuggestion

router = APIRouter()


@router.get("/list")
async def list_memories(limit: int = 50, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserMemory).order_by(UserMemory.importance_score.desc()).limit(limit)
    )
    memories = result.scalars().all()
    return [
        {
            "id": m.id,
            "content": m.content,
            "category": m.category.value,
            "importance_score": m.importance_score,
            "access_count": m.access_count,
            "created_at": m.created_at.isoformat(),
        }
        for m in memories
    ]


@router.delete("/{memory_id}")
async def delete_memory(memory_id: int, db: AsyncSession = Depends(get_db)):
    mem = await db.get(UserMemory, memory_id)
    if not mem:
        raise HTTPException(status_code=404, detail="Memory not found")
    await db.delete(mem)
    await db.commit()
    return {"deleted": memory_id}


@router.get("/patterns")
async def list_patterns(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TrainingPattern))
    all_patterns = result.scalars().all()
    now = datetime.utcnow()
    active = [p for p in all_patterns if p.expires_at is None or p.expires_at > now]
    return [
        {
            "id": p.id,
            "pattern_type": p.pattern_type,
            "description": p.description,
            "data_summary": p.data_summary,
            "confidence_score": p.confidence_score,
            "detected_at": p.detected_at.isoformat(),
            "expires_at": p.expires_at.isoformat() if p.expires_at else None,
        }
        for p in sorted(active, key=lambda x: x.detected_at, reverse=True)
    ]


@router.get("/suggestions")
async def list_suggestions(limit: int = 20, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CoachingSuggestion).order_by(CoachingSuggestion.created_at.desc()).limit(limit)
    )
    suggestions = result.scalars().all()
    return [
        {
            "id": s.id,
            "suggestion_text": s.suggestion_text,
            "was_followed": s.was_followed,
            "outcome_notes": s.outcome_notes,
            "created_at": s.created_at.isoformat(),
        }
        for s in suggestions
    ]
