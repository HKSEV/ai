from datetime import timedelta

from sqlalchemy import select

from config.database import SessionLocal
from entity.models import Upload, utcnow
from service.upload_service import delete_unlinked_uploads


def main():
  if SessionLocal is None:
    raise SystemExit("MySQL 연결 설정이 필요합니다.")
  with SessionLocal() as db:
    rows = db.scalars(select(Upload).where(Upload.created_at < utcnow() - timedelta(days=1))).all()
    for row in rows:
      delete_unlinked_uploads(db, [row.id], row.user_id)
  print("하루가 지난 미사용 첨부 파일 정리를 완료했습니다.")


if __name__ == "__main__":
  main()
