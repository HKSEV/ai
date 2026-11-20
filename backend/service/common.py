import math
import re
import unicodedata
from datetime import timezone

from fastapi import HTTPException


def timestamp(value):
  return value.replace(tzinfo=timezone.utc).isoformat() if value else None


def normalized(value):
  return "".join(unicodedata.normalize("NFKC", value).casefold().split())


def branch_key(name, address):
  street = normalized(address)
  street = re.sub(r"^(?:\d{5})?서울(?:특별시|시)?", "", street)
  street = re.sub(r"\([^(),]*동\)$", "", street)
  return normalized(name), street


def owned(db, model, identity, user_id, *, lock=False):
  item = db.get(model, identity, with_for_update=True if lock else None)
  if item is None or item.user_id != user_id:
    raise HTTPException(404, "항목을 찾을 수 없습니다.")
  return item


def page_result(items, total, page, size):
  return {"items": items, "total": total, "page": page, "pages": math.ceil(total / size)}
