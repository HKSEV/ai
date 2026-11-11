import io
import json
import os
import tempfile
import unittest
from dataclasses import replace
from datetime import date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

os.environ["APP_ENV"] = "test"

import httpx
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from config.database import Base, create_database_engine, get_db
from config.settings import settings
from dto.chat import RecommendationResult, SearchConditions
from entity.models import Address, AuthSession, Conversation, Menu, Message, OAuthState, Post, Restaurant, SearchRecord, Upload, User, Visit, utcnow
from main import app
from service import auth_service, chat_service, restaurant_service
from service.restaurant_service import menu_combination, opening_status


class ServiceTests(unittest.TestCase):
  @classmethod
  def setUpClass(cls):
    cls.directory = tempfile.TemporaryDirectory()
    url = os.getenv("TEST_DATABASE_URL", "sqlite:///" + cls.directory.name + "/service_test.sqlite")
    if os.getenv("TEST_DATABASE_URL"):
      parsed = make_url(url)
      if settings.environment != "test" or parsed.drivername != "mysql+pymysql" or not (parsed.database or "").endswith("_test"):
        raise RuntimeError("TEST_DATABASE_URL은 별도 MySQL *_test 데이터베이스여야 합니다.")
    cls.engine = create_database_engine(url)
    cls.factory = sessionmaker(bind=cls.engine, expire_on_commit=False)

  @classmethod
  def tearDownClass(cls):
    Base.metadata.drop_all(cls.engine)
    cls.engine.dispose()
    cls.directory.cleanup()

  def setUp(self):
    Base.metadata.drop_all(self.engine)
    Base.metadata.create_all(self.engine)
    def dependency():
      with self.factory() as db:
        try:
          yield db
        except Exception:
          db.rollback()
          raise
    app.dependency_overrides[get_db] = dependency
    self.client = TestClient(app, headers={"X-Requested-With": "nowon-walk"})
    with self.factory() as db:
      first = User(kakao_id="100", nickname="공릉미식가", nickname_key="공릉미식가", preferences=["한식"], budget_max=20000)
      second = User(kakao_id="200", nickname="상계산책가", nickname_key="상계산책가")
      db.add_all([first, second]); db.flush()
      self.user_id, self.other_id = first.id, second.id
      self.token = auth_service.create_session(db, first)
      self.other_token = auth_service.create_session(db, second)
      restaurant = Restaurant(name="검증용 공릉식탁", external_id="test:1", address="서울 노원구 공릉동", area="공릉동 공릉역", category="한식", source="테스트 제공처", source_url="https://example.com/restaurant", checked_at=utcnow(), tags=["조용한"], hours={"tue": {"open": "11:00", "close": "21:00", "break_start": "15:00", "break_end": "17:00"}}, hours_source="테스트 영업시간", hours_checked_at=utcnow())
      db.add(restaurant); db.flush(); self.restaurant_id = restaurant.id
      db.add_all([Menu(restaurant_id=restaurant.id, name="찌개 정식", price=14000, servings=1, source="확인한 메뉴판", checked_at=utcnow()), Menu(restaurant_id=restaurant.id, name="4인 세트", price=52000, servings=4, source="확인한 메뉴판", checked_at=utcnow())]); db.commit()
    self.login(self.token)
    self.media_directory = tempfile.TemporaryDirectory()
    self.media_patch = patch("controller.media_controller.settings", replace(settings, uploads_dir=Path(self.media_directory.name)))
    self.cleanup_patch = patch("service.upload_service.settings", replace(settings, uploads_dir=Path(self.media_directory.name)))
    self.media_patch.start(); self.cleanup_patch.start()

  def tearDown(self):
    self.client.close()
    self.media_patch.stop(); self.cleanup_patch.stop()
    self.media_directory.cleanup()
    app.dependency_overrides.clear()

  def login(self, token):
    self.client.cookies.clear()
    self.client.cookies.set("nowon_session", token, domain="testserver.local", path="/")

  def profile(self, **overrides):
    return {"nickname": "노원한입탐험가", "preferences": ["한식", "일식"], "budget_min": 10000, "budget_max": 25000, **overrides}

  def post(self, **overrides):
    return {"kind": "experience", "title": "산책 서비스 사용 후기", "content": "동네에서 새로운 한 끼를 찾는 경험이 좋았습니다.", **overrides}

  def image(self, kind="photo"):
    stream = io.BytesIO()
    Image.new("RGB", (16, 16), "green").save(stream, format="PNG")
    result = self.client.post("/api/uploads?kind=" + kind, files={"file": ("image.png", stream.getvalue(), "image/png")})
    self.assertEqual(result.status_code, 201, result.text)
    return result.json()["id"]

  def ai(self, conditions=None, ranked=None):
    conditions = conditions or {"area": "공릉동", "cuisine": "찌개", "party_size": 4, "budget_total": 60000}
    ranked = ranked or {"items": [{"restaurant_id": self.restaurant_id, "evidence_keys": ["area", "menu_budget"]}]}
    def generate(client, prompt, data, schema):
      if schema is SearchConditions:
        return schema.model_validate(conditions)
      return schema.model_validate(ranked)
    return patch("service.chat_service.generate_structured", side_effect=generate)

  def test_profile_persists_and_nickname_validation(self):
    response = self.client.put("/api/me", json=self.profile())
    self.assertEqual(response.status_code, 200, response.text)
    self.assertEqual(self.client.get("/api/auth/me").json()["nickname"], "노원한입탐험가")
    self.assertEqual(self.client.put("/api/me", json=self.profile(nickname="상계산책가")).status_code, 409)
    self.assertEqual(self.client.put("/api/me", json=self.profile(nickname="<script>")).status_code, 422)
    self.assertEqual(self.client.put("/api/me", json=self.profile(budget_min=50000, budget_max=10000)).status_code, 422)
    self.assertEqual(self.client.put("/api/me", json=self.profile(user_id=self.other_id)).status_code, 422)
    with self.factory() as db:
      user = db.get(User, self.user_id)
      fresh_token = auth_service.create_session(db, user)
    self.login(fresh_token)
    self.assertEqual(self.client.get("/api/auth/me").json()["preferences"], ["한식", "일식"])

  def test_address_crud_default_and_ownership(self):
    payload = {"label": "집", "address": "서울 노원구 공릉로 1"}
    first = self.client.post("/api/me/addresses", json=payload)
    self.assertEqual(first.status_code, 201, first.text)
    identity = first.json()["id"]
    self.assertTrue(first.json()["is_default"])
    other = self.client.post("/api/me/addresses", json={**payload, "label": "직장", "is_default": True}).json()
    self.assertEqual(sum(item["is_default"] for item in self.client.get("/api/me/addresses").json()), 1)
    self.login(self.other_token)
    self.assertEqual(self.client.get("/api/me/addresses").json(), [])
    self.assertEqual(self.client.put("/api/me/addresses/" + str(identity), json=payload).status_code, 404)
    self.assertEqual(self.client.delete("/api/me/addresses/" + str(identity)).status_code, 404)
    self.login(self.token)
    self.assertEqual(self.client.delete("/api/me/addresses/" + str(other["id"])).status_code, 204)
    self.assertTrue(self.client.get("/api/me/addresses").json()[0]["is_default"])

  def test_community_crud_filters_pagination_and_ownership(self):
    response = self.client.post("/api/posts", json=self.post())
    self.assertEqual(response.status_code, 201, response.text)
    identity = response.json()["id"]
    self.client.post("/api/posts", json=self.post(title="두 번째 이야기"))
    listing = self.client.get("/api/posts?size=1&sort=oldest").json()
    self.assertEqual((listing["total"], listing["pages"], listing["items"][0]["id"]), (2, 2, identity))
    self.assertEqual(self.client.get("/api/posts?kind=review").json()["total"], 0)
    self.login(self.other_token)
    self.assertFalse(self.client.get("/api/posts/" + str(identity)).json()["is_owner"])
    self.assertEqual(self.client.get("/api/posts?mine=true").json()["total"], 0)
    self.assertEqual(self.client.put("/api/posts/" + str(identity), json=self.post()).status_code, 404)
    self.assertEqual(self.client.delete("/api/posts/" + str(identity)).status_code, 404)
    self.login(self.token)
    self.assertEqual(self.client.put("/api/posts/" + str(identity), json=self.post(title="수정한 제목")).json()["title"], "수정한 제목")
    self.assertEqual(self.client.delete("/api/posts/" + str(identity)).status_code, 204)
    self.assertEqual(self.client.get("/api/posts/" + str(identity)).status_code, 404)

  def test_review_fields_and_forged_verification_rejected(self):
    self.assertEqual(self.client.post("/api/posts", json=self.post(kind="review")).status_code, 422)
    payload = self.post(kind="review", restaurant_id=self.restaurant_id, rating=5, visited_on="2026-11-01")
    response = self.client.post("/api/posts", json=payload)
    self.assertEqual(response.status_code, 201, response.text)
    self.assertEqual(response.json()["verification_status"], "not_verified")
    self.assertEqual(self.client.post("/api/posts", json={**payload, "verification_status": "verified"}).status_code, 422)
    self.assertEqual(self.client.post("/api/posts", json={**payload, "rating": 6}).status_code, 422)
    self.assertEqual(self.client.post("/api/posts", json={**payload, "restaurant_id": 99999}).status_code, 404)

  def test_receipt_private_and_never_automatically_verified(self):
    receipt = self.image("receipt")
    payload = {"restaurant_id": self.restaurant_id, "visited_on": "2026-11-01", "note": "직접 방문했어요", "receipt_id": receipt}
    visit = self.client.post("/api/me/visits", json=payload)
    self.assertEqual(visit.status_code, 201, visit.text)
    identity = visit.json()["id"]
    self.assertEqual(visit.json()["verification_status"], "not_verified")
    review = self.client.post("/api/posts", json=self.post(kind="review", restaurant_id=self.restaurant_id, rating=4, visited_on="2026-11-01", visit_id=identity))
    self.assertTrue(review.json()["receipt_uploaded"])
    self.assertEqual(self.client.get("/api/uploads/" + receipt).status_code, 200)
    self.login(self.other_token)
    self.assertEqual(self.client.get("/api/uploads/" + receipt).status_code, 404)
    self.assertEqual(self.client.get("/api/me/visits").json()["total"], 0)
    self.assertEqual(self.client.delete("/api/me/visits/" + str(identity)).status_code, 404)
    self.login(self.token)
    self.assertEqual(self.client.delete("/api/me/visits/" + str(identity)).status_code, 204)
    self.assertFalse(self.client.get("/api/posts/" + str(review.json()["id"])).json()["receipt_uploaded"])
    self.assertEqual(self.client.get("/api/uploads/" + receipt).status_code, 404)

  def test_photo_access_attachment_and_cleanup(self):
    photo = self.image()
    self.login(self.other_token)
    self.assertEqual(self.client.get("/api/uploads/" + photo).status_code, 404)
    self.login(self.token)
    post = self.client.post("/api/posts", json=self.post(photo_ids=[photo])).json()
    self.assertEqual(self.client.delete("/api/uploads/" + photo).status_code, 409)
    self.login(self.other_token)
    self.assertEqual(self.client.get("/api/uploads/" + photo).status_code, 200)
    self.login(self.token)
    self.assertEqual(self.client.delete("/api/posts/" + str(post["id"])).status_code, 204)
    self.assertEqual(self.client.get("/api/uploads/" + photo).status_code, 404)
    invalid = self.client.post("/api/uploads?kind=photo", files={"file": ("bad.png", b"not an image", "image/png")})
    self.assertEqual(invalid.status_code, 422)

  @patch("service.chat_service.get_client")
  def test_chat_db_menus_followup_history_and_delete(self, client):
    with self.ai():
      response = self.client.post("/api/chat", json={"message": "공릉동 4명 6만원 찌개"})
    self.assertEqual(response.status_code, 200, response.text)
    conversation = response.json()
    recommendation = conversation["messages"][-1]["recommendations"][0]
    self.assertEqual(recommendation["menu_combination"]["total"], 52000)
    self.assertEqual(recommendation["menu_combination"]["per_person"], 13000)
    self.assertIn("가격", recommendation["reason"])
    with self.factory() as db:
      self.assertEqual(db.scalar(select(func.count()).select_from(Visit)), 0)
      self.assertEqual(db.scalar(select(func.count()).select_from(SearchRecord)), 1)
    captured = []
    def followup(_client, prompt, data, schema):
      if schema is SearchConditions:
        captured.append(data)
        return schema.model_validate({**conversation["conditions"], "cuisine": "한식"})
      return schema.model_validate({"items": [{"restaurant_id": self.restaurant_id, "evidence_keys": ["area"]}]})
    with patch("service.chat_service.generate_structured", side_effect=followup):
      next_response = self.client.post("/api/chat", json={"conversation_id": conversation["id"], "message": "한식으로 바꿔줘"})
    self.assertEqual(next_response.status_code, 200, next_response.text)
    self.assertEqual(captured[0]["previous"]["party_size"], 4)
    self.assertEqual(len(captured[0]["history"]), 2)
    self.login(self.other_token)
    self.assertEqual(self.client.get("/api/conversations/" + str(conversation["id"])).status_code, 404)
    self.assertEqual(self.client.delete("/api/conversations/" + str(conversation["id"])).status_code, 404)
    self.login(self.token)
    self.assertEqual(self.client.delete("/api/conversations/" + str(conversation["id"])).status_code, 204)
    with self.factory() as db:
      self.assertEqual(db.scalar(select(func.count()).select_from(SearchRecord)), 0)
      self.assertEqual(db.scalar(select(func.count()).select_from(Message)), 0)

  @patch("service.chat_service.get_client")
  def test_invalid_ai_restaurant_is_rolled_back(self, client):
    with self.ai(ranked={"items": [{"restaurant_id": 99999, "evidence_keys": []}]}):
      response = self.client.post("/api/chat", json={"message": "공릉동 4명 식사"})
    self.assertEqual(response.status_code, 502, response.text)
    with self.factory() as db:
      self.assertEqual(db.scalar(select(func.count()).select_from(Conversation)), 0)

  @patch("service.chat_service.get_client")
  def test_missing_conditions_ask_and_default_address_used(self, client):
    with self.ai(conditions={"area": None}):
      response = self.client.post("/api/chat", json={"message": "맛집 추천해줘"})
    self.assertEqual(response.status_code, 200, response.text)
    self.assertIn("동네", response.json()["messages"][-1]["content"])
    self.client.post("/api/me/addresses", json={"label": "집", "address": "서울 노원구 공릉동 1"})
    with self.ai(conditions={"party_size": 1}):
      response = self.client.post("/api/chat", json={"message": "근처 혼밥"})
    self.assertEqual(response.status_code, 200, response.text)
    self.assertEqual(response.json()["conditions"]["budget_total"], 20000)

  def test_missing_external_keys_do_not_fake_success(self):
    auth_service_settings = replace(settings, kakao_rest_api_key="")
    with patch("service.auth_service.settings", auth_service_settings):
      self.assertEqual(self.client.get("/api/auth/kakao/authorize").status_code, 503)
    from config.gemini import get_client
    get_client.cache_clear()
    with patch("config.gemini.settings", replace(settings, gemini_api_key="")):
      self.assertEqual(self.client.post("/api/chat", json={"message": "공릉동 식사"}).status_code, 503)
    get_client.cache_clear()

  @patch("service.chat_service.get_client")
  def test_radius_filters_before_ranking_and_retains_origin(self, client):
    with self.factory() as db:
      near = db.get(Restaurant, self.restaurant_id)
      near.latitude, near.longitude = 37.651, 127.06
      for name, latitude in [("반경 밖", 37.68), ("좌표 없음", None)]:
        db.add(Restaurant(name=name, address="서울 노원구", area="노원구", category="한식", source="검증", latitude=latitude, longitude=127.06 if latitude else None))
      db.commit()
    seen = []

    def generate(_client, prompt, data, schema):
      if schema is SearchConditions:
        self.assertNotIn("search_origin", data["previous"])
        return schema(area="내 위치", cuisine="식당", radius_metres=9000, clarification="어느 지역을 찾으시나요?")
      seen.append([item["id"] for item in data["candidates"]])
      return RecommendationResult(items=[{"restaurant_id": self.restaurant_id, "evidence_keys": ["distance"]}])

    with patch("service.chat_service.generate_structured", side_effect=generate):
      missing = self.client.post("/api/chat", json={"message": "내 위치에서 2km 이내 식당"})
      self.assertEqual(missing.status_code, 200)
      self.assertIn("기준 위치", missing.json()["messages"][-1]["content"])
      self.client.post("/api/me/addresses", json={"label": "집", "address": "서울 노원구 테스트 주소", "latitude": 37.65, "longitude": 127.06})
      response = self.client.post("/api/chat", json={"message": "내 위치에서 2km 이내 식당"})
      self.assertEqual(response.status_code, 200, response.text)
      conversation = response.json()
      self.assertEqual(conversation["conditions"]["radius_metres"], 2000)
      self.assertEqual(conversation["conditions"]["search_origin"]["label"], "서울 노원구 테스트 주소")
      self.assertLess(conversation["messages"][-1]["recommendations"][0]["distance_metres"], 2000)
      followup = self.client.post("/api/chat", json={"conversation_id": conversation["id"], "message": "반경 0.5킬로미터로 좁혀줘"})
      self.assertEqual(followup.status_code, 200, followup.text)
      self.assertEqual(followup.json()["conditions"]["radius_metres"], 500)
      self.assertEqual(followup.json()["conditions"]["search_origin"], conversation["conditions"]["search_origin"])
    self.assertEqual(seen, [[self.restaurant_id], [self.restaurant_id]])

  def test_oauth_signup_repeat_nickname_state_and_logout(self):
    configured = replace(settings, kakao_rest_api_key="test-key")
    with patch("service.auth_service.settings", configured), patch("service.auth_service.kakao_identity", return_value=("999", "walk@example.com")):
      url = self.client.get("/api/auth/kakao/authorize").json()["authorization_url"]
      state = httpx.URL(url).params["state"]
      response = self.client.get("/api/auth/kakao/callback", params={"code": "test-code", "state": state}, follow_redirects=False)
      self.assertEqual(response.status_code, 303)
      self.assertTrue(response.headers["location"].endswith("/onboarding/address"))
      user = self.client.get("/api/auth/me").json()
      nickname = user["nickname"]
      self.assertTrue(nickname)
      self.assertTrue(user["address_setup_pending"])
      self.assertEqual(user["email"], "walk@example.com")
      self.assertEqual(self.client.put("/api/me", json=self.profile(email="changed@example.com")).status_code, 422)
      address = self.client.post("/api/me/addresses", json={"label": "집", "address": "서울 노원구 공릉로 1", "latitude": 37.65, "longitude": 127.06})
      self.assertEqual(address.status_code, 201, address.text)
      self.assertTrue(address.json()["is_default"])
      self.assertFalse(self.client.get("/api/auth/me").json()["address_setup_pending"])
      self.assertEqual(self.client.post("/api/auth/logout").status_code, 204)
      self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
      url = self.client.get("/api/auth/kakao/authorize").json()["authorization_url"]
      state = httpx.URL(url).params["state"]
      returning = self.client.get("/api/auth/kakao/callback", params={"code": "test-code", "state": state}, follow_redirects=False)
      self.assertTrue(returning.headers["location"].endswith("/explore"))
      self.assertEqual(self.client.get("/api/auth/me").json()["nickname"], nickname)
      replay = self.client.get("/api/auth/kakao/callback", params={"code": "test-code", "state": state}, follow_redirects=False)
      self.assertIn("login_error", replay.headers["location"])
    with self.factory() as db:
      self.assertEqual(db.scalar(select(func.count()).select_from(User).where(User.kakao_id == "999")), 1)
      self.assertIsNone(db.get(AuthSession, self.client.cookies.get("nowon_session")))

  def test_kakao_real_http_contract_and_trusted_identity(self):
    requests = []
    def handler(request):
      requests.append(request)
      if request.url.path == "/oauth/token":
        return httpx.Response(200, json={"access_token": "server-only-token"})
      return httpx.Response(200, json={"id": 123456})
    real_client = httpx.Client
    with patch("service.auth_service.settings", replace(settings, kakao_rest_api_key="test", kakao_client_secret="test-secret")), patch("service.auth_service.httpx.Client", side_effect=lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs)):
      self.assertEqual(auth_service.kakao_identity("test-code"), ("123456", None))
    self.assertEqual(requests[0].method, "POST")
    self.assertIn(b"client_secret=test-secret", requests[0].content)
    self.assertEqual(requests[1].headers["Authorization"], "Bearer server-only-token")

  def test_nickname_collision_retry_and_nonce_replay(self):
    with self.factory() as db:
      with patch("service.auth_service.random_nickname", side_effect=["공릉미식가", "중계동맛요정9999"]):
        user = auth_service.find_or_create_user(db, "777")
        self.assertEqual(user.nickname, "중계동맛요정9999")
      with patch("service.auth_service.settings", replace(settings, kakao_rest_api_key="test")):
        state, _ = auth_service.authorize(db)
        auth_service.consume_state(db, state, state)
        with self.assertRaises(Exception):
          auth_service.consume_state(db, state, state)

  def test_session_expiry_and_csrf(self):
    with self.factory() as db:
      session = db.get(AuthSession, auth_service.digest(self.token))
      session.expires_at = utcnow() - timedelta(seconds=1); db.commit()
    self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
    self.assertEqual(self.client.post("/api/auth/logout", headers={"X-Requested-With": ""}).status_code, 403)
    self.assertEqual(self.client.post("/api/auth/logout", headers={"Origin": "https://other.example"}).status_code, 403)

  def test_opening_hours_break_overnight_and_stale_prices(self):
    with self.factory() as db:
      restaurant = db.get(Restaurant, self.restaurant_id)
      self.assertEqual(opening_status(restaurant, datetime.fromisoformat("2026-11-10T15:30:00+09:00"))["label"], "브레이크타임")
      restaurant.hours = {"mon": {"open": "18:00", "close": "02:00"}}
      self.assertEqual(opening_status(restaurant, datetime.fromisoformat("2026-11-10T01:00:00+09:00"))["label"], "영업시간 내")
      restaurant.closed_dates = ["2026-11-10"]
      self.assertEqual(opening_status(restaurant, datetime.fromisoformat("2026-11-10T01:00:00+09:00"))["label"], "휴무일")
      restaurant.hours_checked_at = utcnow() - timedelta(days=31)
      self.assertEqual(opening_status(restaurant)["label"], "확인 필요")
      menus = db.scalars(select(Menu).where(Menu.restaurant_id == self.restaurant_id)).all()
      self.assertEqual(menu_combination(menus, 4)["total"], 52000)
      for menu in menus:
        menu.checked_at = utcnow() - timedelta(days=31)
      self.assertIsNone(menu_combination(menus, 4))

  def test_kakao_local_only_nowon_and_no_fabricated_hours(self):
    rows = [{"id": "123", "place_name": "테스트 노원", "address_name": "서울 노원구 상계동", "category_group_code": "FD6", "category_name": "음식점 > 한식", "x": "127.05", "y": "37.65"}, {"id": "999", "place_name": "타지역", "address_name": "서울 강남구", "category_group_code": "FD6", "x": "127", "y": "37"}, {"id": "bad", "place_name": "형식 오류", "address_name": "서울 노원구", "category_group_code": "FD6", "x": "bad", "y": "bad"}]
    with self.factory() as db, patch("service.restaurant_service.query_kakao", return_value=rows):
      restaurant_service.sync_kakao(db, "노원구 식당", None, None); db.commit()
      item = db.scalar(select(Restaurant).where(Restaurant.external_id == "kakao:123"))
      self.assertIsNotNone(item)
      self.assertIsNone(item.hours)
      self.assertIsNone(db.scalar(select(Restaurant).where(Restaurant.external_id == "kakao:999")))


if __name__ == "__main__":
  unittest.main()
