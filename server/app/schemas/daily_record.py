from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

RecordType = Literal["in", "out"]
PaymentMethod = Literal["cash", "wechat", "other"]
EventType = Literal["wedding", "birthday", "fullmoon", "housewarming", "graduation", "funeral", "holiday", "other"]


class DailyRecordCreate(BaseModel):
    type: RecordType
    person_id: int | None = None
    person_name: str = Field(..., max_length=50)
    phone: str | None = Field(None, max_length=20)
    amount: int = Field(..., ge=100, le=50000000)
    event_type: EventType
    payment_method: PaymentMethod | None = None
    account_id: int | None = None
    event_date: date
    note: str | None = None
    is_private: bool = False


class DailyRecordUpdate(BaseModel):
    type: RecordType | None = None
    person_id: int | None = None
    person_name: str | None = Field(None, max_length=50)
    phone: str | None = Field(None, max_length=20)
    amount: int | None = Field(None, ge=100, le=50000000)
    event_type: EventType | None = None
    payment_method: PaymentMethod | None = None
    account_id: int | None = None
    event_date: date | None = None
    note: str | None = None
    is_private: bool | None = None
    is_private: bool | None = None


class DailyRecordResponse(BaseModel):
    id: int
    uuid: str
    owner_id: int
    type: str
    person_id: int | None = None
    person_name: str
    phone: str | None = None
    amount: int
    event_type: str
    payment_method: str | None = None
    account_id: int | None = None
    event_date: date
    note: str | None = None
    source: str
    source_id: int | None = None
    created_by: str | None = None
    is_private: bool
    sync_version: int
    is_deleted: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DailyRecordsSummary(BaseModel):
    total_records: int
    total_out: int
    total_in: int
    net: int
