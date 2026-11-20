from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from config.database import get_db
from dto.account import ProfileInput
from dto.admin import PromptName, PromptRestore, PromptUpdate, RestaurantRemoval, RestaurantUpdate, VisitVerification
from dto.community import PostTextInput
from entity.models import Post, Restaurant, User
from service import admin_service, community_service, profile_service, prompt_service
from service.auth_service import current_admin


router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(current_admin)])
Search = Annotated[str, Query(max_length=100)]
Page = Annotated[int, Query(ge=1)]
Size = Annotated[int, Query(ge=1, le=50)]


@router.get("/dashboard")
def dashboard(days: Literal["7", "30"] = "7", db=Depends(get_db)):
  return admin_service.dashboard(db, int(days))


@router.get("/prompts/{name}")
def prompt(name: PromptName, db=Depends(get_db)):
  return prompt_service.prompt_details(db, name)


@router.get("/prompts/{name}/versions/{version}")
def prompt_version(name: PromptName, version: int, db=Depends(get_db)):
  return {"content": prompt_service.revision_content(db, name, version)}


@router.put("/prompts/{name}")
def update_prompt(name: PromptName, data: PromptUpdate, admin=Depends(current_admin), db=Depends(get_db)):
  return prompt_service.save_revision(db, admin, name, data.expected_version, content=data.content)


@router.post("/prompts/{name}/restore")
def restore_prompt(name: PromptName, data: PromptRestore, admin=Depends(current_admin), db=Depends(get_db)):
  return prompt_service.save_revision(db, admin, name, data.expected_version, restored_from=data.version)


@router.get("/users")
def users(query: Search = "", page: Page = 1, size: Size = 15, db=Depends(get_db)):
  return admin_service.list_records(db, select(User), (User.nickname, User.email), query, page, size, User.id.desc(),
                                    profile_service.serialize_user)


@router.put("/users/{identity}")
def update_user(identity: int, data: ProfileInput, db=Depends(get_db)):
  return profile_service.update_profile(db, admin_service.get_user(db, identity), data)


@router.delete("/users/{identity}", status_code=204)
def delete_user(identity: int, admin=Depends(current_admin), db=Depends(get_db)):
  admin_service.delete_user(db, admin, identity)


@router.get("/users/{identity}/visits")
def user_visits(identity: int, page: Page = 1, size: Size = 10, db=Depends(get_db)):
  user = admin_service.get_user(db, identity, lock=False)
  return profile_service.visits(db, user, page, size, include_private=False)


@router.put("/users/{identity}/visits/{visit_id}/verification")
def verify_visit(identity: int, visit_id: int, data: VisitVerification, admin=Depends(current_admin), db=Depends(get_db)):
  return admin_service.set_visit_verification(db, admin, identity, visit_id, data.verified)


@router.get("/posts")
def posts(query: Search = "", page: Page = 1, size: Size = 15, admin=Depends(current_admin), db=Depends(get_db)):
  return admin_service.list_records(db, select(Post).join(User), (Post.title, Post.content, User.nickname), query,
                                    page, size, Post.id.desc(), lambda item: community_service.serialize_post(db, item, admin))


@router.put("/posts/{identity}")
def update_post(identity: int, data: PostTextInput, admin=Depends(current_admin), db=Depends(get_db)):
  return community_service.update_post_as_admin(db, admin, identity, data)


@router.delete("/posts/{identity}", status_code=204)
def delete_post(identity: int, admin=Depends(current_admin), db=Depends(get_db)):
  community_service.delete_post(db, admin, identity)


@router.get("/restaurants")
def restaurants(query: Search = "", page: Page = 1, size: Size = 15, db=Depends(get_db)):
  statement = select(Restaurant).where(Restaurant.deleted_at.is_(None))
  return admin_service.list_records(db, statement, (Restaurant.name, Restaurant.address, Restaurant.category), query,
                                    page, size, Restaurant.id.desc(), admin_service.serialize_restaurant)


@router.put("/restaurants/{identity}")
def update_restaurant(identity: int, data: RestaurantUpdate, db=Depends(get_db)):
  return admin_service.update_restaurant(db, identity, data)


@router.get("/restaurants/{identity}/deletion-impact")
def restaurant_deletion_impact(identity: int, db=Depends(get_db)):
  admin_service.get_restaurant(db, identity)
  return admin_service.restaurant_removal_scope(db, identity)


@router.delete("/restaurants/{identity}", status_code=204)
def delete_restaurant(identity: int, data: RestaurantRemoval, admin=Depends(current_admin), db=Depends(get_db)):
  admin_service.delete_restaurant(db, admin, identity, data)
