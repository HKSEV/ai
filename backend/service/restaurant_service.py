import math
from datetime import datetime, time, timedelta, timezone
from urllib.parse import quote
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select

from config.settings import settings
from entity.models import Menu, Post, Restaurant, utcnow
from service.common import timestamp


KST = ZoneInfo("Asia/Seoul")
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def fresh(checked_at):
  return bool(checked_at and utcnow() - timedelta(days=settings.menu_max_age_days) <= checked_at <= utcnow() + timedelta(minutes=5))


def opening_status(restaurant, visit_at=None):
  if not restaurant.hours or not restaurant.hours_source or not fresh(restaurant.hours_checked_at):
    return {"label": "확인 필요", "basis": "영업시간 정보가 없거나 확인 기한이 지났습니다.", "is_realtime": False}
  moment = visit_at or datetime.now(KST)
  moment = moment.replace(tzinfo=KST) if moment.tzinfo is None else moment.astimezone(KST)
  if moment.date().isoformat() in (restaurant.closed_dates or []):
    return {"label": "휴무일", "basis": "등록된 휴무일 기준 · 실시간 정보 아님", "is_realtime": False}
  try:
    for offset in [0, -1]:
      day = moment.date() + timedelta(days=offset)
      if day.isoformat() in (restaurant.closed_dates or []):
        continue
      hours = restaurant.hours.get(DAYS[day.weekday()])
      if not hours or hours.get("closed"):
        continue
      start = datetime.combine(day, time.fromisoformat(hours["open"]), KST)
      end = datetime.combine(day, time.fromisoformat(hours["close"]), KST)
      if end <= start:
        end += timedelta(days=1)
      if start <= moment < end:
        if hours.get("break_start") and hours.get("break_end"):
          pause = datetime.combine(day, time.fromisoformat(hours["break_start"]), KST)
          resume = datetime.combine(day, time.fromisoformat(hours["break_end"]), KST)
          if pause < start:
            pause += timedelta(days=1)
          if resume <= pause:
            resume += timedelta(days=1)
          if pause <= moment < resume:
            return {"label": "브레이크타임", "basis": "등록된 일반 영업시간 기준 · 실시간 정보 아님", "is_realtime": False}
        return {"label": "영업시간 내", "basis": "등록된 일반 영업시간 기준 · 방문 전 확인 권장", "is_realtime": False}
  except (KeyError, ValueError, TypeError):
    return {"label": "확인 필요", "basis": "영업시간 형식 확인이 필요합니다.", "is_realtime": False}
  today = restaurant.hours.get(DAYS[moment.weekday()])
  if today is None:
    return {"label": "확인 필요", "basis": "해당 요일의 영업시간 정보가 없습니다.", "is_realtime": False}
  if today.get("closed"):
    return {"label": "휴무일", "basis": "등록된 일반 영업시간 기준 · 실시간 정보 아님", "is_realtime": False}
  return {"label": "영업시간 외", "basis": "등록된 일반 영업시간 기준 · 실시간 정보 아님", "is_realtime": False}


def menu_combination(menus, party_size):
  if not party_size:
    return None
  available = [menu for menu in menus if menu.available and menu.price is not None and menu.price > 0 and menu.servings > 0 and fresh(menu.checked_at)]
  if not available:
    return None
  # Unbounded minimum cost coverage; servings represent a complete meal, not side dishes.
  dp = [(math.inf, []) for _ in range(party_size + 1)]
  dp[0] = (0, [])
  for count in range(party_size):
    cost, selected = dp[count]
    if math.isinf(cost):
      continue
    for menu in available:
      target = min(party_size, count + menu.servings)
      if cost + menu.price < dp[target][0]:
        dp[target] = (cost + menu.price, selected + [menu])
  total, selected = dp[party_size]
  if math.isinf(total):
    return None
  grouped = {}
  for menu in selected:
    grouped.setdefault(menu.id, {"menu_id": menu.id, "name": menu.name, "price": menu.price, "quantity": 0, "servings": menu.servings})
    grouped[menu.id]["quantity"] += 1
  return {"items": list(grouped.values()), "total": total, "per_person": math.ceil(total / party_size), "party_size": party_size, "basis": "확인된 메뉴 가격으로 계산한 예상액 · 추가 주문/가격 변동 제외"}


def distance_metres(lat1, lng1, lat2, lng2):
  if any(value is None for value in [lat1, lng1, lat2, lng2]):
    return None
  a, b = math.radians(lat1), math.radians(lat2)
  delta = math.sin((b - a) / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
  return 6371000 * 2 * math.asin(min(1, math.sqrt(delta)))


def serialize_restaurant(db, item, conditions=None, latitude=None, longitude=None):
  menus = db.scalars(select(Menu).where(Menu.restaurant_id == item.id).order_by(Menu.id)).all()
  reviews = db.scalars(select(Post).where(Post.restaurant_id == item.id, Post.kind == "review").order_by(Post.created_at.desc(), Post.id.desc()).limit(5)).all()
  visit_at = datetime.fromisoformat(conditions["visit_at"]) if conditions and conditions.get("visit_at") else None
  map_target = quote(item.name, safe="")
  if item.latitude is not None and item.longitude is not None:
    target = map_target + "," + str(item.latitude) + "," + str(item.longitude)
    map_url, directions = "https://map.kakao.com/link/map/" + target, "https://map.kakao.com/link/to/" + target
  else:
    map_url = directions = "https://map.kakao.com/link/search/" + map_target
  distance = distance_metres(latitude, longitude, item.latitude, item.longitude)
  return {
    "id": item.id, "name": item.name, "address": item.address, "area": item.area, "category": item.category,
    "phone": item.phone, "latitude": item.latitude, "longitude": item.longitude, "tags": item.tags,
    "source": item.source, "source_url": item.source_url, "checked_at": timestamp(item.checked_at),
    "is_demo": item.is_demo, "hours": item.hours, "closed_dates": item.closed_dates,
    "hours_source": item.hours_source, "hours_source_url": item.hours_source_url, "hours_checked_at": timestamp(item.hours_checked_at),
    "opening": opening_status(item, visit_at),
    "menus": [{"id": menu.id, "name": menu.name, "price": menu.price, "servings": menu.servings, "available": menu.available, "source": menu.source, "source_url": menu.source_url, "checked_at": timestamp(menu.checked_at), "is_current": fresh(menu.checked_at)} for menu in menus],
    "menu_combination": menu_combination(menus, conditions.get("party_size") if conditions else None),
    "distance_metres": round(distance) if distance is not None else None, "distance_basis": "좌표로 계산한 직선거리", "travel_minutes": None,
    "map_url": map_url, "directions_url": directions,
    "review_summary": [{"id": row.id, "rating": row.rating, "excerpt": row.content[:180], "created_at": timestamp(row.created_at)} for row in reviews],
    "wait_minutes": None, "estimated_card_spending": None, "repeat_visit_rate": None, "external_visit_verified": None,
  }


def query_kakao(query, latitude=None, longitude=None, radius_metres=None):
  params = {"query": query, "category_group_code": "CE7" if "카페" in query else "FD6", "size": 15}
  endpoint = "keyword"
  if latitude is not None and longitude is not None:
    params.update({"x": longitude, "y": latitude, "radius": min(radius_metres or 5000, 20000), "sort": "distance"})
    if radius_metres and query in {"음식점", "카페"}:
      endpoint = "category"
      params.pop("query")
  with httpx.Client(timeout=12) as client:
    response = client.get(f"https://dapi.kakao.com/v2/local/search/{endpoint}.json", params=params, headers={"Authorization": "KakaoAK " + settings.kakao_local_key})
    response.raise_for_status()
    return response.json()["documents"]


def sync_kakao(db, query, latitude, longitude, radius_metres=None):
  synced = []
  for data in query_kakao(query, latitude, longitude, radius_metres):
    address = data.get("road_address_name") or data.get("address_name") or ""
    if "노원구" not in address or data.get("category_group_code") not in {"FD6", "CE7"}:
      continue
    try:
      lat, lng = float(data["y"]), float(data["x"])
      if not (33 <= lat <= 39 and 124 <= lng <= 132) or not data.get("id") or not data.get("place_name"):
        continue
    except (ValueError, TypeError, KeyError):
      continue
    external_id = "kakao:" + str(data["id"])
    item = db.scalar(select(Restaurant).where(Restaurant.external_id == external_id))
    if not item:
      item = Restaurant(external_id=external_id)
      db.add(item)
    item.name = data["place_name"][:150]
    item.address = address[:300]
    item.area = (data.get("address_name") or address).replace("서울 ", "").replace("노원구 ", "")[:100]
    item.category = (data.get("category_name") or "음식점")[:100]
    item.phone = (data.get("phone") or "")[:40] or None
    item.latitude, item.longitude = lat, lng
    item.source = "카카오 로컬 검색"
    item.source_url = "https://place.map.kakao.com/" + str(data["id"])
    item.checked_at = utcnow()
    # This API provides no opening hours or menu prices. Preserve their independent provenance.
    item.is_demo = False
    synced.append(item)
  db.flush()
  return {item.id for item in synced}


def find_candidates(db, user, conditions, origin_text, latitude, longitude):
  notices = []
  matched_ids = set()
  requested_area = conditions.get("area")
  area = requested_area or (origin_text if origin_text != "현재 위치" else None) or "노원구"
  radius_metres = conditions.get("radius_metres")
  cuisine = conditions.get("cuisine")
  if settings.kakao_local_key and settings.kakao_storage_allowed:
    try:
      if radius_metres:
        query = (requested_area + " " if requested_area and requested_area not in {"노원", "노원구", "서울 노원구"} else "") + (cuisine or "음식점")
      else:
        query = "노원구 " + area + " " + (cuisine or "음식점")
      search_latitude, search_longitude = (latitude, longitude) if radius_metres or not requested_area else (None, None)
      matched_ids = sync_kakao(db, query, search_latitude, search_longitude, radius_metres)
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
      notices.append("외부 음식점 조회가 지연되어 저장된 데이터로 탐색했습니다.")
  else:
    notices.append("외부 음식점 검색이 미연동되어 등록된 데이터에서 탐색합니다.")
  query = select(Restaurant)
  if not settings.include_demo:
    query = query.where(Restaurant.is_demo.is_(False))
  if radius_metres:
    query = query.where(Restaurant.latitude.is_not(None), Restaurant.longitude.is_not(None))
  query = query.order_by(Restaurant.checked_at.desc(), Restaurant.id)
  rows = db.scalars(query if radius_metres else query.limit(200)).all()
  result = []
  for row in rows:
    if radius_metres:
      distance = distance_metres(latitude, longitude, row.latitude, row.longitude)
      if distance is None or distance > radius_metres:
        continue
    haystack = row.name + " " + row.address + " " + row.area + " " + row.category + " " + " ".join(row.tags or [])
    if requested_area and requested_area not in {"노원", "노원구", "서울 노원구"} and requested_area not in haystack and row.id not in matched_ids:
      continue
    candidate = serialize_restaurant(db, row, conditions, latitude, longitude)
    menu_text = " ".join(menu["name"] for menu in candidate["menus"])
    if cuisine and cuisine not in haystack + " " + menu_text:
      continue
    combo = candidate["menu_combination"]
    if combo and conditions.get("budget_total") and combo["total"] > conditions["budget_total"]:
      continue
    evidence = ["area", "category"]
    confirmed = [row.area, row.category]
    if combo:
      evidence.append("menu_budget")
      confirmed.append("메뉴 가격 확인")
    if candidate["review_summary"]:
      evidence.append("community_reviews")
    if candidate["distance_metres"] is not None:
      evidence.append("distance")
    if any(pref in haystack for pref in user.preferences):
      evidence.append("preferences")
    for key in ["atmosphere", "purpose"]:
      if conditions.get(key) and any(conditions[key] in tag or tag in conditions[key] for tag in (row.tags or [])):
        confirmed.append(conditions[key])
    candidate["available_evidence"] = evidence
    candidate["confirmed_matches"] = confirmed
    candidate["budget_note"] = None if combo else "메뉴·가격 또는 인원 정보가 부족해 예산 충족 여부를 확인할 수 없습니다."
    candidate["_score"] = 10 * ("preferences" in evidence) + len(candidate["review_summary"]) + 5 * bool(combo) - (candidate["distance_metres"] or 0) / 1000
    result.append(candidate)
  result.sort(key=lambda item: item["_score"], reverse=True)
  return result[:12], notices
