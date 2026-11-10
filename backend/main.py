import logging

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException

from config.settings import settings
from controller import auth_controller, chat_controller, community_controller, media_controller, profile_controller, restaurant_controller
from service.auth_service import SESSION_COOKIE


app = FastAPI(title="노원맛집산책 API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_url], allow_credentials=True, allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], allow_headers=["Content-Type", "X-Requested-With"])


@app.middleware("http")
async def protect_requests(request: Request, call_next):
  if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
    if request.headers.get("X-Requested-With") != "nowon-walk" or request.headers.get("Origin", settings.frontend_url).rstrip("/") != settings.frontend_url:
      return JSONResponse({"detail": "허용되지 않은 요청입니다."}, status_code=403)
  response = await call_next(request)
  response.headers["X-Content-Type-Options"] = "nosniff"
  response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
  if request.url.path.startswith("/api/"):
    response.headers["Cache-Control"] = "private, no-store"
  return response


@app.exception_handler(HTTPException)
async def handle_http_error(request, exception):
  response = await http_exception_handler(request, exception)
  if exception.status_code == 401:
    response.delete_cookie(SESSION_COOKIE, path="/")
  return response


@app.exception_handler(SQLAlchemyError)
async def handle_database_error(request, exception):
  logging.getLogger("nowon.database").error("Database request failed: %s", type(exception).__name__)
  return JSONResponse({"detail": "데이터베이스 연결이나 초기 설정을 확인해 주세요."}, status_code=503)


@app.get("/api/status")
def status():
  return {
    "database_configured": bool(settings.database_url),
    "kakao_login_configured": bool(settings.kakao_rest_api_key),
    "gemini_configured": bool(settings.gemini_api_key and settings.gemini_model),
    "kakao_local_configured": bool(settings.kakao_local_key and settings.kakao_storage_allowed),
    "realtime_hours": False, "waiting": False, "payment_statistics": False,
    "external_reviews": False, "receipt_verification": False,
  }


for controller in [auth_controller, chat_controller, community_controller, profile_controller, restaurant_controller, media_controller]:
  app.include_router(controller.router)
