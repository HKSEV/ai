import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import URL


ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


def database_url():
  if os.getenv("DATABASE_URL"):
    return os.environ["DATABASE_URL"]
  if not os.getenv("DB_HOST"):
    return ""
  return URL.create(
    "mysql+pymysql", username=os.getenv("DB_USER", "nowon"),
    password=os.getenv("DB_PASSWORD", ""), host=os.environ["DB_HOST"],
    port=int(os.getenv("DB_PORT", "3306")), database=os.getenv("DB_NAME", "nowon_food"),
    query={"charset": "utf8mb4"},
  ).render_as_string(hide_password=False)


@dataclass(frozen=True)
class Settings:
  environment: str = os.getenv("APP_ENV", "development")
  database_url: str = database_url()
  frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
  kakao_rest_api_key: str = os.getenv("KAKAO_REST_API_KEY", "")
  kakao_client_secret: str = os.getenv("KAKAO_CLIENT_SECRET", "")
  kakao_redirect_uri: str = os.getenv("KAKAO_REDIRECT_URI", "http://localhost:3000/api/auth/kakao/callback")
  kakao_local_key: str = os.getenv("KAKAO_LOCAL_REST_API_KEY", "")
  kakao_storage_allowed: bool = os.getenv("KAKAO_PLACE_STORAGE_ALLOWED", "false").lower() == "true"
  kakao_mobility_key: str = os.getenv("KAKAO_MOBILITY_REST_API_KEY", "")
  gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
  gemini_model: str = os.getenv("GEMINI_MODEL", "")
  session_days: int = int(os.getenv("SESSION_DAYS", "14"))
  cookie_secure: bool = os.getenv("COOKIE_SECURE", "false").lower() == "true"
  include_demo: bool = os.getenv("INCLUDE_DEMO_DATA", "false").lower() == "true"
  uploads_dir: Path = Path(os.getenv("UPLOADS_DIR", str(ROOT / "uploads")))
  menu_max_age_days: int = int(os.getenv("DATA_MAX_AGE_DAYS", "30"))


settings = Settings()
