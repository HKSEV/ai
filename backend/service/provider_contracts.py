from datetime import datetime
from typing import Protocol

from pydantic import BaseModel, Field


class SourcedValue(BaseModel):
  provider: str
  source_url: str
  checked_at: datetime
  is_realtime: bool = False


class BusinessSignals(SourcedValue):
  is_open: bool | None = None
  wait_minutes: int | None = Field(default=None, ge=0)


class PaymentSignals(SourcedValue):
  period: str
  sample_definition: str
  estimated_spending: int | None = Field(default=None, ge=0)
  repeat_visit_rate: float | None = Field(default=None, ge=0, le=1)


class BusinessProvider(Protocol):
  def lookup(self, external_id: str) -> BusinessSignals | None: ...


class PaymentProvider(Protocol):
  def lookup(self, external_id: str) -> PaymentSignals | None: ...


class ReceiptVerifier(Protocol):
  def verify(self, receipt_bytes: bytes, restaurant_id: int, visited_on: str) -> SourcedValue | None: ...
