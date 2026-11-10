from io import BytesIO
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select

from config.database import get_db
from config.settings import settings
from entity.models import Post, Upload, Visit
from service.auth_service import current_user
from service.common import owned
from service.upload_service import delete_unlinked_uploads


router = APIRouter(prefix="/api/uploads", tags=["media"])
Image.MAX_IMAGE_PIXELS = 16000000


@router.post("", status_code=201)
async def upload(kind: Literal["photo", "receipt"], file: UploadFile = File(...), user=Depends(current_user), db=Depends(get_db)):
  raw = await file.read(5 * 1024 * 1024 + 1)
  await file.close()
  if len(raw) > 5 * 1024 * 1024:
    raise HTTPException(413, "사진은 5MB 이하로 첨부해 주세요.")
  try:
    with Image.open(BytesIO(raw)) as image:
      if image.format not in {"JPEG", "PNG", "WEBP"} or image.width * image.height > 16000000:
        raise ValueError()
      image.load()
      image = image.convert("RGB")
      image.thumbnail((2400, 2400))
      output = BytesIO()
      image.save(output, format="JPEG", quality=88)
  except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
    raise HTTPException(422, "JPG, PNG, WebP 이미지 파일을 첨부해 주세요.") from None
  identity = uuid4().hex
  filename = identity + ".jpg"
  settings.uploads_dir.mkdir(parents=True, exist_ok=True)
  path = settings.uploads_dir / filename
  path.write_bytes(output.getvalue())
  item = Upload(id=identity, filename=filename, kind=kind, user_id=user.id)
  try:
    db.add(item)
    db.commit()
  except Exception:
    path.unlink(missing_ok=True)
    raise
  return {"id": identity, "url": "/api/uploads/" + identity, "kind": kind, "verification_status": "not_verified"}


@router.get("/{identity}")
def download(identity: str, user=Depends(current_user), db=Depends(get_db)):
  item = db.get(Upload, identity)
  if not item:
    raise HTTPException(404, "파일을 찾을 수 없습니다.")
  public_photo = item.kind == "photo" and db.scalar(select(Post.id).where(Post.photo_ids.contains(identity)).limit(1))
  if item.user_id != user.id and not public_photo:
    raise HTTPException(404, "파일을 찾을 수 없습니다.")
  path = settings.uploads_dir / item.filename
  if not path.is_file():
    raise HTTPException(404, "파일을 찾을 수 없습니다.")
  return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@router.delete("/{identity}", status_code=204)
def delete_upload(identity: str, user=Depends(current_user), db=Depends(get_db)):
  owned(db, Upload, identity, user.id)
  if db.scalar(select(Post.id).where(Post.photo_ids.contains(identity)).limit(1)) or db.scalar(select(Visit.id).where(Visit.receipt_id == identity).limit(1)):
    raise HTTPException(409, "사용 중인 파일입니다. 연결된 기록에서 먼저 삭제해 주세요.")
  delete_unlinked_uploads(db, [identity], user.id)
