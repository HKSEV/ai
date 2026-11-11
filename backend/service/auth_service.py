import hashlib
import secrets
import unicodedata
from datetime import timedelta
from urllib.parse import urlencode

import httpx
from fastapi import Cookie, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from config.database import get_db
from config.settings import settings
from entity.models import AuthSession, OAuthState, User, utcnow


SESSION_COOKIE = "nowon_session"
STATE_COOKIE = "nowon_oauth"


def digest(value):
  return hashlib.sha256(value.encode()).hexdigest()


def nickname_key(value):
  return unicodedata.normalize("NFKC", value).casefold()


def random_nickname():
  return secrets.choice(["공릉동미식", "노원한입", "상계동맛집", "중계동산책"]) + secrets.choice(["곰", "탐험가", "산책가", "요정"]) + str(secrets.randbelow(10000)).zfill(4)


def authorize(db):
  if not settings.kakao_rest_api_key:
    raise HTTPException(503, "카카오 로그인 설정이 필요합니다.")
  state = secrets.token_urlsafe(40)
  db.execute(delete(OAuthState).where(OAuthState.expires_at < utcnow()))
  db.add(OAuthState(state_hash=digest(state), expires_at=utcnow() + timedelta(minutes=10)))
  db.commit()
  # Kakao presents the app's optional account_email consent on its consent screen.
  query = urlencode({"client_id": settings.kakao_rest_api_key, "redirect_uri": settings.kakao_redirect_uri, "response_type": "code", "state": state})
  return state, "https://kauth.kakao.com/oauth/authorize?" + query


def consume_state(db, state, cookie):
  if not state or not cookie or not secrets.compare_digest(state, cookie):
    raise HTTPException(400, "로그인 요청을 다시 시작해 주세요.")
  result = db.execute(delete(OAuthState).where(
    OAuthState.state_hash == digest(state), OAuthState.expires_at > utcnow(),
  ))
  db.commit()
  if result.rowcount != 1:
    raise HTTPException(400, "로그인 요청이 만료되었거나 이미 사용되었습니다.")


def kakao_identity(code):
  if not settings.kakao_rest_api_key:
    raise HTTPException(503, "카카오 로그인 설정이 필요합니다.")
  data = {"grant_type": "authorization_code", "client_id": settings.kakao_rest_api_key, "redirect_uri": settings.kakao_redirect_uri, "code": code}
  if settings.kakao_client_secret:
    data["client_secret"] = settings.kakao_client_secret
  try:
    with httpx.Client(timeout=15) as client:
      response = client.post("https://kauth.kakao.com/oauth/token", data=data)
      response.raise_for_status()
      token = response.json()["access_token"]
      profile = client.get("https://kapi.kakao.com/v2/user/me", headers={"Authorization": "Bearer " + token})
      profile.raise_for_status()
      payload = profile.json()
      identity = payload["id"]
      if not isinstance(identity, int) or isinstance(identity, bool) or identity <= 0:
        raise ValueError("Invalid Kakao identity")
      account = payload.get("kakao_account")
      email = account.get("email") if isinstance(account, dict) else None
      email = email.strip() if isinstance(email, str) else None
      return str(identity), email if email and len(email) <= 320 else None
  except (httpx.HTTPError, ValueError, KeyError, TypeError):
    raise HTTPException(502, "카카오 인증을 완료하지 못했습니다. 다시 시도해 주세요.") from None


def find_or_create_user(db, kakao_id, email=None):
  for _ in range(20):
    user = db.scalar(select(User).where(User.kakao_id == kakao_id))
    if user:
      if user.email != email:
        user.email = email
        db.commit()
      return user
    nickname = random_nickname()
    user = User(kakao_id=kakao_id, email=email, address_setup_pending=True, nickname=nickname, nickname_key=nickname_key(nickname))
    db.add(user)
    try:
      db.commit()
      return user
    except IntegrityError:
      # End the MySQL REPEATABLE READ snapshot before checking a concurrent signup.
      db.rollback()
  raise HTTPException(503, "닉네임 생성에 실패했습니다. 다시 시도해 주세요.")


def create_session(db, user):
  token = secrets.token_urlsafe(48)
  expires = utcnow() + timedelta(days=settings.session_days)
  db.execute(delete(AuthSession).where(AuthSession.expires_at < utcnow()))
  db.add(AuthSession(token_hash=digest(token), user_id=user.id, expires_at=expires))
  db.commit()
  return token


def current_user(db=Depends(get_db), token: str | None = Cookie(default=None, alias=SESSION_COOKIE)):
  session = db.get(AuthSession, digest(token)) if token and len(token) <= 200 else None
  if session is None or session.expires_at <= utcnow():
    if session:
      db.delete(session)
      db.commit()
    raise HTTPException(401, "로그인이 만료되었습니다. 다시 로그인해 주세요.")
  user = db.get(User, session.user_id)
  if user is None:
    raise HTTPException(401, "다시 로그인해 주세요.")
  return user
