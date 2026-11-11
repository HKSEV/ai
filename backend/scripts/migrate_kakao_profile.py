from sqlalchemy import inspect, text

from config.database import engine


def migrate(connection):
  schema = inspect(connection)
  if not schema.has_table("users"):
    raise SystemExit("먼저 python -m scripts.init_db로 테이블을 생성하세요.")
  existing = {column["name"] for column in schema.get_columns("users")}
  columns = {
    "email": "email VARCHAR(320) NULL",
    "address_setup_pending": "address_setup_pending BOOLEAN NOT NULL DEFAULT 0",
  }
  for name, definition in columns.items():
    if name not in existing:
      connection.execute(text("ALTER TABLE users ADD COLUMN " + definition))


def main():
  if engine is None:
    raise SystemExit("backend/.env에 MySQL 연결 정보를 설정해 주세요.")
  with engine.begin() as connection:
    migrate(connection)
  print("카카오 이메일과 주소 지정 상태 컬럼을 확인했습니다.")


if __name__ == "__main__":
  main()
