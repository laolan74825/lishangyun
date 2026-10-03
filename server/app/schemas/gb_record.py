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
    # 记账员/终端标识：仅写入记录与操作日志，不作为记录字段
    operator_name: str | None = Field(None, max_length=50)
    client_id: str | None = Field(None, max_length=64)


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
    # 修改原因/备注：仅写入操作日志，不落到记录字段
    remark: str | None = Field(None, max_length=200)
    # 记账员/终端标识：仅写入操作日志，不落到记录字段
    operator_name: str | None = Field(None, max_length=50)
    client_id: str | None = Field(None, max_length=64)

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
    deleted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GbRecordBatchCreate(BaseModel):
    records: list[GbRecordCreate]
    # 记账员/终端标识：提升到批次顶层，统一写入每条记录及其操作日志
    operator_name: str | None = Field(None, max_length=50)
    client_id: str | None = Field(None, max_length=64)


class BatchCheckRequest(BaseModel):
    ids: list[int]
    checked: bool


class AccountSummaryItem(BaseModel):
    account_id: int | None = None
    account_name: str
    record_count: int
    total_amount: int
