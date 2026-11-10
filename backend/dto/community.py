from datetime import date
from typing import Literal

from pydantic import Field, field_validator, model_validator

from dto.account import InputModel, VisitInput


class PostInput(InputModel):
  kind: Literal["experience", "review"]
  title: str = Field(min_length=2, max_length=100)
  content: str = Field(min_length=10, max_length=10000)
  restaurant_id: int | None = Field(default=None, gt=0)
  rating: int | None = Field(default=None, ge=1, le=5)
  visited_on: date | None = None
  visit_id: int | None = Field(default=None, gt=0)
  photo_ids: list[str] = Field(default_factory=list, max_length=4)

  @field_validator("visited_on")
  @classmethod
  def validate_date(cls, value):
    return VisitInput.validate_date(value) if value else value

  @model_validator(mode="after")
  def validate_review(self):
    if self.kind == "review" and (not self.restaurant_id or self.rating is None or not self.visited_on):
      raise ValueError("음식점 리뷰에는 음식점, 별점, 방문일이 필요합니다.")
    if self.kind == "experience" and any(value is not None for value in [self.restaurant_id, self.rating, self.visited_on, self.visit_id]):
      raise ValueError("서비스 사용 후기에는 음식점 방문 정보를 입력할 수 없습니다.")
    self.photo_ids = list(dict.fromkeys(self.photo_ids))
    return self
