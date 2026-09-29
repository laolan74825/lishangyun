from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

PaymentMethod = Literal["cash", "wechat", "other"]
CheckStatus = Literal["unchecked", "checked", "disputed"]


class GbRecordCreate(BaseModel):
    guest_name: str = Field(..., max_length=50)
    phone: str | None = Field(None, max_length=20)
    amount: int = Field(..., ge=100, le=50000000)
    payment_method: PaymentMethod
    account_id: int | None = None
    note: str | None = None
    agent_name: str | None = Field(None, max_length=50)
    record_time: datetime | None = None
    person_id: int | None = None


class GbRecordUpdate(BaseModel):
    guest_name: str | None = Field(None, max_length=50)
    phone: str | None = Field(None, max_length=20)
    amount: int | None = Field(None, ge=100, le=50000000)
    payment_method: PaymentMethod | None = None
    account_id: int | None = None
    note: str | None = None
    agent_name: str | None = Field(None, max_length=50)
    check_status: CheckStatus | None = None
    record_time: datetime | None = None
    person_id: int | None = None
    is_private: bool | None = None


class GbRecordResponse(BaseModel):
    id: int
    uuid: str
    owner_id: int
    guestbook_id: int
    person_id: int | None = None
    guest_name: str
    phone: str | None = None
    amount: int
    payment_method: str
    account_id: int | None = None
    note: str | None = None
    agent_name: str | None = None
    check_status: str
    record_time: datetime
    client_id: str | None = None
    operator_name: str | None = None
    is_private: bool
    sync_version: int
    is_deleted: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GbRecordBatchCreate(BaseModel):
    records: list[GbRecordCreate]


class BatchCheckRequest(BaseModel):
    ids: list[int]
    checked: bool


class AccountSummaryItem(BaseModel):
    account_id: int | None = None
    account_name: str
    record_count: int
    total_amount: int
