from sqlalchemy import inspect, insert, select, text, update

from config.database import engine
from entity.models import ADMIN, AdminAction, AdminAssignment, PromptRevision, User
from scripts.migrate_kakao_profile import migrate as migrate_kakao_profile


def migrate(connection):
  migrate_kakao_profile(connection)
  schema = inspect(connection)
  if "role" not in {column["name"] for column in schema.get_columns("users")}:
    connection.execute(text(
      "ALTER TABLE users ADD COLUMN role VARCHAR(5) NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN', 'USER'))"
    ))
  restaurant_columns = {column["name"] for column in schema.get_columns("restaurants")}
  for column in ("admin_edited_at", "deleted_at"):
    if column not in restaurant_columns:
      connection.execute(text(f"ALTER TABLE restaurants ADD COLUMN {column} DATETIME NULL"))
  for table in (AdminAssignment.__table__, AdminAction.__table__, PromptRevision.__table__):
    table.create(connection, checkfirst=True)

  assigned = connection.scalar(select(AdminAssignment.user_id).where(AdminAssignment.id == 1))
  if assigned is not None:
    return
  first = connection.scalar(select(User.id).order_by(User.created_at, User.id).limit(1))
  if first is not None:
    connection.execute(update(User).where(User.id == first).values(role=ADMIN))
    connection.execute(insert(AdminAssignment).values(id=1, user_id=first))


def main():
  if engine is None:
    raise SystemExit("backend/.env에 MySQL 연결 정보를 설정해 주세요.")
  with engine.begin() as connection:
    migrate(connection)
  print("관리자 권한과 관리 기능 테이블을 확인했습니다.")


if __name__ == "__main__":
  main()
