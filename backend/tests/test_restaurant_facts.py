import os
import unittest
from datetime import datetime
from dataclasses import replace
from unittest.mock import patch
from zoneinfo import ZoneInfo

os.environ["APP_ENV"] = "test"

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from config.database import Base
from entity.models import Restaurant, User, utcnow
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
      with patch.object(service, "settings", configured), patch.object(service, "query_kakao", return_value=data):
        candidates, _ = service.find_candidates(db, user, {"area": "노원역", "cuisine": "한식"}, None, None, None)
      self.assertEqual(len(candidates), 1)
      self.assertEqual(candidates[0]["name"], "검증용 가상식당")
      self.assertIsNone(candidates[0]["menu_combination"])
    engine.dispose()


if __name__ == "__main__":
  unittest.main()
