from typing import List

from pydantic import BaseModel


class ChatRequest(BaseModel):
  message: str
  # 사용자가 입력한 채팅 메세지를 받는 필드 str은 문자열 텍스트 타입

class PlaceInfo(BaseModel):
  name: str
  category: str
  address: str
  lat: float
  lng: float
  is_registered: bool
  description: str

class ChatResponse(BaseModel):
  reply: str
  # 프론트엔드가 지도를 화면에 띄울지 말지 결정하는 상태값
  show_map: bool = False
  places: List[PlaceInfo] = []
