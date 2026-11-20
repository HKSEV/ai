import json
import re
import unicodedata
from html.parser import HTMLParser

from service.common import branch_key, normalized


PRICE = re.compile(r"(?:₩\s*)?([0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.0{1,2})?\s*원?")
FOOD_ESTABLISHMENTS = {"Restaurant", "FoodEstablishment", "Bakery", "BarOrPub", "CafeOrCoffeeShop", "FastFoodRestaurant", "IceCreamShop"}
NAME_COLUMNS = {"메뉴", "메뉴명", "음식", "품목", "menu", "item"}
PRICE_COLUMNS = {"가격", "판매가", "금액", "가격(원)", "price", "price(krw)"}


class MenuPage(HTMLParser):
  def __init__(self, html):
    super().__init__()
    self.site_name = ""
    self.headings = []
    self.addresses = []
    self.data = []
    self.tables = []
    self._table = None
    self._row = None
    self._tag = None
    self._text = []
    self.feed(html)
    self.close()

  def handle_starttag(self, tag, attributes):
    attrs = dict(attributes)
    if tag == "meta" and attrs.get("property") == "og:site_name":
      self.site_name = attrs.get("content") or ""
    if tag == "table":
      self._table = []
    if tag == "tr" and self._table is not None:
      self._row = []
    if tag in {"title", "h1", "address", "th", "td"} or (
      tag == "script" and (attrs.get("type") or "").partition(";")[0].strip().lower() == "application/ld+json"
    ):
      self._tag, self._text = tag, []

  def handle_data(self, value):
    if self._tag:
      self._text.append(value)

  def handle_endtag(self, tag):
    if tag == self._tag:
      content = " ".join(" ".join(self._text).split())
      if tag == "script":
        try:
          self.data.extend(as_list(json.loads("".join(self._text))))
        except (ValueError, RecursionError):
          pass
      elif tag == "address":
        self.addresses.append(content)
      elif tag in {"title", "h1"}:
        self.headings.append(content)
      elif self._row is not None:
        self._row.append(content)
      self._tag, self._text = None, []
    if tag == "tr" and self._row is not None and self._table is not None:
      self._table.append(self._row)
      self._row = None
    if tag == "table" and self._table is not None:
      self.tables.append(self._table)
      self._table, self._row = None, None


def as_list(value):
  return value if isinstance(value, list) else [value] if value is not None else []


def text(value):
  return " ".join(value.split()) if isinstance(value, str) else ""


def types(value):
  return {text(kind).rsplit("/", 1)[-1] for kind in as_list(value.get("@type"))}


def address_text(value):
  if not isinstance(value, dict):
    return text(value)
  street = text(value.get("streetAddress"))
  locality, region = (text(value.get(key)) for key in ("addressLocality", "addressRegion"))
  for part in (locality, region):
    if part and normalized(part) not in normalized(street):
      street = part + " " + street
  return street


def unit_price(value, *, krw=False):
  value = unicodedata.normalize("NFKC", text(value) if isinstance(value, str) else str(value))
  match = PRICE.fullmatch(value)
  if not match or (not krw and "원" not in value and "₩" not in value):
    return None
  amount = match[1].replace(",", "")
  return int(amount) if len(amount) <= 8 and 0 < int(amount) <= 10000000 else None


def sale_price(item):
  prices = set()
  for offer in as_list(item.get("offers")):
    if not isinstance(offer, dict) or "AggregateOffer" in types(offer):
      continue
    currency = text(offer.get("priceCurrency")).upper()
    availability = text(offer.get("availability")).rsplit("/", 1)[-1]
    if currency not in {"", "KRW"} or availability in {"Discontinued", "OutOfStock", "SoldOut"}:
      continue
    prices.add(unit_price(offer.get("price"), krw=currency == "KRW"))
  return next(iter(prices)) if len(prices) == 1 else None


def schema_objects(data):
  objects = []
  for item in data:
    if isinstance(item, dict):
      objects.append(item)
      objects.extend(entry for entry in as_list(item.get("@graph")) + as_list(item.get("mainEntity")) if isinstance(entry, dict))
  return objects


def schema_menu(value, indexed, seen, menus, links):
  for node in as_list(value):
    if isinstance(node, str):
      node = indexed.get(node, node)
    elif isinstance(node, dict) and len(node) == 1 and isinstance(node.get("@id"), str):
      node = indexed.get(node["@id"], node)
    if isinstance(node, str):
      links.append(node)
    elif isinstance(node, dict) and id(node) not in seen:
      seen.add(id(node))
      if "MenuItem" in types(node):
        menus.append((text(node.get("name")), sale_price(node)))
      else:
        for field in ("hasMenuSection", "hasMenuItem"):
          schema_menu(node.get(field), indexed, seen, menus, links)


def table_menus(tables):
  for header, *rows in (table for table in tables if table):
    headings = [normalized(cell) for cell in header]
    name = next((i for i, label in enumerate(headings) if label in NAME_COLUMNS), None)
    price = next((i for i, label in enumerate(headings) if label in PRICE_COLUMNS), None)
    if name is not None and (price is not None or headings[name] in {"메뉴", "메뉴명", "menu"}):
      for row in rows:
        if name < len(row):
          amount = unit_price(row[price], krw=headings[price] in {"가격(원)", "price(krw)"}) if price is not None and price < len(row) else None
          yield row[name], amount


def published_menu(html, name, address):
  page = MenuPage(html)
  key = branch_key(name, address)
  name_parts = name.rsplit(maxsplit=1)
  publisher_names = {key[0]}
  if len(name_parts) == 2 and name_parts[1].endswith("점"):
    publisher_names.add(normalized(name_parts[0]))
  objects = schema_objects(page.data)
  indexed = {item["@id"]: item for item in objects if isinstance(item.get("@id"), str) and len(item) > 1}
  publishers = [page.site_name]
  for item in objects:
    if types(item) & {"WebPage", "WebSite"}:
      publisher = item.get("publisher")
      if isinstance(publisher, dict):
        publisher = indexed.get(text(publisher.get("@id")), publisher)
        publishers.append(text(publisher.get("name")))
  if not any(normalized(publisher) in publisher_names for publisher in publishers):
    return [], []
  restaurants = [item for item in objects if types(item) & FOOD_ESTABLISHMENTS]
  matches = [item for item in restaurants
             if branch_key(text(item.get("name")), address_text(item.get("address"))) == key]
  menus, links, seen = [], [], set()
  for item in matches:
    schema_menu(item.get("hasMenu") or item.get("menu"), indexed, seen, menus, links)
  visible_branch = (key[0] in {normalized(heading) for heading in page.headings}
                    and {branch_key(name, address)[1] for address in page.addresses} == {key[1]})
  if visible_branch and (not restaurants or (len(restaurants) == 1 and matches)):
    menus.extend(table_menus(page.tables))
  return [(label, price) for label, price in menus if 0 < len(label) <= 100], links
