import json
import unittest
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import Mock, patch

import httpx
from google.genai.interactions import Interaction

from config.settings import settings
from service import kakao_navigation
from service.restaurant_research import grounded_facts, merge_research, research_restaurants
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
        ("hours", "2026-12-25", "12:00-18:00", "2026년 12월 25일 오후 12시–오후 6시"),
        ("break", "2026-12-25", "14:00-15:00", "2026년 12월 25일 브레이크타임 14:00–15:00"),
        ("last_order", "2026-12-25", "17:30", "2026년 12월 25일 라스트오더 17:30"),
      ]),
      branch(1, first_identity, [("menu", "온기국수", "10000", "온기국수 10,000원")]),
      branch(1, second_identity, [("menu", "2호점 볶음밥", "10000", "2호점 볶음밥 10,000원")]),
      branch(2, second_identity, [("menu", "2호점 볶음밥", "10000", "2호점 볶음밥 10,000원")]),
    ]
    citations = [
      (first_identity, [0, 1]), (second_identity, [2]), ("온기국수 9,000원", [0]), ("온기국수 10,000원", [1]),
      ("다른 지점 떡볶이 8,000원", [2]), ("콩국수 9,000원", [0]), ("금요일 11:00–21:00", [0]),
      ("2026년 12월 25일 오후 12시–오후 6시", [0]), ("2026년 12월 25일 브레이크타임 14:00–15:00", [0]),
      ("2026년 12월 25일 라스트오더 17:30", [0]), ("2호점 볶음밥 10,000원", [2]),
    ]
    evidence = "\n".join(quote for quote, _ in citations)
    text = evidence + "\n```json\n" + json.dumps({"branches": branches}, ensure_ascii=False) + "\n```"
    raw = text.encode("utf-8")
    annotations = []
    urls = ["https://example.com/first", "https://example.com/first-other-source", "https://example.com/second"]
    for quote, indices in citations:
      needle = quote.encode("utf-8")
      start = raw.index(needle)
      annotations.extend({"type": "url_citation", "title": "확인 자료", "url": urls[index],
                          "start_index": start, "end_index": start + len(needle)} for index in indices)
    response = Interaction.model_validate({"status": "completed", "steps": [
      {"type": "google_search_call", "id": "search-1", "arguments": {"queries": ["온기식탁 공릉로 영업시간 메뉴"]}},
      {"type": "google_search_result", "call_id": "search-1", "result": [
        {"search_suggestions": '<a href="https://www.google.com/search?q=menu">메뉴 더 찾아보기</a>'},
      ]},
      {"type": "model_output", "content": [{"type": "text", "text": text, "annotations": annotations}]},
    ]})
    create = Mock(return_value=response)
    client = SimpleNamespace(interactions=SimpleNamespace(create=create))
    facts, suggestions = research_restaurants(client, [first, second], "2026-12-25")
    request = create.call_args.kwargs
    self.assertEqual(request["tools"], [{"type": "google_search"}])
    self.assertNotIn("response_format", request)
    self.assertFalse(request["store"])
    self.assertEqual(request["api_version"], "v1beta")
    self.assertEqual(request["input"][-1]["type"], "user_input")
    self.assertEqual(json.loads(request["input"][-1]["content"][-1]["text"])["visit_date"], "2026-12-25")
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
    response.steps = response.steps[-1:]
    self.assertEqual(research_restaurants(client, [first, second], "2026-12-25"), ({}, []))

  def test_character_offsets_preserve_cited_korean_sentences(self):
    restaurant = {"id": 1, "name": "온기식탁", "address": "서울 노원구 공릉로 101"}
    identity = "온기식탁 (서울 노원구 공릉로 101)"
    hours = "월요일~일요일 영업시간은 오전 9시~24시"
    source = "https://example.com/first"
    sentence = identity + "의 " + hours + "입니다."
    unknown = identity + "의 매일 브레이크타임은 15:00~16:00입니다."
    data = {"branches": [{"restaurant_id": 1, "identity_quote": identity, "facts": [
      {"kind": "hours", "key": "daily", "value": "09:00-24:00", "quote": hours},
      {"kind": "break", "key": "daily", "value": "15:00-16:00", "quote": unknown},
    ]}]}
    text = sentence + "\n\n" + unknown + "\n\n```json\n" + json.dumps(data, ensure_ascii=False) + "\n```"
    response = Interaction.model_validate({"status": "completed", "steps": [
      {"type": "google_search_call", "id": "search-1", "arguments": {"queries": ["온기식탁 영업시간"]}},
      {"type": "google_search_result", "call_id": "search-1", "result": [{}]},
      {"type": "model_output", "content": [{"type": "text", "text": text, "annotations": [
        {"type": "url_citation", "url": source, "start_index": 0, "end_index": len(sentence)},
      ]}]},
    ]})
    facts, _ = grounded_facts(response, {1: restaurant})
    self.assertIn(source, facts[1][("hours", "thu")]["09:00-00:00"])
    self.assertNotIn(("break", "thu"), facts[1])

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
