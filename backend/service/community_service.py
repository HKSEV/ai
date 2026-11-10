from fastapi import HTTPException
from sqlalchemy import func, select

from entity.models import Post, Restaurant, Upload, User, Visit, utcnow
from service.common import owned, page_result, timestamp
from service.upload_service import delete_unlinked_uploads


def serialize_post(db, item, user):
  author = db.get(User, item.user_id)
  restaurant = db.get(Restaurant, item.restaurant_id) if item.restaurant_id else None
  visit = db.get(Visit, item.visit_id) if item.visit_id else None
  return {
    "id": item.id, "kind": item.kind, "title": item.title, "content": item.content,
    "author": author.nickname, "is_owner": item.user_id == user.id,
    "restaurant_id": item.restaurant_id, "restaurant_name": restaurant.name if restaurant else None,
    "rating": item.rating, "visited_on": item.visited_on.isoformat() if item.visited_on else None,
    "visit_id": item.visit_id if item.user_id == user.id else None,
    "receipt_uploaded": bool(visit and visit.receipt_id),
    "verification_status": visit.verification_status if visit else "not_verified",
    "photo_ids": item.photo_ids, "photo_urls": ["/api/uploads/" + value for value in item.photo_ids],
    "created_at": timestamp(item.created_at), "updated_at": timestamp(item.updated_at),
  }


def list_posts(db, user, kind, mine, sort, page, size):
  query = select(Post)
  if kind:
    query = query.where(Post.kind == kind)
  if mine:
    query = query.where(Post.user_id == user.id)
  total = db.scalar(select(func.count()).select_from(query.subquery()))
  order = (Post.created_at.asc(), Post.id.asc()) if sort == "oldest" else (Post.created_at.desc(), Post.id.desc())
  rows = db.scalars(query.order_by(*order).offset((page - 1) * size).limit(size)).all()
  return page_result([serialize_post(db, row, user) for row in rows], total, page, size)


def save_post(db, user, data, identity=None):
  item = owned(db, Post, identity, user.id) if identity else Post(user_id=user.id)
  if data.restaurant_id and db.get(Restaurant, data.restaurant_id) is None:
    raise HTTPException(404, "음식점을 찾을 수 없습니다.")
  if data.visit_id:
    visit = owned(db, Visit, data.visit_id, user.id)
    if visit.restaurant_id != data.restaurant_id or visit.visited_on != data.visited_on:
      raise HTTPException(422, "방문 기록의 음식점과 방문일이 리뷰와 일치해야 합니다.")
  for photo_id in data.photo_ids:
    photo = owned(db, Upload, photo_id, user.id)
    if photo.kind != "photo":
      raise HTTPException(422, "리뷰 사진만 첨부할 수 있습니다.")
    used = db.scalar(select(Post).where(Post.photo_ids.contains(photo_id)))
    if used and used.id != identity:
      raise HTTPException(409, "다른 게시글에서 사용 중인 사진입니다.")
  previous_photos = item.photo_ids or []
  for key, value in data.model_dump().items():
    setattr(item, key, value)
  item.updated_at = utcnow()
  db.add(item)
  db.commit()
  delete_unlinked_uploads(db, set(previous_photos) - set(item.photo_ids), user.id)
  return serialize_post(db, item, user)
