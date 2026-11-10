from fastapi import APIRouter

from dto.chat import ChatRequest, ChatResponse
from service.chat_service import get_chat_response


router = APIRouter()


@router.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
  return await get_chat_response(request.message)
