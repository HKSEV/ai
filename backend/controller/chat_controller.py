from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from config.database import get_db
from dto.chat import ChatRequest
from entity.models import Conversation
from service.auth_service import current_user
from service.chat_service import chat, serialize_conversation
from service.common import owned, page_result, timestamp


router = APIRouter(tags=["explore"])


@router.post("/api/chat")
def send_message(data: ChatRequest, user=Depends(current_user), db=Depends(get_db)):
  return chat(db, user, data)


@router.get("/api/conversations")
def list_conversations(page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=50), user=Depends(current_user), db=Depends(get_db)):
  query = select(Conversation).where(Conversation.user_id == user.id)
  total = db.scalar(select(func.count()).select_from(query.subquery()))
  rows = db.scalars(query.order_by(Conversation.updated_at.desc(), Conversation.id.desc()).offset((page - 1) * size).limit(size)).all()
  return page_result([{"id": row.id, "title": row.title, "conditions": row.conditions, "updated_at": timestamp(row.updated_at)} for row in rows], total, page, size)


@router.get("/api/conversations/{identity}")
def detail(identity: int, user=Depends(current_user), db=Depends(get_db)):
  return serialize_conversation(db, owned(db, Conversation, identity, user.id))


@router.delete("/api/conversations/{identity}", status_code=204)
def delete_conversation(identity: int, user=Depends(current_user), db=Depends(get_db)):
  db.delete(owned(db, Conversation, identity, user.id))
  db.commit()
