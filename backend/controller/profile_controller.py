from fastapi import APIRouter, Depends, Query, Response

from config.database import get_db
from dto.account import AddressInput, ProfileInput, VisitInput
from entity.models import Visit
from service.auth_service import current_user
from service.common import owned
from service import profile_service as service
from service.upload_service import delete_unlinked_uploads


router = APIRouter(prefix="/api/me", tags=["profile"])


@router.put("")
def profile(data: ProfileInput, user=Depends(current_user), db=Depends(get_db)):
  return service.update_profile(db, user, data)


@router.get("/addresses")
def addresses(user=Depends(current_user), db=Depends(get_db)):
  return [service.serialize_address(item) for item in service.addresses(db, user)]


@router.post("/addresses", status_code=201)
def create_address(data: AddressInput, user=Depends(current_user), db=Depends(get_db)):
  return service.save_address(db, user, data)


@router.put("/addresses/{identity}")
def update_address(identity: int, data: AddressInput, user=Depends(current_user), db=Depends(get_db)):
  return service.save_address(db, user, data, identity)


@router.delete("/addresses/{identity}", status_code=204)
def delete_address(identity: int, user=Depends(current_user), db=Depends(get_db)):
  service.delete_address(db, user, identity)


@router.get("/visits")
def visits(page: int = Query(1, ge=1), size: int = Query(10, ge=1, le=30), user=Depends(current_user), db=Depends(get_db)):
  return service.visits(db, user, page, size)


@router.post("/visits", status_code=201)
def create_visit(data: VisitInput, user=Depends(current_user), db=Depends(get_db)):
  return service.save_visit(db, user, data)


@router.put("/visits/{identity}")
def update_visit(identity: int, data: VisitInput, user=Depends(current_user), db=Depends(get_db)):
  return service.save_visit(db, user, data, identity)


@router.delete("/visits/{identity}", status_code=204)
def delete_visit(identity: int, user=Depends(current_user), db=Depends(get_db)):
  item = owned(db, Visit, identity, user.id)
  receipt_id = item.receipt_id
  db.delete(item)
  db.commit()
  if receipt_id:
    delete_unlinked_uploads(db, [receipt_id], user.id)
