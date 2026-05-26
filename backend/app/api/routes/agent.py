from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.agents.claude_agent import chat
from app.agents.context import build_training_context
from app.core.database import get_db

router = APIRouter()


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    context = await build_training_context(db)
    reply = await chat(req.message, context)
    return ChatResponse(reply=reply)
