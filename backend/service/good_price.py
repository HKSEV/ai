import json
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from functools import lru_cache

from entity.models import utcnow
from service.common import timestamp


API_URL = "https://api.odcloud.kr/api/15172358/v1/uddi:d45599dd-2090-4bbb-abde-dbe9f9c6e75a"
SOURCE_URL = "https://www.data.go.kr/data/15172358/fileData.do"
SOURCE_NAME = "행정안전부 착한가격업소"
SNAPSHOT_DATE = datetime(2026, 9, 30)
SNAPSHOT_MAX_AGE = timedelta(days=120)


def normalized(value):
  return "".join(unicodedata.normalize("NFKC", value).casefold().split())


def branch_key(name, address):
  street = normalized(address)
  street = re.sub(r"^서울(?:특별시|시)?", "", street)
  street = re.sub(r"\([^(),]*동\)$", "", street)
  return normalized(name), street


def menu_rows(rows):
  for row in rows:
    if not isinstance(row, dict) or row.get("광역") not in {"서울", "서울특별시", "서울시"} or row.get("기초") != "노원구":
      continue
    name, address = (row.get(key) for key in ("업소명", "주소"))
    if not isinstance(name, str) or not name.strip() or not isinstance(address, str) or not address.strip():
      continue
    if not address.strip().startswith(("서울", "노원구")):
      address = "노원구 " + address
    for i in range(1, 5):
      dish = row.get(f"착한가격메뉴 품목{i}")
      price = row.get(f"착한가격메뉴 가격{i}")
      if isinstance(dish, str) and dish.strip() and len(dish.strip()) <= 100:
        yield {"name": name, "address": address, "menu": dish.strip(),
               "price": price if type(price) is int and 0 < price <= 10000000 else None}


def fetch_price_snapshot(client, api_key):
  page, count = 1, 0
  entries = []
  while True:
    response = client.get(API_URL, params={"page": page, "perPage": 100}, headers={"Authorization": "Infuser " + api_key})
    response.raise_for_status()
    payload = response.json()
    rows = payload["data"]
    expected = payload.get("matchCount", payload.get("totalCount"))
    if not isinstance(rows, list) or type(expected) is not int or expected < 0 or count + len(rows) > expected:
      raise ValueError("착한가격업소 응답 형식을 확인해 주세요.")
    if not rows and count < expected:
      raise ValueError("착한가격업소 자료를 끝까지 받지 못했습니다.")
    entries.extend(menu_rows(rows))
    count += len(rows)
    if count == expected:
      return {"checked_at": timestamp(SNAPSHOT_DATE), "menus": entries}
    page += 1


@lru_cache(maxsize=4)
def read_snapshot(path, modified_ns):
  payload = json.loads(path.read_text(encoding="utf-8"))
  checked_at = datetime.fromisoformat(payload["checked_at"]).astimezone(timezone.utc).replace(tzinfo=None)
  grouped = {}
  for entry in payload["menus"]:
    key = branch_key(entry["name"], entry["address"])
    dishes = grouped.setdefault(key, {})
    label = entry["menu"]
    if not isinstance(label, str) or not label.strip() or len(label) > 100:
      continue
    price = entry["price"]
    if type(price) is not int or not 0 < price <= 10000000:
      price = None
    existing = dishes.get(normalized(label))
    if existing is not None and existing[1] != price:
      price = None
    dishes[normalized(label)] = (label, price)
  return checked_at, grouped


def price_menus(path, name, address):
  try:
    checked_at, grouped = read_snapshot(path, path.stat().st_mtime_ns)
  except (OSError, KeyError, TypeError, ValueError):
    return []
  now = utcnow()
  if not now - SNAPSHOT_MAX_AGE <= checked_at <= now:
    return []
  return [{"id": -index, "name": label, "price": price, "servings": None, "available": True,
           "source": SOURCE_NAME, "source_url": SOURCE_URL, "checked_at": timestamp(checked_at), "is_current": True}
          for index, (label, price) in enumerate(grouped.get(branch_key(name, address), {}).values(), 1)]
