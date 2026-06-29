from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.calendar_entry import UserCalendarEntry

router = APIRouter()


class EntryCreate(BaseModel):
    title: str
    date: str
    time_of_day: str | None = None
    duration_minutes: int | None = None
    sport_type: str | None = "other"
    description: str | None = None
    created_by: str = "user"
    surface_type: str | None = None
    distance_km: float | None = None
    target_pace: str | None = None
    goal_time: str | None = None


class EntryOut(BaseModel):
    id: int
    title: str
    date: str
    time_of_day: str | None
    duration_minutes: int | None
    sport_type: str | None
    description: str | None
    created_by: str
    created_at: str
    surface_type: str | None = None
    distance_km: float | None = None
    target_pace: str | None = None
    goal_time: str | None = None

    class Config:
        from_attributes = True


@router.get("/entries", response_model=list[EntryOut])
async def list_entries(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserCalendarEntry).order_by(UserCalendarEntry.date))
    entries = result.scalars().all()
    return [
        EntryOut(
            id=e.id, title=e.title, date=e.date, time_of_day=e.time_of_day,
            duration_minutes=e.duration_minutes, sport_type=e.sport_type,
            description=e.description, created_by=e.created_by,
            created_at=e.created_at.isoformat(),
            surface_type=e.surface_type, distance_km=e.distance_km,
            target_pace=e.target_pace, goal_time=e.goal_time,
        )
        for e in entries
    ]


@router.post("/entries", response_model=EntryOut)
async def create_entry(data: EntryCreate, db: AsyncSession = Depends(get_db)):
    entry = UserCalendarEntry(**data.model_dump())
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return EntryOut(
        id=entry.id, title=entry.title, date=entry.date, time_of_day=entry.time_of_day,
        duration_minutes=entry.duration_minutes, sport_type=entry.sport_type,
        description=entry.description, created_by=entry.created_by,
        created_at=entry.created_at.isoformat(),
        surface_type=entry.surface_type, distance_km=entry.distance_km,
        target_pace=entry.target_pace, goal_time=entry.goal_time,
    )


@router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: int, db: AsyncSession = Depends(get_db)):
    entry = await db.get(UserCalendarEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.delete(entry)
    await db.commit()
    return {"deleted": entry_id}
