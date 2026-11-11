import json
import re
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from google.genai import types
from sqlalchemy import func, select

from config.gemini import CONDITION_PROMPT, RANKING_PROMPT, get_client
from config.settings import settings
from dto.chat import RecommendationResult, SearchConditions
from entity.models import Address, Conversation, Message, Post, Restaurant, SearchRecord, Visit, utcnow
from service.common import owned, timestamp
from service.restaurant_service import find_candidates


DISTANCE = r"(\d+(?:,\d{3})*(?:\.\d+)?)\s*(km|㎞|킬로(?:미터)?|m|미터)"
CURRENT_LOCATION = re.compile(r"(?:내|제|현재|현)\s*위치|(?:내|제)\s*주변")


def requested_radius(message):
  match = (
    re.search(rf"반경\s*(?:약\s*)?{DISTANCE}", message, re.IGNORECASE)
    or re.search(rf"(?<![\d.,-]){DISTANCE}\s*(?:이내|안|내(?:\b|에서)|반경|범위)", message, re.IGNORECASE)
  )
  if not match:
    return None
  value, unit = match.groups()
  metres = Decimal(value.replace(",", "")) * (1000 if unit.lower() in {"km", "㎞", "킬로", "킬로미터"} else 1)
  if not 1 <= metres <= 20000000:
    raise HTTPException(422, "검색 반경은 1m 이상으로 입력해 주세요.")
  return int(metres)


def generate_structured(client, prompt, data, schema):
  try:
    response = client.models.generate_content(
      model=settings.gemini_model,
      contents=json.dumps(data, ensure_ascii=False),
      config=types.GenerateContentConfig(
        system_instruction=prompt, response_mime_type="application/json",
        response_json_schema=schema.model_json_schema(), temperature=0.2,
      ),
    )
    return schema.model_validate_json(response.text)
  except Exception:
    raise HTTPException(502, "AI 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.") from None


def serialize_conversation(db, conversation):
  messages = db.scalars(select(Message).where(Message.conversation_id == conversation.id).order_by(Message.id)).all()
  return {
    "id": conversation.id, "title": conversation.title, "conditions": conversation.conditions,
    "created_at": timestamp(conversation.created_at), "updated_at": timestamp(conversation.updated_at),
    "messages": [{"id": row.id, "role": row.role, "content": row.content, "recommendations": row.recommendations, "created_at": timestamp(row.created_at)} for row in messages],
  }


def personal_context(db, user):
  searches = db.scalars(select(SearchRecord.query).where(SearchRecord.user_id == user.id).order_by(SearchRecord.id.desc()).limit(3)).all()
  visited = db.scalars(select(Restaurant.category).join(Visit).where(Visit.user_id == user.id).order_by(Visit.id.desc()).limit(10)).all()
  reviewed = db.scalars(select(Restaurant.category).join(Post).where(Post.user_id == user.id, Post.kind == "review", Post.rating >= 4).order_by(Post.id.desc()).limit(10)).all()
  return {"preferences": user.preferences, "budget_min": user.budget_min, "budget_max": user.budget_max, "recent_searches": searches, "manually_visited_categories": visited, "liked_review_categories": reviewed}


def grounded_reason(candidate, keys):
  labels = {
    "area": candidate["area"] + "에 위치합니다.",
    "category": candidate["category"] + " 음식점입니다.",
    "menu_budget": "확인된 메뉴 가격으로 인원에 맞는 조합을 계산할 수 있습니다.",
    "community_reviews": "서비스 내 실제 작성된 음식점 리뷰를 함께 확인할 수 있습니다.",
    "preferences": "저장한 선호 음식 분류에 해당합니다.",
    "distance": "제공된 좌표로 직선거리를 계산했습니다.",
  }
  return " ".join(labels[key] for key in dict.fromkeys(keys)) or labels["category"]


def chat(db, user, data):
  client = get_client()
  # Serialise a user's successful requests to protect quota and conversation updates.
  from entity.models import User
  db.scalar(select(User).where(User.id == user.id).with_for_update())
  recent = db.scalar(select(func.count()).select_from(SearchRecord).where(SearchRecord.user_id == user.id, SearchRecord.created_at >= utcnow() - timedelta(minutes=1)))
  if recent >= 10:
    raise HTTPException(429, "잠시 쉬었다가 다시 이야기해 주세요.")
  conversation = owned(db, Conversation, data.conversation_id, user.id) if data.conversation_id else Conversation(user_id=user.id, title=data.message[:40], conditions={})
  history = db.scalars(select(Message).where(Message.conversation_id == conversation.id).order_by(Message.id.desc()).limit(8)).all() if conversation.id else []
  origin_text, latitude, longitude = data.origin_text, data.latitude, data.longitude
  previous = dict(conversation.conditions)
  previous_origin = previous.pop("search_origin", None)
  radius = requested_radius(data.message)
  if latitude is None and not origin_text and previous_origin and not CURRENT_LOCATION.search(data.message):
    origin_text = previous_origin["label"]
    latitude, longitude = previous_origin["latitude"], previous_origin["longitude"]
  if not origin_text and latitude is None:
    address = db.scalar(select(Address).where(Address.user_id == user.id, Address.is_default.is_(True)))
    if address:
      origin_text, latitude, longitude = address.address, address.latitude, address.longitude
  profile = personal_context(db, user)
  conditions = generate_structured(client, CONDITION_PROMPT, {
    "message": data.message, "history": [{"role": row.role, "content": row.content} for row in reversed(history)],
    "previous": previous, "profile": profile, "origin": origin_text,
    "coordinates_provided": latitude is not None, "now": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
  }, SearchConditions).model_dump(mode="json")
  if radius is not None:
    conditions["radius_metres"] = radius
  if conditions.get("area") and CURRENT_LOCATION.fullmatch(conditions["area"]):
    conditions["area"] = None
  if conditions.get("cuisine") in {"식당", "음식점", "맛집"}:
    conditions["cuisine"] = None
  clarification = conditions.pop("clarification", None)
  if conditions.get("radius_metres") and latitude is not None:
    clarification = None
  if not conditions.get("area") and not origin_text and latitude is None:
    clarification = "어느 동네나 역 근처에서 식사하고 싶으세요?"
  if conditions.get("budget_total") and not conditions.get("party_size"):
    clarification = "총예산에 맞춰 메뉴를 고를게요. 몇 분이 함께 방문하시나요?"
  if conditions.get("radius_metres") and latitude is None:
    clarification = "반경 검색의 기준 위치를 정해 주세요. 현재 위치나 지도에서 선택한 지점을 사용할 수 있어요."
  if not conditions.get("budget_total") and conditions.get("party_size") and user.budget_max:
    conditions["budget_total"] = user.budget_max * conditions["party_size"]
  recommendations, notices = [], []
  if clarification:
    reply = clarification
  else:
    candidates, notices = find_candidates(db, user, conditions, origin_text, latitude, longitude)
    if not candidates:
      reply = "조건에 맞는 등록 음식점을 찾지 못했어요. 지역이나 음식 종류를 조금 넓혀 주세요."
    else:
      ranked = generate_structured(client, RANKING_PROMPT, {"conditions": conditions, "profile": profile, "candidates": candidates}, RecommendationResult)
      by_id = {row["id"]: row for row in candidates}
      seen = set()
      for item in ranked.items:
        if item.restaurant_id not in by_id or item.restaurant_id in seen:
          raise HTTPException(502, "AI 추천 근거를 확인하지 못했습니다. 다시 시도해 주세요.")
        candidate = dict(by_id[item.restaurant_id])
        if any(key not in candidate["available_evidence"] for key in item.evidence_keys):
          raise HTTPException(502, "AI 추천 근거를 확인하지 못했습니다. 다시 시도해 주세요.")
        seen.add(item.restaurant_id)
        candidate["reason"] = grounded_reason(candidate, item.evidence_keys)
        candidate.pop("_score", None)
        recommendations.append(candidate)
      reply = "확인된 음식점 데이터에서 조건에 맞는 곳을 골랐어요. 카드에서 메뉴와 출처를 확인해 보세요." if recommendations else "현재 확인 가능한 정보로는 추천을 확정하기 어려워요. 조건을 조금 넓혀 주세요."
      if any(item["budget_note"] for item in recommendations):
        reply += "\n\n메뉴 가격이 없는 곳은 예산 충족 여부를 확인할 수 없어요."
  if notices:
    reply += "\n\n" + " ".join(notices)
  if conditions.get("radius_metres") and latitude is not None:
    conditions["search_origin"] = {"label": origin_text or "현재 위치", "latitude": latitude, "longitude": longitude}
  conversation.conditions = conditions
  conversation.updated_at = utcnow()
  db.add(conversation)
  db.flush()
  db.add_all([
    Message(conversation_id=conversation.id, role="user", content=data.message),
    Message(conversation_id=conversation.id, role="assistant", content=reply, recommendations=recommendations),
    SearchRecord(user_id=user.id, conversation_id=conversation.id, query=data.message, conditions=conditions, restaurant_ids=[item["id"] for item in recommendations]),
  ])
  db.commit()
  return serialize_conversation(db, conversation)
