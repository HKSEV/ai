import json
import re
from collections import Counter
from datetime import datetime, timedelta
from decimal import Decimal
from time import sleep
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from google.genai import errors, types
from sqlalchemy import func, select

from config.gemini import get_client
from config.settings import settings
from dto.chat import RecommendationResult, SearchConditions
from entity.models import Address, Conversation, Message, Post, Restaurant, SearchRecord, Visit, utcnow
from service.common import branch_key, normalized, owned, timestamp
from service.kakao_navigation import geocode_origin, travel_times
from service.prompt_service import active_prompts
from service.restaurant_service import find_candidates, order_estimate, tag_match, visit_schedule, visit_time


DISTANCE = r"(\d+(?:,\d{3})*(?:\.\d+)?)\s*(km|㎞|킬로(?:미터)?|m|미터)"
CURRENT_LOCATION = re.compile(r"(?:내|제|현재|현)\s*위치|(?:내|제)\s*주변")
CUISINE_WITH_SUFFIX = re.compile(r"(한식|중식|일식|양식|분식|이탈리안)\s*(?:집|식당|음식점)")
UNVERIFIED_REASON_DETAIL = re.compile(
  r"https?://|도보|걸어서|[0-9]{1,2}:[0-9]{2}|[0-9][0-9,.]*\s*(?:[만천]?\s*원|시간|분|시|km\b|m\b|미터)|[가-힣0-9]+(?:대로|로|길)\s+[0-9]",
  re.IGNORECASE,
)


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
    contents = json.dumps(data, ensure_ascii=False)
    config = types.GenerateContentConfig(
      system_instruction=prompt, response_mime_type="application/json",
      response_json_schema=schema.model_json_schema(), temperature=0.2,
    )
    try:
      response = client.models.generate_content(model=settings.gemini_model, contents=contents, config=config)
    except errors.ServerError as error:
      if error.code != 503:
        raise
      sleep(1)
      response = client.models.generate_content(model=settings.gemini_model, contents=contents, config=config)
    return schema.model_validate_json(response.text)
  except Exception:
    raise HTTPException(502, "AI 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.") from None


def serialize_conversation(db, conversation):
  messages = db.scalars(select(Message).where(Message.conversation_id == conversation.id).order_by(Message.id)).all()
  return {
    "id": conversation.id, "title": conversation.title, "conditions": conversation.conditions,
    "created_at": timestamp(conversation.created_at), "updated_at": timestamp(conversation.updated_at),
    "messages": [{"id": row.id, "role": row.role, "content": row.content,
                  "recommendations": [serialize_recommendation(item) for item in row.recommendations],
                  "created_at": timestamp(row.created_at)} for row in messages],
  }


def category_label(category):
  parts = [part.strip() for part in category.split(">") if part.strip()]
  if len(parts) > 1:
    return parts[-2]
  return parts[0] if parts else "음식점"


def serialize_recommendation(item):
  category = item.get("category") or ""
  label = category_label(category)
  reason = item.get("reason") or ""
  if item.get("address"):
    reason = reason.replace(f"주소는 {item['address']}입니다.", "").strip()
  if ">" in category:
    reason = reason.replace(category, label)
    without_root = category.removeprefix("음식점 > ")
    if ">" in without_root:
      reason = reason.replace(without_root, label)
  matches = [tag for tag in item.get("confirmed_matches") or [] if tag not in {category, label}]
  return {**item, "category": label, "reason": reason or "확인된 음식 분류를 기준으로 골랐습니다.", "confirmed_matches": matches}


def personal_context(db, user):
  searches = db.scalars(select(SearchRecord.query).where(SearchRecord.user_id == user.id).order_by(SearchRecord.id.desc()).limit(3)).all()
  visited = db.scalars(select(Restaurant.category).join(Visit).where(Visit.user_id == user.id).order_by(Visit.id.desc()).limit(10)).all()
  reviewed = db.scalars(select(Restaurant.category).join(Post).where(Post.user_id == user.id, Post.kind == "review", Post.rating >= 4).order_by(Post.id.desc()).limit(10)).all()
  return {"preferences": user.preferences, "budget_min": user.budget_min, "budget_max": user.budget_max, "recent_searches": searches, "manually_visited_categories": visited, "liked_review_categories": reviewed}


def related_features(tags, conditions):
  if conditions.get("features"):
    return [tag for feature in conditions["features"] if (tag := tag_match(tags, feature))]
  purpose = conditions.get("purpose") or ""
  if any(word in purpose for word in ("가족", "아이", "유아")):
    features = ("유아의자", "주차", "단체석")
  elif (conditions.get("party_size") or 0) >= 4 or any(word in purpose for word in ("모임", "회식", "단체")):
    features = ("단체석", "예약", "룸")
  elif "데이트" in purpose:
    features = ("룸", "예약")
  else:
    features = ()
  return [tag for feature in features if (tag := tag_match(tags, feature))]


def reason_options(candidate, conditions):
  category = category_label(candidate["category"])
  labels = {
    "area": "요청하신 지역에서 찾은 음식점입니다." if conditions.get("area") else f"등록된 음식 분류는 {category}입니다.",
    "category": f"등록된 음식 분류는 {category}입니다.",
    "community_reviews": "서비스에 등록된 음식점 리뷰를 참고할 수 있습니다.",
    "preferences": "저장하신 선호 음식 분류에 해당합니다.",
    "atmosphere": f"확인된 매장 정보에 ‘{conditions.get('atmosphere')}’ 분위기가 표시됩니다.",
    "purpose": f"확인된 매장 정보에 ‘{conditions.get('purpose')}’ 태그가 표시됩니다.",
  }
  features = related_features(candidate["verified_tags"], conditions)
  if features:
    names = ", ".join(f"‘{tag}’" for tag in dict.fromkeys(features))
    purpose = conditions.get("purpose")
    context = f"{purpose} 장소를 고를 때" if purpose else "식당을 고를 때"
    labels["features"] = f"매장 안내에 {names} 정보가 있어 {context} 참고할 수 있습니다."
  combo = candidate["menu_combination"]
  if combo:
    budget = conditions.get("budget_total")
    if budget and not conditions.get("budget_from_profile") and combo["total"] <= budget:
      labels["menu_budget"] = "확인된 메뉴 가격을 기준으로 요청하신 예산 안에서 주문할 수 있습니다."
    else:
      labels["menu_budget"] = "확인된 메뉴 가격을 참고해 주문을 계획할 수 있습니다."
  if candidate.get("confirmed_menu"):
    labels["menu"] = f"확인된 메뉴에 ‘{candidate['confirmed_menu']}’가 있습니다."
  if conditions.get("visit_at") and candidate["opening"]["label"] == "영업시간 내":
    labels["opening"] = f"확인된 {candidate['visit_schedule']['basis']} 일정에서 요청하신 방문 시각이 영업시간에 해당합니다."
  if candidate["distance_metres"] is not None:
    labels["distance"] = f"검색 기준 위치에서 직선거리로 약 {candidate['distance_metres']:,}m입니다."
  evidence = set(candidate["available_evidence"]) - {"menu_budget"}
  return {key: label for key, label in labels.items() if key in evidence or key in {"features", "menu", "menu_budget", "opening"}}


def checked_reason(value, sentences, address):
  reason = " ".join((value or "").split())
  if not reason or ">" in reason or (address and address in reason):
    return None
  unconfirmed = reason
  for sentence in sentences:
    unconfirmed = unconfirmed.replace(sentence, "")
  return None if UNVERIFIED_REASON_DETAIL.search(unconfirmed) else reason


def grounded_reason(options, ranked, conditions, address):
  keys = [key for key in dict.fromkeys(ranked.evidence_keys) if key in options] if ranked else []
  requested = [key for key, applies in [
    ("features", conditions.get("features")), ("opening", conditions.get("visit_at")),
    ("menu_budget", conditions.get("budget_total") and not conditions.get("budget_from_profile")),
    ("menu", conditions.get("cuisine") or not keys),
  ] if applies and key in options]
  if requested and not any(key in keys for key in requested):
    keys.insert(0, requested[0])
    return " ".join(dict.fromkeys(options[key] for key in keys[:2]))
  sentences = list(dict.fromkeys(options[key] for key in keys)) or [options["category"]]
  reason = checked_reason(ranked.reason, sentences, address) if ranked and keys else None
  return reason or " ".join(sentences[:2])


def meets_branch_conditions(candidate, conditions):
  tags = candidate["verified_tags"]
  features = conditions.get("features") or []
  return (
    all(tag_match(tags, feature) for feature in features)
    and (not conditions.get("atmosphere") or "atmosphere" in candidate["available_evidence"])
    and (not conditions.get("visit_at") or candidate["opening"]["label"] == "영업시간 내")
  )


def prepare_candidate(candidate, conditions):
  item = candidate.copy()
  visit_at = datetime.fromisoformat(conditions["visit_at"]) if conditions.get("visit_at") else None
  item["visit_schedule"] = visit_schedule(item["hours"] or {}, item["closed_dates"], visit_at)
  item["menu_combination"] = order_estimate(item["menus"], conditions.get("party_size"), conditions.get("cuisine"))
  order = item["menu_combination"]
  menu = next((menu["name"] for menu in item["menus"] if menu["available"] and menu["is_current"]), None)
  item["confirmed_menu"] = order["items"][0]["name"] if order else menu
  item["confirmed_matches"] = [tag for tag in item["confirmed_matches"] if tag != "메뉴 가격 확인"]
  if order:
    item["confirmed_matches"].append("메뉴 가격 확인")
  item["confirmed_matches"] = list(dict.fromkeys([*item["confirmed_matches"], *related_features(item["verified_tags"], conditions)]))
  item["travel_label"] = "이동 시간 확인 불가"
  return item


def menu_suggestion(order, party_size):
  if order is None:
    return None
  total = order.estimated_total
  return {
    "items": [menu.model_dump() for menu in order.items],
    "total": total,
    "per_person": (total + party_size - 1) // party_size if total is not None and party_size else None,
    "party_size": party_size,
    "basis": "AI가 제안한 주문입니다. 실제 메뉴와 가격은 매장 안내를 확인하세요.",
  }


def markdown_text(value):
  return re.sub(r"([\\`*_\[\]<>#!])", r"\\\1", value.replace("\n", " "))


def recommendation_reply(items, conditions):
  if not items:
    detail = "조건에 맞는 식당을 확인하지 못했어요."
    if conditions.get("visit_at"):
      return detail + " 방문 시간을 조금 조정해서 다시 찾아볼까요?"
    if conditions.get("features") or conditions.get("atmosphere"):
      return detail + " 가장 중요한 시설이나 분위기 조건 한 가지만 골라 주시겠어요?"
    if conditions.get("budget_total") and not conditions.get("budget_from_profile"):
      return detail + " 확인한 메뉴 가격을 기준으로 예산 범위를 조금 넓혀 볼까요?"
    return detail + " 가까운 다른 동네까지 넓혀서 찾아볼까요?"
  paragraphs = []
  restaurant_names = Counter(normalized(item["name"]) for item in items)
  for item in items:
    name = markdown_text(item["name"])
    if restaurant_names[normalized(item["name"])] > 1:
      name += " · " + markdown_text(item["address"])
    description = markdown_text(item["explanation"])
    order = item["menu_combination"]
    if order:
      order_items = ", ".join(f"{markdown_text(menu['name'])} × {menu['quantity']}" for menu in order["items"])
      description += f"\n\n추천 주문은 {order_items}예요."
      if order["total"] is not None:
        amount = f"총 {order['total']:,}원"
        if order["per_person"] is not None:
          amount += f" · 1인당 {order['per_person']:,}원"
        description += f" AI 예상 금액은 {amount}이에요."
      else:
        description += " 예상 금액은 확인 필요로 표시했어요."
    else:
      description += "\n\n추천 메뉴 확인 필요 · 예상 금액 확인 필요"
    paragraphs.append(f"### {name}\n\n{description}")
  if len(items) < 3:
    paragraphs.insert(0, f"조건에 맞는 곳은 {len(items)}곳 확인했어요.")
  if not conditions.get("cuisine") and len(items) >= 2:
    paragraphs.append("드시고 싶은 메뉴가 있으시면 그 메뉴로 더 좁혀볼까요?")
  elif not conditions.get("visit_at") and len(items) >= 2 and any(item["hours"] for item in items):
    paragraphs.append("방문하실 시간이 정해져 있으면 그 시간에 맞춰 더 좁혀볼까요?")
  return "\n\n".join(paragraphs)


def opening_reply(conditions, first):
  area = markdown_text(conditions.get("area") or "")
  cuisine = markdown_text(conditions.get("cuisine") or "")
  atmosphere = markdown_text(conditions.get("atmosphere") or "")
  purpose = markdown_text(conditions.get("purpose") or "")
  party = conditions.get("party_size")
  radius = conditions.get("radius_metres")
  group = "혼자 드시기 좋은 " if party == 1 else f"{party}명이 함께 드실 " if party else ""
  location = f"{area}에서 " if area else ""
  if radius:
    location += f"기준 위치에서 {radius:,}m 안에 있는 "
  atmosphere = f"‘{atmosphere}’ 분위기의 " if atmosphere else ""
  place = location + group + atmosphere
  place += f"{cuisine} 식당" if cuisine else "식당"
  if purpose:
    place = f"{purpose}에 맞춰 {place}"
  reply = f"안녕하세요! {place}을 찾고 계시군요." if first else f"네, 이번에는 {place}으로 살펴볼게요."
  if conditions.get("visit_at"):
    moment = visit_time(datetime.fromisoformat(conditions["visit_at"]))
    reply += f" {moment.month}월 {moment.day}일 {moment:%H:%M} 방문을 기준으로 볼게요."
  if budget := conditions.get("budget_total"):
    subject = "저장하신 가격대" if conditions.get("budget_from_profile") else "말씀하신 예산"
    reply += f" {subject}인 {budget:,}원도 참고했어요."
  if conditions.get("features"):
    features = ", ".join(markdown_text(feature) for feature in conditions["features"])
    reply += f" 말씀하신 시설 조건({features})도 함께 살폈어요."
  return reply


def recommend(client, candidates, conditions, profile, latitude, longitude, departure, prompt):
  required_budget = None if conditions.get("budget_from_profile") else conditions.get("budget_total")
  branches = {}
  for candidate in candidates:
    if meets_branch_conditions(candidate, conditions):
      branch = branch_key(candidate["name"], candidate["address"])
      branches.setdefault(branch, candidate)
  current = {}
  for candidate in branches.values():
    item = prepare_candidate(candidate, conditions)
    order = item["menu_combination"]
    if required_budget and order and order["total"] > required_budget:
      continue
    current[item["id"]] = item
    if len(current) == 12:
      break
  if not current:
    return [], []
  options = {identity: reason_options(row, conditions) for identity, row in current.items()}
  ranked = generate_structured(client, prompt, {
    "conditions": conditions, "profile": profile,
    "candidates": [{
      "id": row["id"], "name": row["name"], "address": row["address"], "category": row["category"],
      "display_category": category_label(row["category"]), "confirmed_matches": row["confirmed_matches"],
      "opening": row["opening"], "reason_options": options[row["id"]],
      "menus": [{key: menu[key] for key in ("name", "price", "servings")} for menu in row["menus"]
                if menu["available"] and menu["is_current"]][:10],
    } for row in current.values()],
  }, RecommendationResult)
  chosen = {}
  for entry in ranked.items:
    identity = entry.restaurant_id
    if identity not in current:
      raise HTTPException(502, "AI가 선택한 음식점을 확인하지 못했습니다. 다시 시도해 주세요.")
    chosen.setdefault(identity, entry)
  for identity in current:
    if len(chosen) >= 3:
      break
    chosen.setdefault(identity, None)
  selected = []
  for identity, entry in chosen.items():
    item = current[identity]
    item["reason"] = grounded_reason(options[identity], entry, conditions, item["address"])
    explanation = checked_reason(entry.explanation, options[identity].values(), item["address"]) if entry else None
    item["explanation"] = explanation or item["reason"]
    item["menu_combination"] = menu_suggestion(entry.order if entry else None, conditions.get("party_size"))
    total_known = item["menu_combination"] is not None and item["menu_combination"]["total"] is not None
    item["budget_note"] = None if total_known else "예상 금액 확인 필요"
    item.pop("verified_tags", None)
    item.pop("confirmed_menu", None)
    item.pop("_score", None)
    selected.append(item)
  stored = [item.copy() for item in selected]
  times = travel_times(latitude, longitude, selected)
  for item in selected:
    seconds = times.get(item["id"])
    if seconds is not None:
      minutes, remainder = divmod(seconds, 60)
      duration = f"{minutes}분 {remainder}초" if remainder else f"{minutes}분"
      item.update(travel_seconds=seconds, travel_minutes=round(seconds / 60, 2), travel_mode="자동차",
                  travel_label=f"{departure} 기준 자동차 {duration} · 카카오모빌리티 예상")
  return selected, stored


def chat(db, user, data):
  client = get_client()
  # Serialise a user's successful requests to protect quota and conversation updates.
  from entity.models import User
  db.scalar(select(User).where(User.id == user.id).with_for_update())
  recent = db.scalar(select(func.count()).select_from(SearchRecord).where(SearchRecord.user_id == user.id, SearchRecord.created_at >= utcnow() - timedelta(minutes=1)))
  if recent >= 10:
    raise HTTPException(429, "잠시 쉬었다가 다시 이야기해 주세요.")
  prompts = active_prompts(db)
  conversation = owned(db, Conversation, data.conversation_id, user.id) if data.conversation_id else Conversation(user_id=user.id, title=data.message[:40], conditions={})
  history = db.scalars(select(Message).where(Message.conversation_id == conversation.id).order_by(Message.id.desc()).limit(8)).all() if conversation.id else []
  origin_text, latitude, longitude = data.origin_text, data.latitude, data.longitude
  previous = dict(conversation.conditions)
  previous_origin = previous.pop("search_origin", None)
  radius = requested_radius(data.message)
  departure = "지정한 출발지"
  if not origin_text and latitude is None:
    address = db.scalar(select(Address).where(Address.user_id == user.id, Address.is_default.is_(True)))
    if address:
      origin_text, latitude, longitude = address.address, address.latitude, address.longitude
      departure = "기본 주소"
  if latitude is None and origin_text and not CURRENT_LOCATION.fullmatch(origin_text):
    point = geocode_origin(origin_text)
    if point:
      latitude, longitude = point
  default_origin = origin_text, latitude, longitude
  use_previous_origin = previous_origin and latitude is None and not origin_text and not CURRENT_LOCATION.search(data.message)
  if use_previous_origin:
    origin_text = previous_origin["label"]
    latitude, longitude = previous_origin["latitude"], previous_origin["longitude"]
  profile = personal_context(db, user)
  update = generate_structured(client, prompts["conditions"], {
    "message": data.message, "history": [{"role": row.role, "content": row.content} for row in reversed(history)],
    "previous": previous, "profile": profile, "origin": origin_text,
    "coordinates_provided": latitude is not None, "now": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
  }, SearchConditions)
  if update.new_search and use_previous_origin:
    origin_text, latitude, longitude = default_origin
  changes = update.model_dump(mode="json", exclude={"new_search", "clear_fields", "clarification"})
  if update.area and CURRENT_LOCATION.fullmatch(update.area):
    changes["area"] = None
  if update.cuisine in {"식당", "음식점", "맛집"}:
    changes["cuisine"] = None
  elif update.cuisine and (match := CUISINE_WITH_SUFFIX.fullmatch(update.cuisine)):
    changes["cuisine"] = match.group(1)
  conditions = dict.fromkeys(changes) if update.new_search else {key: previous.get(key) for key in changes}
  conditions.update({key: value for key, value in changes.items() if value is not None})
  conditions.update(dict.fromkeys(update.clear_fields))
  if radius is not None and "radius_metres" not in update.clear_fields:
    conditions["radius_metres"] = radius
  clarification = update.clarification
  if conditions.get("radius_metres") and latitude is not None:
    clarification = None
  if not conditions.get("area") and not origin_text and latitude is None:
    clarification = "어느 동네나 역 근처에서 식사하고 싶으세요?"
  if conditions.get("budget_total") and not conditions.get("party_size"):
    clarification = "총예산에 맞춰 메뉴를 고를게요. 몇 분이 함께 방문하시나요?"
  if conditions.get("radius_metres") and latitude is None:
    clarification = "반경 검색의 기준 위치를 정해 주세요. 현재 위치나 지도에서 선택한 지점을 사용할 수 있어요."
  if previous.get("budget_from_profile") and update.budget_total is None and not update.new_search:
    conditions["budget_total"] = None
  budget_cleared = "budget_total" in update.clear_fields or (
    previous.get("budget_cleared") and not update.new_search and update.budget_total is None
  )
  if budget_cleared:
    conditions["budget_cleared"] = True
  elif not conditions.get("budget_total") and conditions.get("party_size") and user.budget_max:
    conditions["budget_total"] = user.budget_max * conditions["party_size"]
    conditions["budget_from_profile"] = True
  recommendations, stored, notices = [], [], []
  if clarification:
    reply = clarification
  else:
    candidates, notices = find_candidates(db, user, conditions, origin_text, latitude, longitude)
    if candidates:
      recommendations, stored = recommend(client, candidates, conditions, profile, latitude, longitude, departure, prompts["ranking"])
    reply = recommendation_reply(recommendations, conditions)
  reply = opening_reply(conditions, not history) + "\n\n" + reply
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
    Message(conversation_id=conversation.id, role="assistant", content=reply, recommendations=stored),
    SearchRecord(user_id=user.id, conversation_id=conversation.id, query=data.message, conditions=conditions, restaurant_ids=[item["id"] for item in recommendations]),
  ])
  db.commit()
  response = serialize_conversation(db, conversation)
  response["messages"][-1]["recommendations"] = [serialize_recommendation(item) for item in recommendations]
  return response
