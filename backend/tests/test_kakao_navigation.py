import unittest
from dataclasses import replace
from unittest.mock import patch

import httpx

from config.settings import settings
from service import kakao_navigation


class KakaoNavigationTest(unittest.TestCase):
  def test_kakao_directions_uses_lon_lat_and_only_successful_route_duration(self):
    def handler(request):
      self.assertEqual(request.url.path, "/v1/directions")
      self.assertEqual(request.url.params["origin"], "127.061,37.65")
      self.assertEqual(request.url.params["destination"], "127.071,37.623")
      self.assertEqual(request.url.params["summary"], "true")
      return httpx.Response(200, json={"routes": [
        {"result_code": 104, "summary": {"duration": 7}}, {"result_code": 0, "summary": {"duration": 325}},
      ]})

    restaurant = {"latitude": 37.623, "longitude": 127.071}
    with httpx.Client(base_url="https://apis-navi.kakaomobility.com", transport=httpx.MockTransport(handler)) as client:
      self.assertEqual(kakao_navigation.route_seconds(client, (37.65, 127.061), restaurant), 325)
    with httpx.Client(base_url="https://apis-navi.kakaomobility.com", transport=httpx.MockTransport(lambda _: httpx.Response(403))) as client:
      self.assertIsNone(kakao_navigation.route_seconds(client, (37.65, 127.061), restaurant))

  def test_typed_departure_requires_an_unambiguous_exact_match(self):
    place = {"place_name": "노원역 4호선", "x": "127.061", "y": "37.65"}
    matches = [place, {"place_name": "노원역 7호선", "x": "127.064", "y": "37.651"},
               {"place_name": "상계역 4호선", "x": "127.071", "y": "37.67"}]

    def handler(request):
      if request.url.path == "/v2/local/search/address.json":
        self.assertEqual(request.url.params["query"], "서울 노원구 노해로 437")
        return httpx.Response(200, json={"documents": [place]})
      self.assertEqual(request.url.path, "/v2/local/search/keyword.json")
      self.assertEqual(request.url.params["category_group_code"], "SW8")
      return httpx.Response(200, json={"documents": matches})

    create_client = httpx.Client
    with (
      patch.object(kakao_navigation, "settings", replace(settings, kakao_local_key="test")),
      patch.object(kakao_navigation.httpx, "Client", side_effect=lambda **options: create_client(transport=httpx.MockTransport(handler), **options)),
    ):
      self.assertEqual(kakao_navigation.geocode_origin("서울 노원구 노해로 437"), (37.65, 127.061))
      self.assertEqual(kakao_navigation.geocode_origin("노원역"), (37.65, 127.061))
      self.assertEqual(kakao_navigation.geocode_origin("노원역 7호선"), (37.651, 127.064))
      matches.append({**place, "x": "128.065"})
      self.assertIsNone(kakao_navigation.geocode_origin("노원역"))
