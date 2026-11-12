from typing import Literal

from pydantic import Field

from dto.account import InputModel


class RestaurantFact(InputModel):
  kind: Literal["hours", "break", "last_order", "menu"]
  key: str = Field(min_length=1, max_length=100)
  value: str | None = Field(default=None, max_length=30)
  quote: str = Field(min_length=1, max_length=200)


class RestaurantBranch(InputModel):
  restaurant_id: int
  identity_quote: str = Field(min_length=1, max_length=250)
  facts: list[RestaurantFact] = Field(max_length=18)


class RestaurantResearch(InputModel):
  branches: list[RestaurantBranch] = Field(max_length=15)
