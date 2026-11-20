from fastapi import HTTPException
from sqlalchemy import and_, func, select, update
from sqlalchemy.exc import IntegrityError

from entity.models import Address, Post, Restaurant, Upload, User, Visit
from service.auth_service import nickname_key
from service.common import owned, page_result, timestamp
from service.upload_service import delete_unlinked_uploads


def serialize_user(user):
  return {
    "id": user.id, "nickname": user.nickname, "email": user.email, "role": user.role,
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
  return {key: getattr(item, key) for key in ["id", "label", "address", "detail_address", "latitude", "longitude", "is_default"]}


def addresses(db, user, *, lock=False):
  query = select(Address).where(Address.user_id == user.id).order_by(Address.is_default.desc(), Address.id)
  return db.scalars(query.with_for_update() if lock else query).all()


def write_address(db, user, data, identity=None, *, replace_default=False):
  existing = addresses(db, user, lock=True)
  if replace_default:
    identity = next((item.id for item in existing if item.is_default), None)
  item = owned(db, Address, identity, user.id) if identity else Address(user_id=user.id)
  if identity is None and len(existing) >= 10:
    raise HTTPException(422, "주소는 최대 10개까지 등록할 수 있습니다.")
  was_default = bool(item.is_default)
  values = data.model_dump()
  if data.detail_address is None:
    values.pop("detail_address")
  values["is_default"] = data.is_default or not existing or was_default
  if values["is_default"]:
    for entry in existing:
      entry.is_default = False
  for key, value in values.items():
    setattr(item, key, value)
  db.add(item)
  return item


def save_address(db, user, data, identity=None):
  db.scalar(select(User).where(User.id == user.id).with_for_update())
  item = write_address(db, user, data, identity)
  db.commit()
  return serialize_address(item)


def complete_onboarding(db, user, data):
  # Claim completion and save the address in the same transaction on SQLite and MySQL.
  result = db.execute(update(User).where(User.id == user.id, User.address_setup_pending.is_(True)).values(
    **data.model_dump(exclude={"address"}), address_setup_pending=False,
  ))
  completed = result.rowcount == 1
  if completed:
    write_address(db, user, data.address.model_copy(update={"is_default": True}), replace_default=True)
  db.commit()
  db.refresh(user)
  return {"user": serialize_user(user), "completed": completed}


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


def serialize_verification(item):
  if item and item.admin_verified:
    return {"verification_status": "verified", "verification_reason": "관리자 임시 인증"}
  return {"verification_status": item.verification_status if item else "not_verified", "verification_reason": None}


def serialize_visit(db, item, *, include_private=True):
  restaurant = db.get(Restaurant, item.restaurant_id)
  result = {
    "id": item.id, "restaurant_id": item.restaurant_id, "restaurant_name": restaurant.name,
    "visited_on": item.visited_on.isoformat(), "receipt_uploaded": bool(item.receipt_id),
    "admin_verified": item.admin_verified, **serialize_verification(item),
    "created_at": timestamp(item.created_at),
  }
  if include_private:
    result.update(note=item.note, receipt_id=item.receipt_id)
  return result


def visits(db, user, page, size, *, include_private=True):
  query = select(Visit).where(Visit.user_id == user.id)
  total = db.scalar(select(func.count()).select_from(query.subquery()))
  rows = db.scalars(query.order_by(Visit.visited_on.desc(), Visit.id.desc()).offset((page - 1) * size).limit(size)).all()
  return page_result([serialize_visit(db, item, include_private=include_private) for item in rows], total, page, size)


def visit_options(db, user, restaurant_id):
  rows = db.execute(select(Visit.id, Visit.visited_on).where(
    Visit.user_id == user.id, Visit.restaurant_id == restaurant_id,
  ).order_by(Visit.visited_on.desc(), Visit.id.desc()))
  return [{"id": row.id, "visited_on": row.visited_on.isoformat()} for row in rows]


def visit_journey(db, user):
  rows = db.execute(select(
    Visit.id, Visit.restaurant_id, Restaurant.name, Visit.visited_on, Restaurant.latitude, Restaurant.longitude,
    Post.id.label("review_id"), Post.rating,
  ).join(Restaurant, Restaurant.id == Visit.restaurant_id).outerjoin(Post, and_(
    Post.visit_id == Visit.id, Post.kind == "review", Post.user_id == Visit.user_id,
    Post.restaurant_id == Visit.restaurant_id, Post.visited_on == Visit.visited_on,
  )).where(Visit.user_id == user.id).order_by(Visit.visited_on, Visit.id, Post.id))
  results = {}
  for row in rows:
    visit = results.setdefault(row.id, {
      "id": row.id, "restaurant_id": row.restaurant_id, "restaurant_name": row.name,
      "visited_on": row.visited_on.isoformat(), "latitude": row.latitude, "longitude": row.longitude, "reviews": [],
    })
    if row.review_id is not None and row.rating is not None:
      visit["reviews"].append({"id": row.review_id, "rating": row.rating})
  return list(results.values())


def save_visit(db, user, data, identity=None):
  item = owned(db, Visit, identity, user.id, lock=True) if identity else Visit(user_id=user.id)
  restaurant = db.get(Restaurant, data.restaurant_id, with_for_update={"read": True})
  if restaurant is None or (restaurant.deleted_at and item.restaurant_id != restaurant.id):
    raise HTTPException(404, "음식점을 찾을 수 없습니다.")
  if data.receipt_id:
    receipt = owned(db, Upload, data.receipt_id, user.id)
    if receipt.kind != "receipt":
      raise HTTPException(422, "영수증 파일을 선택해 주세요.")
    used = db.scalar(select(Visit).where(Visit.receipt_id == data.receipt_id))
    if used and used.id != identity:
      raise HTTPException(409, "다른 방문 기록에 사용 중인 영수증입니다.")
  previous_receipt = item.receipt_id
  if (item.restaurant_id, item.visited_on, previous_receipt) != (data.restaurant_id, data.visited_on, data.receipt_id):
    item.verification_status = "not_verified"
    item.admin_verified = False
  for key, value in data.model_dump().items():
    setattr(item, key, value)
  db.add(item)
  db.commit()
  if previous_receipt and previous_receipt != item.receipt_id:
    delete_unlinked_uploads(db, [previous_receipt], user.id)
  return serialize_visit(db, item)
