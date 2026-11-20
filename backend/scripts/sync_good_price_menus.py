import json
from pathlib import Path
from tempfile import NamedTemporaryFile

import httpx

from config.settings import settings
from service.good_price import fetch_price_snapshot


def main():
  if not settings.good_price_api_key:
    raise SystemExit("백엔드에 GOOD_PRICE_API_KEY를 설정하세요.")
  try:
    with httpx.Client(timeout=10) as client:
      snapshot = fetch_price_snapshot(client, settings.good_price_api_key)
  except (httpx.HTTPError, KeyError, TypeError, ValueError):
    raise SystemExit("착한가격업소 자료를 받지 못했습니다. 인증키와 데이터셋 이용 권한을 확인해 주세요.") from None
  target = settings.good_price_menu_file
  target.parent.mkdir(parents=True, exist_ok=True)
  with NamedTemporaryFile(mode="w", encoding="utf-8", dir=target.parent, delete=False) as stream:
    temporary = Path(stream.name)
    try:
      json.dump(snapshot, stream, ensure_ascii=False)
      stream.close()
      temporary.replace(target)
    finally:
      temporary.unlink(missing_ok=True)
  print(f"노원구 착한가격업소 메뉴 {len(snapshot['menus'])}개를 확인했습니다.")


if __name__ == "__main__":
  main()
