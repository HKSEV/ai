import base64
import json
import logging
import re
import unicodedata
from datetime import date
from html.parser import HTMLParser
from urllib.parse import urlsplit

from google.genai import types

from config.gemini import RESEARCH_PROMPT
from config.settings import settings
from dto.research import RestaurantResearch
from entity.models import utcnow
from service.common import timestamp
from service.restaurant_service import DAYS


ADDRESS = re.compile(r"([가-힣]+구)\s+([가-힣A-Za-z0-9·]+(?:길|로|동|가))\s*(\d+(?:-\d+)?)(?![\d-])")
UNIT = re.compile(r"(?:지하\s*)?\d+\s*(?:층|호)")
CLOCK = re.compile(r"(?<!\d)(\d{1,2}):([0-5]\d)(?!\d)")
WON = re.compile(r"(?<![\d.,])([0-9]+(?:,[0-9]{3})*)\s*원")
DATE = re.compile(r"(?<!\d)(\d{4})\s*(?:년|[-./])\s*(\d{1,2})\s*(?:월|[-./])\s*(\d{1,2})(?!\d)")
DAY_LABELS = dict(zip(DAYS, ["월", "화", "수", "목", "금", "토", "일"]))


def normalized(text):
  return re.sub(r"[^0-9a-z가-힣]", "", unicodedata.normalize("NFKC", text).casefold())


def matches_branch(quote, restaurant):
  if normalized(restaurant["name"]) not in normalized(quote):
    return False
  expected = ADDRESS.search(unicodedata.normalize("NFKC", restaurant["address"]))
  found = set(ADDRESS.findall(unicodedata.normalize("NFKC", quote)))
  if not expected or found != {expected.groups()}:
    return False
  units = {normalized(unit) for unit in UNIT.findall(restaurant["address"])}
  return units <= {normalized(unit) for unit in UNIT.findall(quote)}


def period_days(key, quote):
  if key == "daily":
    return DAYS if any(word in quote for word in ("매일", "연중무휴")) else []
  if key == "weekdays":
    return DAYS[:5] if "평일" in quote or re.search(r"월\s*[~～–-]\s*금", quote) else []
  if key == "weekend":
    return DAYS[5:] if "주말" in quote or re.search(r"토\s*[~～–-]\s*일", quote) else []
  if key in DAY_LABELS:
    day = DAY_LABELS[key]
    return [key] if re.search(rf"(?<![\d가-힣]){day}(?:요일|\s|[:(]|$)", quote) else []
  try:
    day = date.fromisoformat(key)
  except ValueError:
    return []
  return [key] if day.isoformat() == key and any(tuple(map(int, parts)) == (day.year, day.month, day.day) for parts in DATE.findall(quote)) else []


def clocks(text):
  return [f"{int(hour) % 24:02}:{minute}" for hour, minute in CLOCK.findall(text)
          if int(hour) < 24 or (int(hour) == 24 and minute == "00")]


def fact_value(fact):
  quote = unicodedata.normalize("NFKC", fact.quote)
  if fact.kind == "menu":
    if not normalized(fact.key) or normalized(fact.key) not in normalized(quote) or re.search(r"단종|판매\s*종료|판매하지|품절", quote):
      return []
    amounts = {int(value.replace(",", "")) for value in WON.findall(quote)}
    price = int(fact.value) if fact.value and re.fullmatch(r"[0-9]{1,8}", fact.value) else None
    # A quote can confirm a menu name even when the amount is ambiguous.
    if price is None or amounts != {price} or not 0 < price <= 10000000 or re.search(r"배달|할인|행사|[~～–-]\s*\d", quote):
      price = None
    return [(fact.key, price)]
  days = period_days(fact.key, quote)
  value = fact.value or ""
  if fact.kind == "hours" and value == "휴무":
    return [(day, value) for day in days] if re.search(r"휴무|휴점|영업\s*쉼", quote) and not re.search(r"휴무\s*(?:없|없이)", quote) else []
  is_break = bool(re.search(r"브레이크\s*타임|휴식\s*시간|준비\s*시간", quote))
  is_last_order = bool(re.search(r"라스트\s*오더|주문\s*마감|last\s*order", quote, re.I))
  if (fact.kind == "break") != is_break or (fact.kind == "last_order") != is_last_order:
    return []
  times = clocks(value)
  expected_count = 1 if fact.kind == "last_order" else 2
  if len(times) != expected_count or clocks(quote) != times:
    return []
  return [(day, "-".join(times)) for day in days]


def web_url(value):
  try:
    url = urlsplit(value)
    return url if url.scheme in {"https", "http"} and url.hostname and not url.username and not url.password else None
  except (TypeError, ValueError):
    return None


def cited_spans(candidate, checked_at):
  metadata = candidate.grounding_metadata
  parts = candidate.content.parts if candidate.content else []
  visible = [(index, part.text) for index, part in enumerate(parts or []) if not part.thought and part.text]
  spans = []
  for support in metadata.grounding_supports or []:
    segment = support.segment
    if segment is None:
      continue
    index = segment.part_index if segment.part_index is not None else (visible[0][0] if visible else -1)
    part = next((text for position, text in visible if position == index), "")
    if not part:
      continue
    start, end = segment.start_index or 0, segment.end_index
    raw = part.encode("utf-8")
    if end is not None and 0 <= start < end <= len(raw):
      text = raw[start:end].decode("utf-8", errors="ignore")
    else:
      text = ""
    if segment.text and segment.text in part:
      text = segment.text
    if not text:
      continue
    sources = {}
    chunks = metadata.grounding_chunks or []
    for source_index in support.grounding_chunk_indices or []:
      if not 0 <= source_index < len(chunks):
        continue
      web = chunks[source_index].web
      if web and web.uri and (url := web_url(web.uri)):
        sources[web.uri] = {"name": web.title or url.hostname, "url": web.uri, "checked_at": checked_at}
    if sources:
      spans.append((text, sources))
  return spans


def quote_sources(spans, quote):
  escaped = json.dumps(quote, ensure_ascii=False)[1:-1]
  sources = {}
  for text, links in spans:
    if quote in text or escaped in text:
      sources.update(links)
  return sources


class SuggestionLinks(HTMLParser):
  def __init__(self):
    super().__init__()
    self.links = []
    self.href = None
    self.label = []

  def handle_starttag(self, tag, attrs):
    if tag == "a":
      self.href = dict(attrs).get("href")
      self.label = []

  def handle_data(self, data):
    if self.href:
      self.label.append(data)

  def handle_endtag(self, tag):
    if tag == "a" and self.href:
      self.links.append(("".join(self.label).strip(), self.href))
      self.href = None


def search_suggestions(metadata):
  entry = metadata.search_entry_point
  if entry is None:
    return []
  links = []
  if entry.sdk_blob:
    try:
      value = json.loads(base64.b64decode(entry.sdk_blob))
      if isinstance(value, list):
        links = value
    except (TypeError, ValueError):
      pass
  if not links and entry.rendered_content:
    parser = SuggestionLinks()
    parser.feed(entry.rendered_content)
    links = parser.links
  result = []
  for link in links:
    if not isinstance(link, (list, tuple)) or len(link) != 2:
      continue
    label, href = link
    if isinstance(label, str) and label and isinstance(href, str) and (url := web_url(href)) and url.scheme == "https" and url.hostname in {"www.google.com", "google.com", "www.google.co.kr"} and url.path == "/search":
      result.append({"label": label, "url": href})
  return result[:5]


def grounded_facts(response, restaurants):
  if not response.candidates or not response.candidates[0].grounding_metadata:
    return {}, []
  candidate = response.candidates[0]
  metadata = candidate.grounding_metadata
  if not metadata.web_search_queries:
    return {}, []
  spans = cited_spans(candidate, timestamp(utcnow()))
  if not spans:
    return {}, []
  result = RestaurantResearch.model_validate_json(response.text)
  facts = {}
  for branch in result.branches:
    restaurant = restaurants.get(branch.restaurant_id)
    if not restaurant or not matches_branch(branch.identity_quote, restaurant):
      continue
    identity_sources = quote_sources(spans, branch.identity_quote)
    for fact in branch.facts:
      sources = {uri: link for uri, link in quote_sources(spans, fact.quote).items() if uri in identity_sources}
      if not sources:
        continue
      for key, value in fact_value(fact):
        item = facts.setdefault(branch.restaurant_id, {}).setdefault((fact.kind, key), {})
        item.setdefault(value, {}).update(sources)
  return facts, search_suggestions(metadata) if facts else []


def research_restaurants(client, restaurants, visit_date):
  by_id = {item["id"]: item for item in restaurants if not item["is_demo"]}
  if not by_id:
    return {}, []
  try:
    response = client.models.generate_content(
      model=settings.gemini_model,
      contents=json.dumps({"restaurants": [
        {"id": item["id"], "name": item["name"], "address": item["address"]} for item in by_id.values()
      ], "visit_date": visit_date}, ensure_ascii=False),
      config=types.GenerateContentConfig(
        system_instruction=RESEARCH_PROMPT, tools=[types.Tool(google_search=types.GoogleSearch())],
        response_mime_type="application/json", response_json_schema=RestaurantResearch.model_json_schema(),
        temperature=0.1, max_output_tokens=8192, http_options=types.HttpOptions(timeout=35000),
      ),
    )
    return grounded_facts(response, by_id)
  except Exception as error:
    logging.getLogger(__name__).warning("Restaurant research unavailable: %s", type(error).__name__)
    return {}, []


PERIOD_FIELDS = {
  "hours": ("open", "close"),
  "break": ("break_start", "break_end"),
  "last_order": ("last_order",),
}


def research_sources(choices):
  return list({url: source for sources in choices.values() for url, source in sources.items()}.values())


def merge_period(period, kind, choices, registered_source):
  fields = PERIOD_FIELDS[kind]
  existing = "휴무" if kind == "hours" and period.get("closed") else None
  if not existing and all(period.get(field) for field in fields):
    existing = "-".join(period[field] for field in fields)
  values = set(choices)
  sources = research_sources(choices)
  if existing:
    values.add(existing)
    if registered_source:
      sources.append(registered_source)
  period.setdefault("sources", {})[kind] = sources
  for field in fields:
    period.pop(field, None)
  if kind == "hours":
    period.pop("closed", None)
  if len(values) != 1:
    period.setdefault("conflicts", []).append(kind)
    return
  value = values.pop()
  if value == "휴무":
    period["closed"] = True
  else:
    period.update(zip(fields, value.split("-")))


def merge_research(candidate, facts):
  hours = candidate.get("hours") or {}
  menus = {normalized(menu["name"]): menu for menu in candidate["menus"]}
  registered_source = {
    "name": candidate["hours_source"], "url": candidate["hours_source_url"], "checked_at": candidate["hours_checked_at"],
  } if candidate.get("hours_source") and (hours or candidate["closed_dates"]) else None
  for (kind, key), choices in facts.items():
    if kind != "menu":
      periods = hours if key in DAYS else hours.setdefault("exceptions", {})
      period = periods.setdefault(key, {})
      if key in candidate["closed_dates"]:
        period["closed"] = True
        candidate["closed_dates"].remove(key)
      merge_period(period, kind, choices, registered_source)
      continue
    name_key = normalized(key)
    menu = menus.get(name_key)
    sources = research_sources(choices)
    prices = {price for price in choices if price is not None}
    if menu is None:
      menu = {"id": -(len(candidate["menus"]) + 1), "name": key, "available": True, "servings": None}
      menus[name_key] = menu
      candidate["menus"].append(menu)
    elif menu["is_current"] and menu["price"] is not None:
      prices.add(menu["price"])
    if menu.get("sources"):
      sources.extend(menu["sources"])
    elif menu.get("is_current") and menu["price"] is not None:
      sources.append({"name": menu["source"], "url": menu["source_url"], "checked_at": menu["checked_at"]})
    first_source = sources[0]
    conflict = bool(menu.get("price_conflict")) or len(prices) > 1
    menu.update({
      "price": next(iter(prices)) if len(prices) == 1 and not conflict else None,
      "price_conflict": conflict,
      "source": first_source["name"], "source_url": first_source["url"],
      "checked_at": first_source["checked_at"], "is_current": True, "sources": sources,
    })
  candidate["hours"] = hours or None
