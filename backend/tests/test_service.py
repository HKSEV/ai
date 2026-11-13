import io
import json
import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import date, datetime, timedelta
from pathlib import Path
from threading import Barrier
from types import SimpleNamespace
from unittest.mock import Mock, patch

os.environ["APP_ENV"] = "test"

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient
from google.genai.errors import ServerError
from PIL import Image
from sqlalchemy import delete, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from config.database import Base, create_database_engine, get_db
from config.settings import settings
from dto.chat import RecommendationResult, SearchConditions
from entity.models import Address, AdminAssignment, AuthSession, Conversation, Menu, Message, OAuthState, Post, Restaurant, SearchRecord, Upload, User, Visit, utcnow
from main import app
from scripts.migrate_admin import migrate
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

  def login_admin(self):
    with self.engine.begin() as connection:
      migrate(connection)
    self.login(self.token)

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
    menu = {"name": "4인 세트", "quantity": 1}
    ranked = {"items": [{"restaurant_id": self.restaurant_id, "evidence_keys": ["area", "menu_budget"],
                         "order": {"items": [menu], "estimated_total": 52000}}]}
    with self.ai(ranked=ranked) as generate:
      response = self.client.post("/api/chat", json={"message": "공릉동 4명 6만원 찌개"})
    self.assertEqual(response.status_code, 200, response.text)
    conversation = response.json()
    recommendation = conversation["messages"][-1]["recommendations"][0]
    self.assertEqual(recommendation["menu_combination"]["items"], [menu])
    self.assertEqual(recommendation["menu_combination"]["total"], 52000)
    self.assertEqual(recommendation["menu_combination"]["per_person"], 13000)
    self.assertIn({"name": menu["name"], "price": 52000, "servings": 4}, generate.call_args.args[2]["candidates"][0]["menus"])
    self.assertIn("가격", recommendation["reason"])
    with self.factory() as db:
      self.assertEqual(db.scalar(select(func.count()).select_from(Visit)), 0)
      self.assertEqual(db.scalar(select(func.count()).select_from(SearchRecord)), 1)
    captured = []
    def followup(_client, prompt, data, schema):
      if schema is SearchConditions:
        captured.append(data)
        return schema.model_validate({"cuisine": "한식"})
      return schema.model_validate({"items": [{"restaurant_id": self.restaurant_id, "evidence_keys": ["area"]}]})
    with patch("service.chat_service.generate_structured", side_effect=followup):
      next_response = self.client.post("/api/chat", json={"conversation_id": conversation["id"], "message": "한식으로 바꿔줘"})
    self.assertEqual(next_response.status_code, 200, next_response.text)
    self.assertEqual(captured[0]["previous"]["party_size"], 4)
    self.assertEqual(len(captured[0]["history"]), 2)
    updated = next_response.json()
    self.assertEqual(updated["conditions"]["area"], "공릉동")
    self.assertEqual(updated["conditions"]["cuisine"], "한식")
    self.assertEqual(updated["conditions"]["party_size"], 4)
    self.assertEqual(updated["conditions"]["budget_total"], 60000)
    self.assertEqual(updated["messages"][-1]["recommendations"][0]["id"], self.restaurant_id)
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
  def test_recommendation_reason_uses_the_selected_restaurants_own_facts(self, client):
    with self.factory() as db:
      other = Restaurant(name="검증용 두번째 공릉식탁", address="서울 노원구 공릉동 두번째 주소", area="공릉동", category="한식", source="검증")
      db.add(other); db.commit()
      other_id = other.id

    def generate(_client, _prompt, data, schema):
      if schema is SearchConditions:
        return SearchConditions(cuisine="한식") if data["previous"] else SearchConditions(area="공릉동")
      options = {item["id"]: item["reason_options"] for item in data["candidates"]}
      if data["conditions"]["cuisine"]:
        return RecommendationResult(items=[{"restaurant_id": other_id, "evidence_keys": ["area"], "reason": options[other_id]["area"]}])
      first = options[self.restaurant_id]
      return RecommendationResult(items=[
        {"restaurant_id": self.restaurant_id, "evidence_keys": ["area", "category"], "reason": first["area"] + " " + first["category"]},
        {"restaurant_id": other_id, "evidence_keys": ["area", "opening"], "reason": first["area"] + " 노원역에서 도보 5분입니다."},
      ])

    with patch("service.chat_service.generate_structured", side_effect=generate):
      initial = self.client.post("/api/chat", json={"message": "공릉동에서 식당을 찾아줘"})
      self.assertEqual(initial.status_code, 200, initial.text)
      conversation = initial.json()
      first, second = conversation["messages"][-1]["recommendations"]
      self.assertEqual(first["reason"], "요청하신 지역에서 찾은 음식점입니다. 등록된 음식 분류는 한식입니다.")
      self.assertEqual(second["reason"], "요청하신 지역에서 찾은 음식점입니다.")
      for item in [first, second]:
        self.assertNotIn(item["address"], item["reason"])
      followup = self.client.post("/api/chat", json={"conversation_id": conversation["id"], "message": "그중에서 한식으로 찾아줘"})
      self.assertEqual(followup.status_code, 200, followup.text)
      result = followup.json()
      self.assertEqual(result["conditions"]["area"], "공릉동")
      self.assertEqual([(item["id"], item["reason"]) for item in result["messages"][-1]["recommendations"]], [(other_id, second["reason"])])

  @patch("service.chat_service.get_client")
  def test_chat_uses_gemini_explanations_and_orders_for_each_restaurant(self, client):
    with self.factory() as db:
      first = Restaurant(name="검증용 중계피자", address="서울 노원구 중계로 101", area="중계동", category="음식점 > 양식 > 피자 > 중계피자", source="검증")
      second = Restaurant(name=first.name, address="서울 노원구 중계로 202", area=first.area, category="음식점 > 양식 > 피자", source="검증")
      db.add_all([first, second]); db.commit()
    reason = "두 분이 피자를 나눠 드시기 좋은 선택입니다."
    explanation = "두 분이라면 큰 피자 한 판을 나눠 드시는 구성이 어울립니다. 한 끼를 간단히 즐길 수 있어 추천합니다."
    followup_explanation = "세 분이 함께 먹는다면 서로 다른 맛을 골라 나누기 좋습니다."
    menu = {"name": "페퍼로니 피자", "quantity": 1}
    followup_menu = {"name": "반반 피자", "quantity": 2}
    outputs = [
      {"area": "중계동", "cuisine": "피자", "party_size": 2, "visit_at": "2026-12-25T19:00:00+09:00"},
      {"items": [
        {"restaurant_id": first.id, "evidence_keys": ["category"], "reason": reason, "explanation": explanation,
         "order": {"items": [menu], "estimated_total": 27700}},
        {"restaurant_id": second.id, "evidence_keys": ["category"], "order": {"items": [], "estimated_total": -1}},
      ]},
      {"party_size": 3},
      {"items": [{"restaurant_id": first.id, "evidence_keys": ["category"], "explanation": followup_explanation,
                  "order": {"items": [followup_menu], "estimated_total": 39600}}]},
    ]
    generate = Mock(side_effect=[SimpleNamespace(text=json.dumps(output, ensure_ascii=False)) for output in outputs])
    client.return_value = SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    response = self.client.post("/api/chat", json={"message": "중계동 둘이서 먹기 좋은 피자집, 오후 7시에 갈게"})
    self.assertEqual(response.status_code, 200, response.text)
    initial = response.json()
    message = initial["messages"][-1]
    item, other = message["recommendations"]
    self.assertEqual((item["id"], other["id"]), (first.id, second.id))
    self.assertEqual(item["reason"], reason)
    self.assertEqual((item["category"], other["category"]), ("피자", "양식"))
    self.assertNotIn(first.category, item["confirmed_matches"])
    self.assertEqual(item["menu_combination"]["items"], [menu])
    self.assertEqual(item["menu_combination"]["total"], 27700)
    self.assertEqual(item["menu_combination"]["per_person"], 13850)
    self.assertIsNone(other["menu_combination"])
    self.assertIn(explanation, message["content"])
    self.assertIn("AI 예상 금액은 총 27,700원(1인당 13,850원)", message["content"])
    self.assertNotIn(reason, message["content"])
    self.assertNotIn("영업시간", message["content"])
    self.assertNotIn("\n- ", message["content"])
    self.assertNotIn(first.address, message["content"])

    response = self.client.post("/api/chat", json={"conversation_id": initial["id"], "message": "그중에서 3명으로 바꿔줘"})
    self.assertEqual(response.status_code, 200, response.text)
    updated = response.json()
    self.assertEqual(updated["conditions"]["party_size"], 3)
    self.assertEqual(updated["conditions"]["cuisine"], "피자")
    self.assertIn(followup_explanation, updated["messages"][-1]["content"])
    history = self.client.get("/api/conversations/" + str(initial["id"])).json()["messages"][-1]
    self.assertEqual(history["content"], updated["messages"][-1]["content"])
    self.assertEqual(history["recommendations"][0]["menu_combination"]["items"], [followup_menu])
    self.assertEqual(history["recommendations"][0]["category"], "피자")
    self.assertEqual(generate.call_count, 4)
    for call in generate.call_args_list:
      self.assertIsNone(call.kwargs["config"].tools)
    rank_input = json.loads(generate.call_args_list[1].kwargs["contents"])
    self.assertEqual({row["id"]: row["address"] for row in rank_input["candidates"]}, {first.id: first.address, second.id: second.address})
    self.assertEqual({row["id"]: row["display_category"] for row in rank_input["candidates"]}, {first.id: "피자", second.id: "양식"})

  @patch("service.chat_service.get_client")
  def test_chat_retains_registered_schedule_and_route_in_recommendations(self, client):
    with self.factory() as db:
      restaurant = db.get(Restaurant, self.restaurant_id)
      restaurant.latitude, restaurant.longitude = 37.623, 127.071
      restaurant.tags = ["국수"]
      restaurant.hours = {**restaurant.hours, "exceptions": {"2026-12-25": {
        "open": "12:00", "close": "21:00", "break_start": "15:00", "break_end": "16:00", "last_order": "20:30",
      }}}
      db.add(Menu(restaurant_id=restaurant.id, name="온기국수", price=9000, servings=1, source="확인한 메뉴판", checked_at=utcnow()))
      db.commit()
    saved = {"label": "집", "address": "서울 노원구 공릉로 45", "latitude": 37.62, "longitude": 127.07}
    self.assertEqual(self.client.post("/api/me/addresses", json=saved).status_code, 201)
    ranked = {"items": [{"restaurant_id": self.restaurant_id, "evidence_keys": ["menu"],
                         "order": {"items": [{"name": "온기국수", "quantity": 2}], "estimated_total": 18000}}]}
    followup_ranked = {"items": [{**ranked["items"][0],
                                  "order": {"items": [{"name": "온기국수", "quantity": 3}], "estimated_total": 27000}}]}
    with (
      patch("service.chat_service.geocode_origin", side_effect=[(37.65, 127.061), None]) as geocode,
      patch("service.chat_service.travel_times", side_effect=[{self.restaurant_id: 325}, {self.restaurant_id: 780}, {}]) as travel,
    ):
      with self.ai(conditions={"area": "공릉동", "cuisine": "국수", "party_size": 2, "visit_at": "2026-12-25T14:00:00+09:00"}, ranked=ranked):
        response = self.client.post("/api/chat", json={"message": "공릉동 2명이 12월 25일 오후 2시에 국수"})
      self.assertEqual(response.status_code, 200, response.text)
      initial = response.json()
      message = initial["messages"][-1]
      item = message["recommendations"][0]
      self.assertEqual(travel.call_args.args[:2], (37.62, 127.07))
      self.assertEqual(item["travel_label"], "기본 주소 기준 자동차 5분 25초 · 카카오모빌리티 예상")
      self.assertEqual(item["opening"]["label"], "영업시간 내")
      self.assertEqual(item["menu_combination"]["total"], 18000)
      self.assertEqual(item["menu_combination"]["per_person"], 9000)
      self.assertEqual(item["visit_schedule"]["summary"], "12:00–21:00 · 브레이크타임 15:00–16:00 · 라스트오더 20:30")
      for text in [item["reason"], "18,000원", "9,000원"]:
        self.assertIn(text, message["content"])
      self.assertNotIn(item["travel_label"], message["content"])
      self.assertNotIn(item["visit_schedule"]["summary"], message["content"])
      self.assertNotIn(item["address"], message["content"])
      with self.ai(conditions={"party_size": 3, "visit_at": "2026-12-25T20:40:00+09:00"}, ranked=followup_ranked):
        response = self.client.post("/api/chat", json={"conversation_id": initial["id"], "message": "3명으로 바꾸고 오후 8시 40분에 방문할게", "origin_text": "노원역"})
      self.assertEqual(response.status_code, 200, response.text)
      updated = response.json()["messages"][-1]
      updated_item = updated["recommendations"][0]
      self.assertEqual(travel.call_args.args[:2], (37.65, 127.061))
      self.assertIn("27,000원", updated["content"])
      self.assertEqual(updated_item["opening"]["label"], "라스트오더 이후")
      self.assertIn("지정한 출발지 기준 자동차 13분", updated_item["travel_label"])
      self.assertNotEqual(updated["content"], message["content"])
      with self.ai(conditions={"area": "공릉동"}, ranked=ranked):
        missing = self.client.post("/api/chat", json={"message": "공릉동 맛집", "origin_text": "확인되지 않는 출발지"})
      self.assertEqual(missing.status_code, 200, missing.text)
      self.assertEqual(travel.call_args.args[:2], (None, None))
      self.assertEqual(missing.json()["messages"][-1]["recommendations"][0]["travel_label"], "이동 시간 확인 불가")
      self.assertEqual([call.args[0] for call in geocode.call_args_list], ["노원역", "확인되지 않는 출발지"])
    history = self.client.get("/api/conversations/" + str(initial["id"])).json()["messages"][-1]
    self.assertEqual(history["content"], updated["content"])
    self.assertEqual(history["recommendations"][0]["opening"]["label"], "라스트오더 이후")
    self.assertEqual(history["recommendations"][0]["travel_label"], "이동 시간 확인 불가")

  def test_reviewed_restaurants_updates_until_the_current_users_last_review_is_deleted(self):
    lookup = "/api/restaurants/reviewed?ids=" + str(self.restaurant_id) + "&ids=999"
    payload = self.post(kind="review", restaurant_id=self.restaurant_id, rating=4, visited_on="2026-11-01")
    self.login(self.other_token)
    self.assertEqual(self.client.post("/api/posts", json=payload).status_code, 201)
    self.login(self.token)
    self.assertEqual(self.client.get(lookup).json(), [])
    own_ids = []
    for _ in range(2):
      created = self.client.post("/api/posts", json=payload)
      self.assertEqual(created.status_code, 201, created.text)
      own_ids.append(created.json()["id"])
    self.assertEqual(self.client.get(lookup).json(), [self.restaurant_id])
    self.assertEqual(self.client.delete("/api/posts/" + str(own_ids[0])).status_code, 204)
    self.assertEqual(self.client.get(lookup).json(), [self.restaurant_id])
    self.assertEqual(self.client.delete("/api/posts/" + str(own_ids[1])).status_code, 204)
    self.assertEqual(self.client.get(lookup).json(), [])
    self.login(self.other_token)
    self.assertEqual(self.client.get(lookup).json(), [self.restaurant_id])

  @patch("service.chat_service.sleep")
  def test_gemini_retries_temporary_unavailability_once(self, pause):
    unavailable = ServerError(503, {"error": {"status": "UNAVAILABLE", "message": "검증용 일시 과부하"}})
    generate = Mock(side_effect=[unavailable, SimpleNamespace(text='{"area":"공릉동"}')])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    result = chat_service.generate_structured(client, "검증용 프롬프트", {}, SearchConditions)
    self.assertEqual(result.area, "공릉동")
    self.assertEqual(generate.call_count, 2)
    first_call, retry_call = generate.call_args_list
    self.assertEqual(first_call, retry_call)
    pause.assert_called_once_with(1)
    generate.reset_mock(side_effect=True)
    generate.side_effect = unavailable
    with self.assertRaises(HTTPException) as failure:
      chat_service.generate_structured(client, "검증용 프롬프트", {}, SearchConditions)
    self.assertEqual(failure.exception.status_code, 502)
    self.assertEqual(generate.call_count, 2)

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
    with self.ai(conditions={"clear_fields": ["radius_metres"]}, ranked={"items": [{"restaurant_id": self.restaurant_id, "evidence_keys": ["area"]}]}):
      response = self.client.post("/api/chat", json={"conversation_id": conversation["id"], "message": "반경 500m 제한 풀어줘"})
    self.assertEqual(response.status_code, 200, response.text)
    self.assertIsNone(response.json()["conditions"]["radius_metres"])
    self.assertNotIn("search_origin", response.json()["conditions"])

  @patch("service.chat_service.get_client")
  def test_new_area_search_drops_the_previous_radius_and_budget(self, client):
    with self.factory() as db:
      near = db.get(Restaurant, self.restaurant_id)
      near.latitude, near.longitude = 37.655, 127.061
      near.address, near.area = "서울 노원구 상계동", "상계동"
      far = Restaurant(name="검증용 공릉양식", address="서울 노원구 공릉동", area="공릉동", category="양식", source="검증", latitude=37.622, longitude=127.075)
      db.add(far); db.commit()
      far_id = far.id
    with self.ai(conditions={"cuisine": "한식", "party_size": 2, "budget_total": 40000}, ranked={"items": [{"restaurant_id": self.restaurant_id, "evidence_keys": ["distance"]}]}):
      initial = self.client.post("/api/chat", json={"message": "내 위치에서 2km 이내 2명 4만원 한식집", "origin_text": "현재 위치", "latitude": 37.655, "longitude": 127.061})
    self.assertEqual(initial.status_code, 200, initial.text)
    conversation = initial.json()
    self.assertEqual(conversation["conditions"]["radius_metres"], 2000)
    self.assertEqual(conversation["messages"][-1]["recommendations"][0]["id"], self.restaurant_id)
    with self.ai(conditions={"new_search": True, "area": "공릉동", "cuisine": "양식집"}, ranked={"items": [{"restaurant_id": far_id, "evidence_keys": ["area"]}]}):
      response = self.client.post("/api/chat", json={"conversation_id": conversation["id"], "message": "공릉동에서 양식집 찾아줘"})
    self.assertEqual(response.status_code, 200, response.text)
    updated = response.json()
    self.assertEqual(updated["id"], conversation["id"])
    self.assertEqual(updated["conditions"]["area"], "공릉동")
    self.assertEqual(updated["conditions"]["cuisine"], "양식")
    for field in ["radius_metres", "budget_total", "party_size"]:
      self.assertIsNone(updated["conditions"][field])
    for field in ["search_origin", "new_search", "clear_fields"]:
      self.assertNotIn(field, updated["conditions"])
    self.assertEqual(updated["messages"][:2], conversation["messages"])
    self.assertEqual(updated["messages"][-1]["recommendations"][0]["id"], far_id)
    self.assertIsNone(updated["messages"][-1]["recommendations"][0]["distance_metres"])

  def test_oauth_signup_repeat_nickname_state_and_logout(self):
    with self.factory() as db:
      db.execute(delete(User))
      db.commit()
    configured = replace(settings, kakao_rest_api_key="test-key")
    with patch("service.auth_service.settings", configured), patch("service.auth_service.kakao_identity", return_value=("999", "walk@example.com")):
      url = self.client.get("/api/auth/kakao/authorize").json()["authorization_url"]
      state = httpx.URL(url).params["state"]
      response = self.client.get("/api/auth/kakao/callback", params={"code": "test-code", "state": state}, follow_redirects=False)
      self.assertEqual(response.status_code, 303)
      self.assertTrue(response.headers["location"].endswith("/onboarding/address"))
      user = self.client.get("/api/auth/me").json()
      self.assertEqual(user["role"], "ADMIN")
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
      returning_user = self.client.get("/api/auth/me").json()
      self.assertEqual(returning_user["nickname"], nickname)
      self.assertEqual(returning_user["role"], "ADMIN")
      replay = self.client.get("/api/auth/kakao/callback", params={"code": "test-code", "state": state}, follow_redirects=False)
      self.assertIn("login_error", replay.headers["location"])
    with self.factory() as db:
      self.assertEqual(db.scalar(select(func.count()).select_from(User).where(User.kakao_id == "999")), 1)
      self.assertIsNone(db.get(AuthSession, self.client.cookies.get("nowon_session")))

  def test_concurrent_signups_assign_exactly_one_admin(self):
    with self.factory() as db:
      db.execute(delete(User))
      db.commit()
    barrier = Barrier(4)

    def signup(identity):
      with self.factory() as db:
        get = db.get

        def observe_assignment(model, *args, **kwargs):
          assignment = get(model, *args, **kwargs)
          barrier.wait(timeout=10)
          db.get = get
          return assignment

        db.get = observe_assignment
        user = auth_service.find_or_create_user(db, identity)
        return user.id, user.role

    with ThreadPoolExecutor(max_workers=4) as workers:
      accounts = list(workers.map(signup, ["300", "400", "500", "600"]))
    self.assertCountEqual([role for _, role in accounts], ["ADMIN", "USER", "USER", "USER"])
    with self.factory() as db:
      self.assertEqual(db.get(AdminAssignment, 1).user_id, next(identity for identity, role in accounts if role == "ADMIN"))
      self.assertEqual(auth_service.find_or_create_user(db, "700").role, "USER")

  def test_migration_uses_earliest_signup_once(self):
    with self.factory() as db:
      db.get(User, self.other_id).created_at = utcnow() - timedelta(days=30)
      db.commit()
    with self.engine.begin() as connection:
      migrate(connection)
    with self.factory() as db:
      self.assertEqual(db.get(AdminAssignment, 1).user_id, self.other_id)
      self.assertEqual(db.get(User, self.other_id).role, "ADMIN")
      user = db.get(User, self.user_id)
      self.assertEqual(user.role, "USER")
      user.created_at = utcnow() - timedelta(days=60)
      db.commit()
    with self.engine.begin() as connection:
      migrate(connection)
    with self.factory() as db:
      self.assertEqual(db.get(AdminAssignment, 1).user_id, self.other_id)
      self.assertEqual(db.get(User, self.user_id).role, "USER")

  def test_admin_routes_require_role_and_role_is_read_only(self):
    routes = [
      ("GET", "dashboard", None), ("GET", "prompts/conditions", None), ("GET", "prompts/ranking/versions/1", None),
      ("PUT", "prompts/conditions", {"content": "test", "expected_version": 1}),
      ("POST", "prompts/ranking/restore", {"version": 1, "expected_version": 1}),
      ("GET", "users", None), ("PUT", f"users/{self.user_id}", self.profile()), ("DELETE", f"users/{self.user_id}", None),
      ("GET", "restaurants", None), ("GET", f"restaurants/{self.restaurant_id}/deletion-impact", None),
      ("PUT", f"restaurants/{self.restaurant_id}", {"name": "식탁", "address": "서울 노원구", "area": "공릉동", "category": "한식"}),
      ("DELETE", f"restaurants/{self.restaurant_id}", {"review_count": 0, "visit_count": 0, "menu_count": 2}),
    ]
    self.login_admin()
    self.assertEqual(self.client.put("/api/me", json=self.profile(role="USER")).status_code, 422)
    self.assertEqual(self.client.put(f"/api/admin/users/{self.other_id}", json=self.profile(role="ADMIN")).status_code, 422)
    self.assertEqual(self.client.delete(f"/api/admin/users/{self.user_id}").status_code, 409)
    for token, status in ((None, 401), (self.other_token, 403)):
      self.client.cookies.clear()
      if token:
        self.login(token)
      for method, path, data in routes:
        with self.subTest(method=method, path=path, status=status):
          self.assertEqual(self.client.request(method, "/api/admin/" + path, json=data).status_code, status)

  @patch("service.chat_service.get_client", return_value=object())
  def test_admin_prompt_validation_applies_to_chat_and_restores(self, _client):
    self.login_admin()
    prefix = "/api/admin/prompts/"
    defaults = {name: self.client.get(prefix + name).json()["content"] for name in ("conditions", "ranking")}
    for name, content in defaults.items():
      with self.subTest(name=name):
        self.assertEqual(self.client.put(prefix + name, json={"content": "JSON 객체로 답하세요.", "expected_version": 1}).status_code, 422)
        response = self.client.put(prefix + name, json={"content": content.replace("JSON", "텍스트"), "expected_version": 1})
        self.assertEqual(response.status_code, 422, response.text)
        updated = content + "\n추가 조건은 한 문장으로 검토하세요."
        response = self.client.put(prefix + name, json={"content": updated, "expected_version": 1})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([row["version"] for row in response.json()["history"]], [2, 1])
        self.assertEqual(self.client.put(prefix + name, json={"content": updated, "expected_version": 1}).status_code, 409)
        self.assertEqual(self.client.get(prefix + name + "/versions/1").json()["content"], content)
    self.login(self.other_token)
    with self.ai() as generate:
      response = self.client.post("/api/chat", json={"message": "공릉동에서 찌개를 먹고 싶어요."})
      self.assertEqual(response.status_code, 200, response.text)
      self.assertEqual([call.args[1] for call in generate.call_args_list], [content + "\n추가 조건은 한 문장으로 검토하세요." for content in defaults.values()])
    self.login_admin()
    for name in defaults:
      response = self.client.post(prefix + name + "/restore", json={"version": 1, "expected_version": 2})
      self.assertEqual(response.status_code, 200, response.text)
      self.assertEqual(response.json()["version"], 3)
      self.assertEqual(response.json()["history"][0]["restored_from"], 1)
    with self.ai() as generate:
      self.assertEqual(self.client.post("/api/chat", json={"message": "공릉동에서 찌개를 먹고 싶어요."}).status_code, 200)
      self.assertEqual([call.args[1] for call in generate.call_args_list], list(defaults.values()))
    stats = self.client.get("/api/admin/dashboard").json()
    self.assertEqual(stats["totals"]["search_requests"], 2)
    self.assertEqual([row["action"] for row in stats["actions"]], ["prompt_restore", "prompt_restore", "prompt_update", "prompt_update"])

  def test_admin_restaurant_and_community_management_retains_linked_records(self):
    self.login(self.other_token)
    photo = self.image()
    date_string = date.today().isoformat()
    visit = self.client.post("/api/me/visits", json={"restaurant_id": self.restaurant_id, "visited_on": date_string}).json()
    review_data = self.post(kind="review", restaurant_id=self.restaurant_id, rating=4, visited_on=date_string, visit_id=visit["id"])
    review = self.client.post("/api/posts", json=review_data).json()
    experience = self.client.post("/api/posts", json=self.post(photo_ids=[photo])).json()
    self.login_admin()
    with self.factory() as db:
      db.get(User, self.other_id).created_at = utcnow() - timedelta(days=12)
      db.get(Restaurant, self.restaurant_id).external_id = "kakao:1"
      db.commit()
    for days, new_users in ((7, 1), (30, 2)):
      stats = self.client.get(f"/api/admin/dashboard?days={days}").json()
      self.assertEqual(len(stats["trend"]), days)
      self.assertEqual(stats["totals"], {"users": 2, "new_users": new_users, "experiences": 1, "reviews": 1, "restaurants": 1, "search_requests": 0})
      self.assertEqual(sum(row["reviews"] for row in stats["trend"]), 1)
    path = f"/api/admin/restaurants/{self.restaurant_id}"
    self.assertEqual(self.client.get("/api/admin/restaurants", params={"query": "공릉", "size": 1}).json()["total"], 1)
    restaurant = {"name": "관리자 수정 식탁", "address": "서울 노원구 공릉동 1", "area": "공릉동", "category": "한식", "phone": "02-123-4567"}
    self.assertEqual(self.client.put(path, json=restaurant).json()["name"], restaurant["name"])
    place = {"id": "1", "place_name": "카카오 식탁", "category_group_code": "FD6", "road_address_name": "서울 노원구 공릉동 1", "y": "37.62", "x": "127.07"}
    with self.factory() as db, patch("service.restaurant_service.query_kakao", return_value=[place]):
      self.assertEqual(restaurant_service.sync_kakao(db, "공릉동 식당", None, None), {self.restaurant_id})
      db.commit()
      self.assertEqual(db.get(Restaurant, self.restaurant_id).name, restaurant["name"])
    scope = self.client.get(path + "/deletion-impact").json()
    self.assertEqual(scope, {"review_count": 1, "visit_count": 1, "menu_count": 2})
    self.assertEqual(self.client.request("DELETE", path, json={**scope, "review_count": 0}).status_code, 409)
    self.assertEqual(self.client.request("DELETE", path, json=scope).status_code, 204)
    self.assertEqual(self.client.get("/api/admin/restaurants").json()["total"], 0)
    self.assertEqual(self.client.get(f"/api/restaurants/{self.restaurant_id}").status_code, 404)
    self.assertEqual(self.client.get("/api/restaurants").json(), [])
    self.assertEqual(self.client.get(f"/api/posts/{review['id']}").json()["restaurant_name"], restaurant["name"])
    with self.factory() as db, patch("service.restaurant_service.query_kakao", return_value=[place]):
      self.assertEqual(restaurant_service.sync_kakao(db, "공릉동 식당", None, None), set())
      self.assertEqual(db.scalar(select(func.count(Menu.id)).where(Menu.restaurant_id == self.restaurant_id)), 2)
    self.login(self.other_token)
    self.assertEqual(self.client.get("/api/me/visits").json()["total"], 1)
    self.assertEqual(self.client.post("/api/posts", json=review_data).status_code, 404)
    self.assertEqual(self.client.post("/api/me/visits", json={"restaurant_id": self.restaurant_id, "visited_on": date_string}).status_code, 404)
    self.login_admin()
    for post in (review, experience):
      self.assertEqual(self.client.delete(f"/api/posts/{post['id']}").status_code, 204)
    self.assertEqual(self.client.get("/api/uploads/" + photo).status_code, 404)
    stats = self.client.get("/api/admin/dashboard").json()
    self.assertEqual([stats["totals"][key] for key in ("experiences", "reviews", "restaurants")], [0, 0, 0])
    self.assertEqual([row["action"] for row in stats["actions"]], ["post_delete", "post_delete", "restaurant_delete"])

  def test_admin_user_search_updates_and_deletes_account(self):
    self.login_admin()
    path = "/api/admin/users"
    page = self.client.get(path, params={"page": 2, "size": 1}).json()
    self.assertEqual((page["pages"], page["items"][0]["id"]), (2, self.user_id))
    self.assertEqual(self.client.get(path, params={"query": "%"}).json()["total"], 0)
    self.assertEqual(self.client.get(path, params={"query": "상계"}).json()["items"][0]["id"], self.other_id)
    self.assertEqual(self.client.put(f"{path}/{self.other_id}", json=self.profile()).json()["nickname"], self.profile()["nickname"])
    self.login(self.other_token)
    photo = self.image()
    self.assertEqual(self.client.post("/api/posts", json=self.post(photo_ids=[photo])).status_code, 201)
    self.login_admin()
    self.assertEqual(self.client.delete(f"{path}/{self.other_id}").status_code, 204)
    self.assertEqual(self.client.get(path).json()["total"], 1)
    stats = self.client.get("/api/admin/dashboard").json()
    self.assertEqual(stats["totals"]["experiences"], 0)
    self.assertEqual(stats["actions"][0]["action"], "user_delete")
    self.assertEqual(list(Path(self.media_directory.name).iterdir()), [])
    self.login(self.other_token)
    self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

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
    rows = [{"id": "123", "place_name": "테스트 노원", "address_name": "서울 노원구 상계동", "category_group_code": "FD6", "category_name": "음식점 > 한식", "phone": " 02-123-4567 ", "x": "127.05", "y": "37.65"}, {"id": "999", "place_name": "타지역", "address_name": "서울 강남구", "category_group_code": "FD6", "x": "127", "y": "37"}, {"id": "bad", "place_name": "형식 오류", "address_name": "서울 노원구", "category_group_code": "FD6", "x": "bad", "y": "bad"}]
    with self.factory() as db, patch("service.restaurant_service.query_kakao", return_value=rows):
      restaurant_service.sync_kakao(db, "노원구 식당", None, None); db.commit()
      item = db.scalar(select(Restaurant).where(Restaurant.external_id == "kakao:123"))
      self.assertIsNotNone(item)
      self.assertIsNone(item.hours)
      self.assertEqual(item.phone, "02-123-4567")
      item.hours = {"exceptions": {"2026-12-25": {"closed": True}}}
      item.hours_source, item.hours_checked_at = "매장 공식 안내", utcnow()
      db.commit()
      restaurant_service.sync_kakao(db, "노원구 식당", None, None); db.commit()
      details = restaurant_service.serialize_restaurant(db, item)
      self.assertEqual(details["phone"], "02-123-4567")
      self.assertEqual(details["hours"]["exceptions"]["2026-12-25"], {"closed": True})
      self.assertIsNone(db.scalar(select(Restaurant).where(Restaurant.external_id == "kakao:999")))


if __name__ == "__main__":
  unittest.main()
