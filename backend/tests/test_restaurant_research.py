import json
import unittest
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import Mock, patch

import httpx
from google.genai import types

from config.settings import settings
from service import kakao_navigation
from service.restaurant_research import merge_research, research_restaurants
from service.restaurant_service import order_estimate


class RestaurantResearchTest(unittest.TestCase):
  def test_research_requires_matching_branch_and_individual_web_grounding(self):
    first = {"id": 1, "name": "온기식탁", "address": "서울 노원구 공릉로 101", "is_demo": False}
    second = {"id": 2, "name": "온기식탁", "address": "서울 노원구 공릉로 202", "is_demo": False}
    first_identity = "온기식탁 서울 노원구 공릉로 101"
    second_identity = "온기식탁 서울 노원구 공릉로 202"

    def branch(identity, quote, facts):
      return {"restaurant_id": identity, "identity_quote": quote, "facts": [
        {"kind": kind, "key": key, "value": value, "quote": fact_quote}
        for kind, key, value, fact_quote in facts
      ]}

    branches = [
      branch(1, first_identity, [
        ("menu", "온기국수", "9000", "온기국수 9,000원"),
        ("menu", "없는 메뉴", "1000", "없는 메뉴 1,000원"),
        ("menu", "다른 지점 떡볶이", "8000", "다른 지점 떡볶이 8,000원"),
        ("menu", "콩국수", "9500", "콩국수 9,000원"),
        ("hours", "fri", "11:00-21:00", "금요일 11:00–21:00"),
        ("hours", "2026-12-25", "12:00-18:00", "2026년 12월 25일 12:00–18:00"),
        ("break", "2026-12-25", "14:00-15:00", "2026년 12월 25일 브레이크타임 14:00–15:00"),
        ("last_order", "2026-12-25", "17:30", "2026년 12월 25일 라스트오더 17:30"),
      ]),
      branch(1, first_identity, [("menu", "온기국수", "10000", "온기국수 10,000원")]),
      branch(1, second_identity, [("menu", "2호점 볶음밥", "10000", "2호점 볶음밥 10,000원")]),
      branch(2, second_identity, [("menu", "2호점 볶음밥", "10000", "2호점 볶음밥 10,000원")]),
    ]
    text = json.dumps({"branches": branches}, ensure_ascii=False)
    raw = text.encode("utf-8")
    citations = [
      (first_identity, [0, 1]), (second_identity, [2]), ("온기국수 9,000원", [0]), ("온기국수 10,000원", [1]),
      ("다른 지점 떡볶이 8,000원", [2]), ("콩국수 9,000원", [0]), ("금요일 11:00–21:00", [0]),
      ("2026년 12월 25일 12:00–18:00", [0]), ("2026년 12월 25일 브레이크타임 14:00–15:00", [0]),
      ("2026년 12월 25일 라스트오더 17:30", [0]), ("2호점 볶음밥 10,000원", [2]),
    ]
    supports = []
    for quote, indices in citations:
      needle = quote.encode("utf-8")
      start = raw.index(needle)
      supports.append(types.GroundingSupport(
        grounding_chunk_indices=indices,
        segment=types.Segment(part_index=0, start_index=start, end_index=start + len(needle)),
      ))
    urls = ["https://example.com/first", "https://example.com/first-other-source", "https://example.com/second"]
    metadata = types.GroundingMetadata(
      web_search_queries=["온기식탁 공릉로 영업시간 메뉴"],
      grounding_supports=supports,
      grounding_chunks=[types.GroundingChunk(web=types.GroundingChunkWeb(title="확인 자료", uri=url)) for url in urls],
      search_entry_point=types.SearchEntryPoint(rendered_content='<a href="https://www.google.com/search?q=menu">메뉴 더 찾아보기</a>'),
    )
    response = types.GenerateContentResponse(candidates=[types.Candidate(
      content=types.Content(parts=[types.Part(text=text)]), grounding_metadata=metadata,
    )])
    generate = Mock(return_value=response)
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    facts, suggestions = research_restaurants(client, [first, second], "2026-12-25")
    config = generate.call_args.kwargs["config"]
    self.assertIsNotNone(config.tools[0].google_search)
    self.assertEqual(json.loads(generate.call_args.kwargs["contents"])["visit_date"], "2026-12-25")
    self.assertEqual(suggestions, [{"label": "메뉴 더 찾아보기", "url": "https://www.google.com/search?q=menu"}])
    self.assertNotIn(("menu", "없는 메뉴"), facts[1])
    self.assertNotIn(("menu", "다른 지점 떡볶이"), facts[1])
    self.assertNotIn(("menu", "2호점 볶음밥"), facts[1])
    self.assertEqual(set(facts[2]), {("menu", "2호점 볶음밥")})
    for candidate in [first, second]:
      candidate.update(menus=[], hours=None, closed_dates=[])
      merge_research(candidate, facts[candidate["id"]])
    menus = {item["name"]: item for item in first["menus"]}
    self.assertIsNone(menus["온기국수"]["price"])
    self.assertTrue(menus["온기국수"]["price_conflict"])
    self.assertEqual({item["url"] for item in menus["온기국수"]["sources"]}, set(urls[:2]))
    self.assertIsNone(menus["콩국수"]["price"])
    self.assertIsNone(order_estimate(first["menus"], 2, "국수"))
    order = order_estimate(second["menus"], 2, None)
    self.assertEqual((order["total"], order["per_person"], order["items"][0]["quantity"]), (20000, 10000, 2))
    exception = first["hours"]["exceptions"]["2026-12-25"]
    self.assertEqual((exception["open"], exception["break_start"], exception["last_order"]), ("12:00", "14:00", "17:30"))
    self.assertTrue(exception["sources"]["hours"][0]["checked_at"])
    response.candidates[0].grounding_metadata = None
    self.assertEqual(research_restaurants(client, [first, second], "2026-12-25"), ({}, []))

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
