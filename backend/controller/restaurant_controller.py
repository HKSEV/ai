from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select

from config.database import get_db
from config.settings import settings
from entity.models import Restaurant
from service.auth_service import current_user
from service.restaurant_service import serialize_restaurant


router = APIRouter(prefix="/api/restaurants", tags=["restaurants"])


@router.get("")
def restaurants(query: str = Query("", max_length=100), user=Depends(current_user), db=Depends(get_db)):
  statement = select(Restaurant)
  if not settings.include_demo:
    statement = statement.where(Restaurant.is_demo.is_(False))
  if query:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    statement = statement.where(or_(Restaurant.name.ilike("%" + escaped + "%", escape="\\"), Restaurant.area.ilike("%" + escaped + "%", escape="\\")))
  rows = db.scalars(statement.order_by(Restaurant.name).limit(30)).all()
  return [{"id": item.id, "name": item.name, "address": item.address, "category": item.category, "is_demo": item.is_demo} for item in rows]


@router.get("/{identity}")
def detail(identity: int, user=Depends(current_user), db=Depends(get_db)):
  item = db.get(Restaurant, identity)
  if item is None or (item.is_demo and not settings.include_demo):
    raise HTTPException(404, "음식점을 찾을 수 없습니다.")
  return serialize_restaurant(db, item)
