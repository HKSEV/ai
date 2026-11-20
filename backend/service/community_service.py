from fastapi import HTTPException
from sqlalchemy import func, select

from entity.models import ADMIN, Post, Restaurant, Upload, User, Visit, utcnow
from service.admin_audit import record_admin_action
from service.common import owned, page_result, timestamp
from service.profile_service import serialize_verification
from service.upload_service import delete_unlinked_uploads


def serialize_post(db, item, user):
  author = db.get(User, item.user_id)
  restaurant = db.get(Restaurant, item.restaurant_id) if item.restaurant_id else None
  visit = db.get(Visit, item.visit_id) if item.visit_id else None
  if visit and (visit.restaurant_id, visit.visited_on) != (item.restaurant_id, item.visited_on):
    visit = None
  return {
    "id": item.id, "kind": item.kind, "title": item.title, "content": item.content,
    "author": author.nickname, "is_owner": item.user_id == user.id,
    "restaurant_id": item.restaurant_id, "restaurant_name": restaurant.name if restaurant else None,
    "rating": item.rating, "visited_on": item.visited_on.isoformat() if item.visited_on else None,
    "visit_id": visit.id if visit and item.user_id == user.id else None,
    "receipt_uploaded": bool(visit and visit.receipt_id),
    **serialize_verification(visit),
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
  item = owned(db, Post, identity, user.id, lock=True) if identity else Post(user_id=user.id)
  if data.restaurant_id:
    restaurant = db.get(Restaurant, data.restaurant_id, with_for_update={"read": True})
    if restaurant is None or (restaurant.deleted_at and item.restaurant_id != restaurant.id):
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
  if identity is None:
    item.created_at = item.updated_at
  db.add(item)
  db.commit()
  delete_unlinked_uploads(db, set(previous_photos) - set(item.photo_ids), user.id)
  return serialize_post(db, item, user)


def update_post_as_admin(db, admin, identity, data):
  item = db.get(Post, identity, with_for_update=True)
  if item is None:
    raise HTTPException(404, "게시글을 찾을 수 없습니다.")
  if "rating" in data.model_fields_set:
    if (item.kind == "review") != (data.rating is not None):
      raise HTTPException(422, "음식점 리뷰에는 별점이 필요하며 서비스 사용 후기에는 별점을 입력할 수 없습니다.")
    item.rating = data.rating
  item.title = data.title
  item.content = data.content
  item.updated_at = utcnow()
  record_admin_action(db, admin, "post_update", item.id, item.title)
  db.commit()
  return serialize_post(db, item, admin)


def delete_post(db, user, identity):
  item = db.scalar(select(Post).where(Post.id == identity).with_for_update())
  if item is None or (item.user_id != user.id and user.role != ADMIN):
    raise HTTPException(404, "게시글을 찾을 수 없습니다.")
  photos, owner_id = item.photo_ids, item.user_id
  if user.role == ADMIN:
    record_admin_action(db, user, "post_delete", item.id, item.title)
  db.delete(item)
  db.commit()
  delete_unlinked_uploads(db, photos, owner_id)
