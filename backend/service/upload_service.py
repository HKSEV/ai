from sqlalchemy import select

from config.settings import settings
from entity.models import Post, Upload, Visit


def delete_unlinked_uploads(db, ids, user_id):
  filenames = []
  for identity in set(ids):
    item = db.get(Upload, identity)
    if not item or item.user_id != user_id:
      continue
    if db.scalar(select(Post.id).where(Post.photo_ids.contains(identity)).limit(1)) or db.scalar(select(Visit.id).where(Visit.receipt_id == identity).limit(1)):
      continue
    filenames.append(item.filename)
    db.delete(item)
  db.commit()
  for filename in filenames:
    (settings.uploads_dir / filename).unlink(missing_ok=True)
