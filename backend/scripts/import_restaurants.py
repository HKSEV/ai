import argparse
import json
from datetime import datetime, time, timezone
from pathlib import Path

from pydantic import Field, HttpUrl, field_validator, model_validator
from sqlalchemy import delete, select

from config.database import SessionLocal
from dto.account import InputModel
from entity.models import Menu, Restaurant


class MenuInput(InputModel):
  name: str = Field(min_length=1, max_length=100)
  price: int | None = Field(default=None, ge=1, le=10000000)
  servings: int = Field(default=1, ge=1, le=30)
  available: bool = True
  source: str = Field(min_length=1, max_length=100)
  source_url: HttpUrl | None = None
  checked_at: datetime

  @field_validator("checked_at")
  @classmethod
  def validate_time(cls, value):
    if not value.tzinfo or value > datetime.now(timezone.utc):
      raise ValueError("확인 시각은 시간대가 있는 현재 이전 시각이어야 합니다.")
    return value.astimezone(timezone.utc).replace(tzinfo=None)


class RestaurantInput(InputModel):
  external_id: str = Field(min_length=1, max_length=100)
  name: str = Field(min_length=1, max_length=150)
  address: str = Field(min_length=5, max_length=300)
  area: str = Field(min_length=1, max_length=100)
  category: str = Field(min_length=1, max_length=100)
  phone: str | None = Field(default=None, max_length=40)
  latitude: float | None = Field(default=None, ge=33, le=39)
  longitude: float | None = Field(default=None, ge=124, le=132)
  tags: list[str] = Field(default_factory=list, max_length=30)
  hours: dict | None = None
  closed_dates: list[str] = Field(default_factory=list)
  hours_source: str | None = Field(default=None, max_length=100)
  hours_source_url: HttpUrl | None = None
  hours_checked_at: datetime | None = None
  source: str = Field(min_length=1, max_length=100)
  source_url: HttpUrl | None = None
  checked_at: datetime
  menus: list[MenuInput] = Field(default_factory=list, max_length=100)

  @field_validator("address")
  @classmethod
  def validate_nowon(cls, value):
    if "노원구" not in value:
      raise ValueError("노원구 음식점만 등록할 수 있습니다.")
    return value

  @field_validator("checked_at", "hours_checked_at")
  @classmethod
  def validate_time(cls, value):
    return MenuInput.validate_time(value) if value else value

  @model_validator(mode="after")
  def validate_details(self):
    if (self.latitude is None) != (self.longitude is None):
      raise ValueError("위도와 경도를 함께 입력해 주세요.")
    if self.hours:
      if not self.hours_source or not self.hours_checked_at:
        raise ValueError("영업시간에는 별도 출처와 확인 시각이 필요합니다.")
      for day, item in self.hours.items():
        if day not in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]:
          raise ValueError("요일은 mon~sun을 사용해 주세요.")
        if not item.get("closed"):
          time.fromisoformat(item["open"])
          time.fromisoformat(item["close"])
          if bool(item.get("break_start")) != bool(item.get("break_end")):
            raise ValueError("브레이크타임 시작과 종료가 모두 필요합니다.")
          for key in ["break_start", "break_end"]:
            if item.get(key):
              time.fromisoformat(item[key])
    return self


def main():
  parser = argparse.ArgumentParser(description="이용 권한이 확보된 음식점 JSON을 등록합니다.")
  parser.add_argument("file", type=Path)
  parser.add_argument("--demo", action="store_true", help="실제 식당과 구분되는 개발 예시로 등록")
  args = parser.parse_args()
  if "example" in args.file.name and not args.demo:
    raise SystemExit("예시 파일은 반드시 --demo 옵션으로 등록하세요.")
  raw = json.loads(args.file.read_text(encoding="utf-8"))
  records = [RestaurantInput.model_validate(item) for item in raw]
  if SessionLocal is None:
    raise SystemExit("MySQL 연결 설정이 필요합니다.")
  with SessionLocal() as db:
    for record in records:
      values = record.model_dump(exclude={"menus"})
      for key in ["source_url", "hours_source_url"]:
        values[key] = str(values[key]) if values[key] else None
      item = db.scalar(select(Restaurant).where(Restaurant.external_id == record.external_id))
      if not item:
        item = Restaurant()
        db.add(item)
      for key, value in values.items():
        setattr(item, key, value)
      item.is_demo = args.demo
      db.flush()
      db.execute(delete(Menu).where(Menu.restaurant_id == item.id))
      for menu in record.menus:
        fields = menu.model_dump()
        fields["source_url"] = str(fields["source_url"]) if fields["source_url"] else None
        db.add(Menu(restaurant_id=item.id, **fields))
    db.commit()
  print(str(len(records)) + "개 음식점 등록 완료" + (" (개발 예시)" if args.demo else ""))


if __name__ == "__main__":
  main()
