from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from config.database import get_db
from dto.community import PostInput
from entity.models import Post
from service.auth_service import current_user
from service import community_service as service


router = APIRouter(prefix="/api/posts", tags=["community"])


@router.get("")
def list_posts(kind: Literal["experience", "review"] | None = None, mine: bool = False, sort: Literal["newest", "oldest"] = "newest", page: int = Query(1, ge=1), size: int = Query(9, ge=1, le=30), user=Depends(current_user), db=Depends(get_db)):
  return service.list_posts(db, user, kind, mine, sort, page, size)


@router.post("", status_code=201)
def create_post(data: PostInput, user=Depends(current_user), db=Depends(get_db)):
  return service.save_post(db, user, data)


@router.get("/{identity}")
def detail(identity: int, user=Depends(current_user), db=Depends(get_db)):
  item = db.get(Post, identity)
  if item is None:
    raise HTTPException(404, "게시글을 찾을 수 없습니다.")
  return service.serialize_post(db, item, user)


@router.put("/{identity}")
def update_post(identity: int, data: PostInput, user=Depends(current_user), db=Depends(get_db)):
  return service.save_post(db, user, data, identity)


@router.delete("/{identity}", status_code=204)
def delete_post(identity: int, user=Depends(current_user), db=Depends(get_db)):
  service.delete_post(db, user, identity)
