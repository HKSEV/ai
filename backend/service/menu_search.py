import re
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from time import monotonic

import httpx

from config.settings import settings
from entity.models import utcnow
from service.common import normalized, timestamp
from service.public_web import https_url, read_page
from service.published_menu import published_menu


WEB_SEARCH_URL = "https://dapi.kakao.com/v2/search/web"
STREET_NUMBER = re.compile(r"(?:로|길|동|가|리|읍|면)\s*\d")
MENU_LOOKUP_LIMIT = 12


def search_urls(client, restaurant, key):
  response = client.get(WEB_SEARCH_URL, params={
    "query": f"{restaurant['name']} {restaurant['address']} 메뉴 가격",
    "size": 6,
  }, headers={"Authorization": "KakaoAK " + key})
  response.raise_for_status()
  return [item["url"] for item in response.json()["documents"] if isinstance(item.get("url"), str)]


def lookup_menu(search, restaurant, key):
  deadline = monotonic() + 6
  try:
    results = search_urls(search, restaurant, key)
  except (httpx.HTTPError, AttributeError, KeyError, ValueError, TypeError):
    return []
  pending, visited, robots = deque(results), set(), {}
  menus = {}
  with httpx.Client(trust_env=False, limits=httpx.Limits(max_keepalive_connections=0)) as pages:
    while pending and len(visited) < 6 and monotonic() < deadline:
      result = pending.popleft()
      if result in visited:
        continue
      visited.add(result)
      try:
        page = read_page(pages, result, deadline, robots)
        if not page:
          continue
        source, html = page
        rows, links = published_menu(html, restaurant["name"], restaurant["address"])
        origin = httpx.URL(source)
        for link in links[:3]:
          parsed = https_url(str(origin.join(link)))
          if parsed and parsed.host == origin.host:
            pending.appendleft(str(parsed))
      except (httpx.HTTPError, httpx.InvalidURL, OSError, ValueError, AssertionError, RecursionError):
        continue
      for name, price in rows:
        label = normalized(name)
        previous = menus.get(label)
        if previous and previous.get("price_conflict"):
          continue
        if previous is None or (previous["price"] is None and price is not None):
          menus[label] = {"name": name, "price": price, "source_url": source}
        elif price is not None and previous["price"] != price:
          previous["price"] = None
          previous["price_conflict"] = True
  checked_at = timestamp(utcnow())
  return [{
    **menu, "id": -index, "servings": None, "available": True,
    "source": "매장 공개 메뉴", "checked_at": checked_at, "is_current": True,
  } for index, menu in enumerate(menus.values(), 1)]


def find_published_menus(candidates):
  key = settings.kakao_local_key or settings.kakao_rest_api_key
  if not key:
    return {}
  restaurants = [row for row in candidates if not row["is_demo"] and STREET_NUMBER.search(row["address"])][:MENU_LOOKUP_LIMIT]
  if not restaurants:
    return {}
  with httpx.Client(timeout=2.5) as search, ThreadPoolExecutor(max_workers=6) as workers:
    pending = {item["id"]: workers.submit(lookup_menu, search, item, key) for item in restaurants}
    return {identity: future.result() for identity, future in pending.items()}
