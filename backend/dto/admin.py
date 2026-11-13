from typing import Literal

from pydantic import Field, model_validator

from dto.account import InputModel


PromptName = Literal["conditions", "ranking"]


class PromptUpdate(InputModel):
  content: str = Field(min_length=1, max_length=12000)
  expected_version: int = Field(ge=1)


class PromptRestore(InputModel):
  version: int = Field(ge=1)
  expected_version: int = Field(ge=1)


class RestaurantUpdate(InputModel):
  name: str = Field(min_length=1, max_length=150)
  address: str = Field(min_length=5, max_length=300, pattern="노원구")
  area: str = Field(min_length=1, max_length=100)
  category: str = Field(min_length=1, max_length=100)
  phone: str | None = Field(default=None, max_length=40)
  latitude: float | None = Field(default=None, ge=33, le=39)
  longitude: float | None = Field(default=None, ge=124, le=132)
  tags: list[str] = Field(default_factory=list, max_length=30)

  @model_validator(mode="after")
  def validate_coordinates(self):
    if (self.latitude is None) != (self.longitude is None):
      raise ValueError("위도와 경도를 함께 입력해 주세요.")
    self.tags = list(dict.fromkeys(tag for tag in self.tags if tag))
    if any(len(tag) > 100 for tag in self.tags):
      raise ValueError("태그는 항목당 100자 이내로 입력해 주세요.")
    return self


class RestaurantRemoval(InputModel):
  review_count: int = Field(ge=0)
  visit_count: int = Field(ge=0)
  menu_count: int = Field(ge=0)
