from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator

from dto.account import InputModel


class ChatRequest(InputModel):
  message: str = Field(min_length=1, max_length=2000)
  conversation_id: int | None = Field(default=None, gt=0)
  origin_text: str | None = Field(default=None, max_length=300)
  latitude: float | None = Field(default=None, ge=33, le=39)
  longitude: float | None = Field(default=None, ge=124, le=132)

  @model_validator(mode="after")
  def validate_coordinates(self):
    if (self.latitude is None) != (self.longitude is None):
      raise ValueError("위도와 경도를 함께 입력해 주세요.")
    return self


class SearchConditions(InputModel):
  area: str | None = Field(default=None, max_length=100)
  cuisine: str | None = Field(default=None, max_length=80)
  budget_total: int | None = Field(default=None, ge=1000, le=20000000)
  party_size: int | None = Field(default=None, ge=1, le=30)
  visit_at: datetime | None = None
  atmosphere: str | None = Field(default=None, max_length=100)
  purpose: str | None = Field(default=None, max_length=100)
  radius_metres: int | None = Field(default=None, gt=0, le=20000000)
  clarification: str | None = Field(default=None, max_length=200)


class RankedRestaurant(InputModel):
  restaurant_id: int
  evidence_keys: list[Literal["area", "category", "menu_budget", "community_reviews", "preferences", "distance"]] = Field(default_factory=list, max_length=6)


class RecommendationResult(InputModel):
  items: list[RankedRestaurant] = Field(max_length=5)
