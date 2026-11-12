import re
from concurrent.futures import ThreadPoolExecutor

import httpx

from config.settings import settings
from service.restaurant_service import distance_metres


STATION = re.compile(r"([가-힣A-Za-z0-9·()]+역)(?:\s*(\d+호선|[가-힣]+선))?")
TRANSFER_RADIUS_METRES = 500
KAKAO_TIMEOUT_SECONDS = 12


def coordinates(rows, max_distance=0):
  points = {}
  for row in rows:
    try:
      latitude, longitude = float(row["y"]), float(row["x"])
    except (KeyError, TypeError, ValueError):
      continue
    if 33 <= latitude <= 39 and 124 <= longitude <= 132:
      points[(latitude, longitude)] = None
  first = next(iter(points), None)
  if first and (len(points) == 1 or max_distance and all(distance_metres(*first, *point) <= max_distance for point in points)):
    return first
  return None


def geocode_origin(text):
  if not settings.kakao_local_key or not text:
    return None
  station = STATION.fullmatch(text)
  try:
    headers = {"Authorization": "KakaoAK " + settings.kakao_local_key}
    with httpx.Client(base_url="https://dapi.kakao.com/v2/local/search", headers=headers, timeout=KAKAO_TIMEOUT_SECONDS) as client:
      if not station:
        result = client.get("address.json", params={"query": text, "analyze_type": "exact"})
        result.raise_for_status()
        addresses = result.json()["documents"]
        if addresses:
          return coordinates(addresses)
      params = {"query": text, "size": 15}
      if station:
        params["category_group_code"] = "SW8"
      result = client.get("keyword.json", params=params)
      result.raise_for_status()
      normalized = "".join(text.split()).casefold()
      places = result.json()["documents"]
      exact = [row for row in places if "".join((row.get("place_name") or "").split()).casefold() == normalized]
      if exact or not station or station[2]:
        return coordinates(exact)
      # Kakao lists transfer stations by line. Use the first result for one nearby station complex.
      transfers = [row for row in places if (match := STATION.fullmatch(row.get("place_name") or "")) and match[1] == station[1]]
      return coordinates(transfers, TRANSFER_RADIUS_METRES)
  except (httpx.HTTPError, KeyError, TypeError, ValueError):
    return None


def route_seconds(client, origin, restaurant):
  try:
    response = client.get("/v1/directions", params={
      "origin": f"{origin[1]},{origin[0]}",
      "destination": f"{restaurant['longitude']},{restaurant['latitude']}",
      "summary": "true",
    })
    response.raise_for_status()
    for route in response.json()["routes"]:
      seconds = (route.get("summary") or {}).get("duration")
      if route.get("result_code") == 0 and type(seconds) is int and seconds >= 0:
        return seconds
  except (httpx.HTTPError, AttributeError, KeyError, TypeError, ValueError):
    pass
  return None


def travel_times(latitude, longitude, restaurants):
  if not settings.kakao_mobility_key or latitude is None or longitude is None:
    return {}
  destinations = [item for item in restaurants if item.get("latitude") is not None and item.get("longitude") is not None and not item["is_demo"]]
  if not destinations:
    return {}
  headers = {"Authorization": "KakaoAK " + settings.kakao_mobility_key, "Content-Type": "application/json"}
  with httpx.Client(base_url="https://apis-navi.kakaomobility.com", headers=headers, timeout=KAKAO_TIMEOUT_SECONDS) as client:
    with ThreadPoolExecutor(max_workers=min(5, len(destinations))) as workers:
      pending = {item["id"]: workers.submit(route_seconds, client, (latitude, longitude), item) for item in destinations}
      return {identity: task.result() for identity, task in pending.items()}
