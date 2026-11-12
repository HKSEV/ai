import os
import unittest
from datetime import datetime, timezone
from dataclasses import replace
from unittest.mock import patch
from zoneinfo import ZoneInfo

os.environ["APP_ENV"] = "test"

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from config.database import Base
from entity.models import Restaurant, User, utcnow
from scripts.import_restaurants import RestaurantHoursInput
from service import restaurant_service as service


class RestaurantFactsTest(unittest.TestCase):
  def restaurant(self, hours):
    return Restaurant(
      hours=hours, hours_source="테스트용 시간표", hours_checked_at=utcnow(),
      closed_dates=[],
    )

  def test_missing_weekday_remains_unknown(self):
    restaurant = self.restaurant({"mon": {"open": "11:00", "close": "20:00"}})
    result = service.opening_status(restaurant, datetime(2026, 11, 10, 12, tzinfo=ZoneInfo("Asia/Seoul")))
    self.assertEqual(result["label"], "확인 필요")
    self.assertFalse(result["is_realtime"])

  def test_explicit_weekday_closure(self):
    restaurant = self.restaurant({"tue": {"closed": True}})
    result = service.opening_status(restaurant, datetime(2026, 11, 10, 12, tzinfo=ZoneInfo("Asia/Seoul")))
    self.assertEqual(result["label"], "휴무일")

  def test_overnight_hours_cover_following_day(self):
    restaurant = self.restaurant({"mon": {"open": "18:00", "close": "02:00"}})
    result = service.opening_status(restaurant, datetime(2026, 11, 10, 1, tzinfo=ZoneInfo("Asia/Seoul")))
    self.assertEqual(result["label"], "영업시간 내")

  def test_dated_hours_override_regular_closure_and_previous_overnight_hours(self):
    restaurant = self.restaurant({
      "mon": {"open": "18:00", "close": "03:00"},
      "tue": {"closed": True},
      "exceptions": {"2026-11-10": {"open": "11:00", "close": "15:00"}},
    })
    for hour, label in [(1, "영업시간 외"), (12, "영업시간 내")]:
      result = service.opening_status(restaurant, datetime(2026, 11, 10, hour, tzinfo=ZoneInfo("Asia/Seoul")))
      self.assertEqual(result["label"], label)
      self.assertIn("날짜별", result["basis"])
    restaurant.hours = None
    restaurant.closed_dates = ["2026-11-10"]
    self.assertEqual(service.opening_status(restaurant, datetime(2026, 11, 10, 12, tzinfo=ZoneInfo("Asia/Seoul")))["label"], "휴무일")

  def test_hours_import_requires_a_source_and_a_valid_exception_date(self):
    data = {"external_id": "kakao:123", "hours": {"exceptions": {"2026-12-25": {"closed": True}}}}
    with self.assertRaises(ValidationError):
      RestaurantHoursInput.model_validate(data)
    data.update(hours_source="검증용 공식 일정", hours_checked_at=datetime.now(timezone.utc))
    self.assertEqual(RestaurantHoursInput.model_validate(data).hours, data["hours"])
    data["hours"]["exceptions"]["2026-02-30"] = {"closed": True}
    with self.assertRaises(ValidationError):
      RestaurantHoursInput.model_validate(data)

  def test_station_search_retains_provider_matches_without_station_in_address(self):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
      user = User(id=1, preferences=[])
      data = [{
        "id": "qa-nowon-station", "place_name": "검증용 가상식당", "category_group_code": "FD6",
        "category_name": "음식점 > 한식", "road_address_name": "서울 노원구 상계로 1",
        "address_name": "서울 노원구 상계동 1", "x": "127.061", "y": "37.655",
      }]
      configured = replace(service.settings, kakao_local_key="test-only", kakao_storage_allowed=True)
      with patch.object(service, "settings", configured), patch.object(service, "query_kakao", return_value=data) as lookup:
        candidates, _ = service.find_candidates(db, user, {"area": "노원역", "cuisine": "한식"}, "현재 위치", 37.60, 127.061)
      lookup.assert_called_once_with("노원구 노원역 한식", None, None, None)
      self.assertEqual(len(candidates), 1)
      self.assertEqual(candidates[0]["name"], "검증용 가상식당")
      self.assertIsNone(candidates[0]["menu_combination"])
      self.assertGreater(candidates[0]["distance_metres"], 5000)
    engine.dispose()

  def test_provider_cuisine_match_survives_a_different_category_label(self):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
      user = User(id=1, preferences=[])
      db.add(Restaurant(name="분식집", address="서울 노원구 노해로 1", area="노원역", category="분식", source="검증"))
      data = [{
        "id": "qa-burger", "place_name": "검증용 버거킹 노원역점", "category_group_code": "FD6",
        "category_name": "음식점 > 패스트푸드 > 버거킹", "road_address_name": "서울 노원구 노해로 456",
        "address_name": "서울 노원구 상계동 734-5", "x": "127.061", "y": "37.655",
      }]
      configured = replace(service.settings, kakao_local_key="test-only", kakao_storage_allowed=True)
      conditions = {"area": "노원역", "cuisine": "햄버거"}
      with patch.object(service, "settings", configured), patch.object(service, "query_kakao", return_value=data) as lookup:
        candidates, _ = service.find_candidates(db, user, conditions, None, None, None)
      lookup.assert_called_once_with("노원구 노원역 햄버거", None, None, None)
      self.assertEqual([item["name"] for item in candidates], ["검증용 버거킹 노원역점"])
      with patch.object(service, "settings", replace(configured, kakao_local_key="")):
        candidates, _ = service.find_candidates(db, user, conditions, None, None, None)
      self.assertEqual(candidates, [])
    engine.dispose()


if __name__ == "__main__":
  unittest.main()
