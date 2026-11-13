from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import func, literal_column, or_, select

from entity.models import ADMIN, AdminAction, Menu, Post, Restaurant, SearchRecord, Upload, User, Visit, utcnow
from service.admin_audit import record_admin_action
from service.common import page_result, timestamp
from service.profile_service import serialize_user
from service.upload_service import remove_files


KST = ZoneInfo("Asia/Seoul")


def kst_boundary(day):
  return datetime.combine(day, time.min, KST).astimezone(timezone.utc).replace(tzinfo=None)


def daily_counts(db, model, start, end, kind=None):
  local_time = (func.date_add(model.created_at, literal_column("INTERVAL 9 HOUR")) if db.get_bind().dialect.name == "mysql"
                else func.datetime(model.created_at, "+9 hours"))
  day = func.date(local_time)
  query = select(day, func.count()).where(model.created_at >= start, model.created_at < end).group_by(day)
  if kind:
    query = query.where(Post.kind == kind)
  return {str(day): count for day, count in db.execute(query)}


def dashboard(db, days):
  today = datetime.now(KST).date()
  dates = [today - timedelta(days=days - 1 - index) for index in range(days)]
  start, end = kst_boundary(dates[0]), kst_boundary(today + timedelta(days=1))
  series = {
    "signups": daily_counts(db, User, start, end),
    "experiences": daily_counts(db, Post, start, end, "experience"),
    "reviews": daily_counts(db, Post, start, end, "review"),
    "search_requests": daily_counts(db, SearchRecord, start, end),
  }
  trend = [{"date": day.isoformat(), **{name: counts.get(day.isoformat(), 0) for name, counts in series.items()}} for day in dates]
  actions = db.scalars(select(AdminAction).order_by(AdminAction.id.desc()).limit(12)).all()
  return {
    "days": days, "trend": trend,
    "totals": {
      "users": db.scalar(select(func.count(User.id))),
      "new_users": sum(series["signups"].values()),
      "experiences": db.scalar(select(func.count(Post.id)).where(Post.kind == "experience")),
      "reviews": db.scalar(select(func.count(Post.id)).where(Post.kind == "review")),
      "restaurants": db.scalar(select(func.count(Restaurant.id)).where(Restaurant.deleted_at.is_(None))),
      "search_requests": db.scalar(select(func.count(SearchRecord.id))),
    },
    "actions": [{
      "id": item.id, "actor_name": item.actor_name, "action": item.action, "target_id": item.target_id,
      "target_label": item.target_label, "created_at": timestamp(item.created_at),
    } for item in actions],
  }


def list_records(db, query, fields, term, page, size, order, serialize):
  if term.strip():
    value = term.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    query = query.where(or_(*(field.ilike(f"%{value}%", escape="\\") for field in fields)))
  total = db.scalar(select(func.count()).select_from(query.subquery()))
  rows = db.scalars(query.order_by(order).offset((page - 1) * size).limit(size)).all()
  return page_result([serialize(item) for item in rows], total, page, size)


def serialize_restaurant(item):
  return {key: getattr(item, key) for key in ("id", "name", "address", "area", "category", "phone", "latitude", "longitude", "tags", "source_url", "is_demo")}


def get_restaurant(db, identity, *, lock=False):
  query = select(Restaurant).where(Restaurant.id == identity, Restaurant.deleted_at.is_(None))
  item = db.scalar(query.with_for_update() if lock else query)
  if item is None:
    raise HTTPException(404, "음식점을 찾을 수 없습니다.")
  return item


def get_user(db, identity):
  user = db.scalar(select(User).where(User.id == identity).with_for_update())
  if user is None:
    raise HTTPException(404, "사용자를 찾을 수 없습니다.")
  return user


def delete_user(db, admin, identity):
  user = get_user(db, identity)
  if user.role == ADMIN:
    raise HTTPException(409, "관리자 계정은 삭제할 수 없습니다.")
  filenames = db.scalars(select(Upload.filename).where(Upload.user_id == user.id)).all()
  record_admin_action(db, admin, "user_delete", user.id, user.nickname)
  db.delete(user)
  db.commit()
  remove_files(filenames)


def update_restaurant(db, identity, data):
  item = get_restaurant(db, identity, lock=True)
  for key, value in data.model_dump().items():
    setattr(item, key, value)
  item.admin_edited_at = utcnow()
  db.commit()
  return serialize_restaurant(item)


def restaurant_removal_scope(db, identity, *, lock=False):
  counts = {}
  for key, model in (("review_count", Post), ("visit_count", Visit), ("menu_count", Menu)):
    query = select(func.count(model.id)).where(model.restaurant_id == identity)
    counts[key] = db.scalar(query.with_for_update(read=True) if lock else query)
  return counts


def delete_restaurant(db, admin, identity, data):
  item = get_restaurant(db, identity, lock=True)
  if data.model_dump() != restaurant_removal_scope(db, identity, lock=True):
    raise HTTPException(409, "연결된 기록이 변경되었습니다. 삭제 범위를 다시 확인해 주세요.")
  item.deleted_at = utcnow()
  record_admin_action(db, admin, "restaurant_delete", item.id, item.name)
  db.commit()
