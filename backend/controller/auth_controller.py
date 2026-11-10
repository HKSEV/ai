from fastapi import APIRouter, Cookie, Depends, Query, Response
from fastapi.responses import RedirectResponse

from config.database import get_db
from config.settings import settings
from entity.models import AuthSession
from service import auth_service
from service.profile_service import serialize_user


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/kakao/authorize")
def authorize(response: Response, db=Depends(get_db)):
  state, url = auth_service.authorize(db)
  response.set_cookie(auth_service.STATE_COOKIE, state, max_age=600, httponly=True, secure=settings.cookie_secure, samesite="lax", path="/")
  return {"authorization_url": url}


@router.get("/kakao/callback")
def callback(
  code: str | None = Query(default=None, max_length=3000),
  state: str | None = Query(default=None, max_length=200),
  error: str | None = Query(default=None, max_length=100),
  cookie: str | None = Cookie(default=None, alias=auth_service.STATE_COOKIE),
  db=Depends(get_db),
):
  from fastapi import HTTPException
  try:
    auth_service.consume_state(db, state, cookie)
    if error or not code:
      raise HTTPException(400, "카카오 로그인이 취소되었습니다.")
    user = auth_service.find_or_create_user(db, auth_service.kakao_identity(code))
    token = auth_service.create_session(db, user)
    response = RedirectResponse(settings.frontend_url + "/explore", status_code=303)
    response.set_cookie(auth_service.SESSION_COOKIE, token, max_age=settings.session_days * 86400, httponly=True, secure=settings.cookie_secure, samesite="lax", path="/")
  except HTTPException:
    response = RedirectResponse(settings.frontend_url + "/?login_error=1", status_code=303)
  response.delete_cookie(auth_service.STATE_COOKIE, path="/")
  return response


@router.get("/me")
def me(user=Depends(auth_service.current_user)):
  return serialize_user(user)


@router.post("/logout", status_code=204)
def logout(response: Response, token: str | None = Cookie(default=None, alias=auth_service.SESSION_COOKIE), db=Depends(get_db)):
  session = db.get(AuthSession, auth_service.digest(token)) if token else None
  if session:
    db.delete(session)
    db.commit()
  response.delete_cookie(auth_service.SESSION_COOKIE, path="/")
