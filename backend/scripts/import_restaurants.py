import argparse
import json
from datetime import date, datetime, time, timezone
from pathlib import Path

from pydantic import Field, HttpUrl, field_validator, model_validator
from sqlalchemy import delete, select

from config.database import SessionLocal
from dto.account import InputModel
from entity.models import Menu, Restaurant
from service.restaurant_service import DAYS


def validate_period(period):
  if not isinstance(period, dict):
    raise ValueError("영업 일정은 시각이나 휴무 여부를 담은 객체로 입력하세요.")
  if period.get("closed") is True:
    return
  if bool(period.get("break_start")) != bool(period.get("break_end")):
    raise ValueError("브레이크타임 시작과 종료를 함께 입력하세요.")
  try:
    for key in ["open", "close", "break_start", "break_end"]:
      if key in {"open", "close"} or period.get(key):
        if time.fromisoformat(period[key]).tzinfo is not None:
          raise ValueError
  except (KeyError, TypeError, ValueError):
    raise ValueError("영업시간은 시간대 없이 HH:MM 형식으로 입력하세요.") from None


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


class RestaurantHoursInput(InputModel):
  external_id: str = Field(min_length=1, max_length=100)
  hours: dict | None = None
  closed_dates: list[str] = Field(default_factory=list)
  hours_source: str | None = Field(default=None, max_length=100)
  hours_source_url: HttpUrl | None = None
  hours_checked_at: datetime | None = None

  @field_validator("hours_checked_at")
  @classmethod
  def validate_hours_time(cls, value):
    return MenuInput.validate_time(value) if value else value

  @model_validator(mode="after")
  def validate_hours(self):
    if self.hours or self.closed_dates:
      if not self.hours_source or not self.hours_checked_at:
        raise ValueError("영업시간에는 별도 출처와 확인 시각이 필요합니다.")
      weekly = self.hours or {}
      exceptions = weekly.get("exceptions", {})
      if not isinstance(exceptions, dict):
        raise ValueError("날짜별 예외를 날짜를 키로 사용하는 객체로 입력하세요.")
      for day, period in weekly.items():
        if day != "exceptions":
          if day not in DAYS:
            raise ValueError("요일은 mon~sun을 사용하세요.")
          validate_period(period)
      for day in [*self.closed_dates, *exceptions]:
        if not isinstance(day, str) or date.fromisoformat(day).isoformat() != day:
          raise ValueError("날짜를 YYYY-MM-DD 형식으로 입력하세요.")
      for period in exceptions.values():
        validate_period(period)
    return self


class RestaurantInput(RestaurantHoursInput):
  name: str = Field(min_length=1, max_length=150)
  address: str = Field(min_length=5, max_length=300)
  area: str = Field(min_length=1, max_length=100)
  category: str = Field(min_length=1, max_length=100)
  phone: str | None = Field(default=None, max_length=40)
  latitude: float | None = Field(default=None, ge=33, le=39)
  longitude: float | None = Field(default=None, ge=124, le=132)
  tags: list[str] = Field(default_factory=list, max_length=30)
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

  @field_validator("checked_at")
  @classmethod
  def validate_time(cls, value):
    return MenuInput.validate_time(value)

  @model_validator(mode="after")
  def validate_coordinates(self):
    if (self.latitude is None) != (self.longitude is None):
      raise ValueError("위도와 경도를 함께 입력해 주세요.")
    return self


def main():
  parser = argparse.ArgumentParser(description="이용 권한이 확보된 음식점 JSON을 등록합니다.")
  parser.add_argument("file", type=Path)
  mode = parser.add_mutually_exclusive_group()
  mode.add_argument("--demo", action="store_true", help="개발 예시로 등록합니다.")
  mode.add_argument("--hours-only", action="store_true", help="이미 등록된 음식점의 영업 일정만 갱신합니다.")
  args = parser.parse_args()
  if "example" in args.file.name and not args.demo:
    raise SystemExit("예시 파일은 반드시 --demo 옵션으로 등록하세요.")
  raw = json.loads(args.file.read_text(encoding="utf-8"))
  schema = RestaurantHoursInput if args.hours_only else RestaurantInput
  records = [schema.model_validate(item) for item in raw]
  if SessionLocal is None:
    raise SystemExit("MySQL 연결 설정이 필요합니다.")
  with SessionLocal() as db:
    for record in records:
      item = db.scalar(select(Restaurant).where(Restaurant.external_id == record.external_id))
      if not item:
        if args.hours_only:
          raise SystemExit("이미 등록된 음식점 ID를 입력하세요. " + record.external_id)
        item = Restaurant()
        db.add(item)
      values = record.model_dump(exclude={"menus"})
      for key in ["source_url", "hours_source_url"]:
        if values.get(key):
          values[key] = str(values[key])
      for key, value in values.items():
        setattr(item, key, value)
      if args.hours_only:
        continue
      item.is_demo = args.demo
      db.flush()
      db.execute(delete(Menu).where(Menu.restaurant_id == item.id))
      for menu in record.menus:
        fields = menu.model_dump()
        fields["source_url"] = str(fields["source_url"]) if fields["source_url"] else None
        db.add(Menu(restaurant_id=item.id, **fields))
    db.commit()
  action = "개 음식점 영업 일정 갱신 완료" if args.hours_only else "개 음식점 등록 완료"
  print(str(len(records)) + action + (" (개발 예시)" if args.demo else ""))


if __name__ == "__main__":
  main()
