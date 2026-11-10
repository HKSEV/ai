from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from config.settings import settings


class Base(DeclarativeBase):
  pass


def create_database_engine(url):
  if not url:
    return None
  if url.startswith("mysql+pymysql://"):
    return create_engine(url, pool_pre_ping=True, pool_recycle=1800, connect_args={
      "connect_timeout": 5, "read_timeout": 30, "write_timeout": 30,
    })
  if settings.environment == "test" and url.startswith("sqlite:"):
    engine = create_engine(url, connect_args={"check_same_thread": False})
    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record):
      connection.execute("PRAGMA foreign_keys=ON")
    return engine
  raise RuntimeError("MySQL DATABASE_URL을 설정해 주세요. SQLite는 테스트에서만 허용됩니다.")


engine = create_database_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False) if engine else None


def get_db():
  if SessionLocal is None:
    raise HTTPException(503, "DB 연결 설정이 필요합니다.")
  with SessionLocal() as db:
    try:
      yield db
    except Exception:
      db.rollback()
      raise
