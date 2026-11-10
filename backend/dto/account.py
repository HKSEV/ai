from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class InputModel(BaseModel):
  model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ProfileInput(InputModel):
  nickname: str = Field(min_length=2, max_length=20, pattern=r"^[가-힣a-zA-Z0-9_]+$")
  preferences: list[Literal["한식", "일식", "중식", "양식", "분식", "고기", "해산물", "카페", "채식"]] = Field(default_factory=list, max_length=9)
  budget_min: int | None = Field(default=None, ge=0, le=1000000)
  budget_max: int | None = Field(default=None, ge=1000, le=1000000)

  @model_validator(mode="after")
  def validate_budget(self):
    if self.budget_min is not None and self.budget_max is not None and self.budget_min > self.budget_max:
      raise ValueError("최소 가격은 최대 가격 이하여야 합니다.")
    self.preferences = list(dict.fromkeys(self.preferences))
    return self


class AddressInput(InputModel):
  label: str = Field(min_length=1, max_length=20)
  address: str = Field(min_length=5, max_length=300)
  latitude: float | None = Field(default=None, ge=33, le=39)
  longitude: float | None = Field(default=None, ge=124, le=132)
  is_default: bool = False

  @model_validator(mode="after")
  def validate_coordinates(self):
    if (self.latitude is None) != (self.longitude is None):
      raise ValueError("위도와 경도를 함께 입력해 주세요.")
    return self


class VisitInput(InputModel):
  restaurant_id: int = Field(gt=0)
  visited_on: date
  note: str = Field(default="", max_length=2000)
  receipt_id: str | None = Field(default=None, max_length=36)

  @field_validator("visited_on")
  @classmethod
  def validate_date(cls, value):
    if value > datetime.now(ZoneInfo("Asia/Seoul")).date():
      raise ValueError("방문일은 오늘 이전이어야 합니다.")
    return value
