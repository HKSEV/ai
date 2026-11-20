import socket
from fnmatch import fnmatchcase
from ipaddress import ip_address
from time import monotonic
from urllib.parse import unquote

import httpx


USER_AGENT = "NowonFoodMenuLookup/1.0"
REDIRECTS = {301, 302, 303, 307, 308}


def https_url(value):
  if not isinstance(value, str) or len(value) > 1000:
    return None
  url = httpx.URL(value)
  if url.scheme == "http" and url.port is None:
    url = url.copy_with(scheme="https")
  if url.scheme != "https" or url.port is not None or "." not in url.host or url.userinfo:
    return None
  return url.copy_with(fragment=None)


def public_address(host):
  addresses = [ip_address(row[4][0]) for row in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)]
  if not addresses or any(not address.is_global or address.is_multicast for address in addresses):
    return None
  return str(next((address for address in addresses if address.version == 4), addresses[0]))


def read_response(client, url, deadline, max_bytes, content_types):
  host = url.raw_host.decode("ascii")
  address = public_address(host)
  remaining = deadline - monotonic()
  if not address or remaining <= 0:
    return None, ""
  # Connect to the tested IP and verify the original host's certificate.
  client.cookies.clear()
  with client.stream(
    "GET", url.copy_with(host=address),
    headers={"Host": host, "User-Agent": USER_AGENT, "Accept-Encoding": "identity"},
    extensions={"sni_hostname": host}, timeout=min(remaining, 2.5),
  ) as response:
    if response.status_code in REDIRECTS:
      return response.status_code, response.headers.get("Location", "")
    if response.status_code != 200:
      return response.status_code, ""
    if response.headers.get("Content-Type", "").partition(";")[0].lower().strip() not in content_types:
      return None, ""
    if response.headers.get("Content-Encoding", "identity").lower() != "identity":
      return None, ""
    content = bytearray()
    for chunk in response.iter_bytes():
      if len(content) + len(chunk) > max_bytes or monotonic() >= deadline:
        return None, ""
      content.extend(chunk)
    return 200, content.decode(response.encoding or "utf-8", errors="replace")


def robots_allow(rules, path):
  groups = []
  agents, policies = [], []
  for line in rules.splitlines():
    field, _, value = line.partition("#")[0].partition(":")
    field, value = field.strip().casefold(), value.strip()
    if field == "user-agent":
      if policies:
        groups.append((agents, policies))
        agents, policies = [], []
      agents.append(value.casefold())
    elif agents and field in {"allow", "disallow"}:
      policies.append((value, field == "allow"))
  groups.append((agents, policies))
  agent = USER_AGENT.partition("/")[0].casefold()
  explicit = [policies for agents, policies in groups if agent in agents]
  selected = explicit or [policies for agents, policies in groups if "*" in agents]
  matches = []
  for policies in selected:
    for rule, allow in policies:
      if not rule.startswith("/"):
        continue
      pattern = unquote(rule).replace("[", "[[]").replace("?", "[?]")
      pattern = pattern[:-1] if pattern.endswith("$") else pattern + "*"
      if fnmatchcase(path, pattern):
        matches.append((len(rule.replace("*", "").removesuffix("$")), allow))
  return max(matches, default=(0, True))[1]


def read_robots(client, url, deadline):
  rules_url = url.copy_with(path="/robots.txt", query=None)
  for _ in range(3):
    status, value = read_response(client, rules_url, deadline, 64 * 1024, {"text/plain"})
    if status == 200:
      return value
    if status in {404, 410}:
      return ""
    if status not in REDIRECTS or not value:
      break
    if not (rules_url := https_url(str(rules_url.join(value)))):
      break
  return None


def read_page(client, value, deadline, robots):
  url = https_url(value)
  for _ in range(3):
    if not url:
      return None
    if url.host not in robots:
      robots[url.host] = read_robots(client, url, deadline)
    policy = robots[url.host]
    if policy is None or not robots_allow(policy, unquote(url.raw_path.decode("ascii"))):
      return None
    status, body = read_response(client, url, deadline, 768 * 1024, {"text/html", "application/xhtml+xml"})
    if status == 200:
      return str(url), body
    if status not in REDIRECTS or not body:
      break
    url = https_url(str(url.join(body)))
  return None
