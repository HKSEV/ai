from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from entity.models import Address, Restaurant, Upload, User, Visit
from service.auth_service import nickname_key
from service.common import owned, page_result, timestamp
from service.upload_service import delete_unlinked_uploads


def serialize_user(user):
  return {
    "id": user.id, "nickname": user.nickname, "email": user.email,
    "address_setup_pending": user.address_setup_pending, "preferences": user.preferences,
    "budget_min": user.budget_min, "budget_max": user.budget_max, "created_at": timestamp(user.created_at),
  }


def update_profile(db, user, data):
  user.nickname = data.nickname
  user.nickname_key = nickname_key(data.nickname)
  user.preferences = data.preferences
  user.budget_min = data.budget_min
  user.budget_max = data.budget_max
  try:
    db.commit()
  except IntegrityError:
    db.rollback()
    raise HTTPException(409, "이미 사용 중인 닉네임입니다.") from None
  return serialize_user(user)


def serialize_address(item):
  return {key: getattr(item, key) for key in ["id", "label", "address", "latitude", "longitude", "is_default"]}


def addresses(db, user):
  return db.scalars(select(Address).where(Address.user_id == user.id).order_by(Address.is_default.desc(), Address.id)).all()


def save_address(db, user, data, identity=None):
  db.scalar(select(User).where(User.id == user.id).with_for_update())
  existing = addresses(db, user)
  item = owned(db, Address, identity, user.id) if identity else Address(user_id=user.id)
  if identity is None and len(existing) >= 10:
    raise HTTPException(422, "주소는 최대 10개까지 등록할 수 있습니다.")
  was_default = bool(item.is_default)
  values = data.model_dump()
  values["is_default"] = data.is_default or not existing or was_default
  if values["is_default"]:
    for entry in existing:
      entry.is_default = False
  for key, value in values.items():
    setattr(item, key, value)
  if item.is_default and item.latitude is not None and item.longitude is not None:
    user.address_setup_pending = False
  db.add(item)
  db.commit()
  return serialize_address(item)


def delete_address(db, user, identity):
  db.scalar(select(User).where(User.id == user.id).with_for_update())
  item = owned(db, Address, identity, user.id)
  default = item.is_default
  db.delete(item)
  db.flush()
  if default:
    replacement = db.scalar(select(Address).where(Address.user_id == user.id).order_by(Address.id))
    if replacement:
      replacement.is_default = True
  db.commit()


def serialize_visit(db, item):
  restaurant = db.get(Restaurant, item.restaurant_id)
  return {
    "id": item.id, "restaurant_id": item.restaurant_id, "restaurant_name": restaurant.name,
    "visited_on": item.visited_on.isoformat(), "note": item.note, "receipt_id": item.receipt_id,
    "receipt_uploaded": bool(item.receipt_id), "verification_status": item.verification_status,
    "created_at": timestamp(item.created_at),
  }


def visits(db, user, page, size):
  query = select(Visit).where(Visit.user_id == user.id)
  total = db.scalar(select(func.count()).select_from(query.subquery()))
  rows = db.scalars(query.order_by(Visit.visited_on.desc(), Visit.id.desc()).offset((page - 1) * size).limit(size)).all()
  return page_result([serialize_visit(db, item) for item in rows], total, page, size)


def save_visit(db, user, data, identity=None):
  item = owned(db, Visit, identity, user.id) if identity else Visit(user_id=user.id)
  if db.get(Restaurant, data.restaurant_id) is None:
    raise HTTPException(404, "음식점을 찾을 수 없습니다.")
  if data.receipt_id:
    receipt = owned(db, Upload, data.receipt_id, user.id)
    if receipt.kind != "receipt":
      raise HTTPException(422, "영수증 파일을 선택해 주세요.")
    used = db.scalar(select(Visit).where(Visit.receipt_id == data.receipt_id))
    if used and used.id != identity:
      raise HTTPException(409, "다른 방문 기록에 사용 중인 영수증입니다.")
  previous_receipt = item.receipt_id
  for key, value in data.model_dump().items():
    setattr(item, key, value)
  item.verification_status = "not_verified"
  db.add(item)
  db.commit()
  if previous_receipt and previous_receipt != item.receipt_id:
    delete_unlinked_uploads(db, [previous_receipt], user.id)
  return serialize_visit(db, item)
