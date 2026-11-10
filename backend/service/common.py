import math
from datetime import timezone

from fastapi import HTTPException


def timestamp(value):
  return value.replace(tzinfo=timezone.utc).isoformat() if value else None


def owned(db, model, identity, user_id):
  item = db.get(model, identity)
  if item is None or item.user_id != user_id:
    raise HTTPException(404, "항목을 찾을 수 없습니다.")
  return item


def page_result(items, total, page, size):
  return {"items": items, "total": total, "page": page, "pages": math.ceil(total / size)}
