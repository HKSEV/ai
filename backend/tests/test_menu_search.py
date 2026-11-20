import os
import socket
import unittest
from dataclasses import replace
from time import monotonic
from unittest.mock import Mock, patch

import httpx

os.environ["APP_ENV"] = "test"

from service import menu_search, public_web
from service.published_menu import published_menu


class MenuSearchTest(unittest.TestCase):
  def test_restaurant_owned_price_table_requires_the_branches_address(self):
    html = """
      <meta property="og:site_name" content="온기식탁">
      <h1>온기식탁 중계점</h1><address>서울특별시 노원구 중계로 19 (중계동)</address>
      <table>
        <tr><th>메뉴명</th><th>판매가</th></tr>
        <tr><td>버섯 덮밥</td><td>9,500원</td></tr>
        <tr><td>제철 수프</td><td>시가</td></tr>
        <tr><td>계절 정식</td><td>12,000~14,000원</td></tr>
      </table>
    """
    current, _ = published_menu(html, "온기식탁 중계점", "서울 노원구 중계로 19")
    self.assertEqual(current, [("버섯 덮밥", 9500), ("제철 수프", None), ("계절 정식", None)])
    other, _ = published_menu(html, "온기식탁 중계점", "서울 노원구 중계로 191")
    self.assertEqual(other, [])

  def test_unconfigured_web_lookup_needs_no_client(self):
    configured = replace(menu_search.settings, kakao_local_key="", kakao_rest_api_key="")
    with patch.object(menu_search, "settings", configured), patch("service.menu_search.httpx.Client") as client:
      self.assertEqual(menu_search.find_published_menus([{"id": 1, "is_demo": False, "address": "서울 노원구 중계로 19"}]), {})
      client.assert_not_called()

  def test_robots_disallow_and_private_resolution_prevent_page_fetch(self):
    policy = "User-agent: *\nDisallow: /branches/*\nAllow: /branches/public$\n"
    self.assertFalse(public_web.robots_allow(policy, "/branches/private"))
    self.assertTrue(public_web.robots_allow(policy, "/branches/public"))
    self.assertFalse(public_web.robots_allow(policy, "/branches/public/other"))
    with patch("service.public_web.socket.getaddrinfo", return_value=[
      (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("127.0.0.1", 443)),
    ]):
      client = Mock()
      self.assertIsNone(public_web.read_page(client, "https://restaurant.example/menu", monotonic() + 5, {}))
      client.stream.assert_not_called()
