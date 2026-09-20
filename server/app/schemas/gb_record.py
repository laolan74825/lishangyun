from datetime import datetime

from pydantic import BaseModel


class GbRecordCreate(BaseModel):
    guest_name: str
    phone: str | None = None
    amount: int
    payment_method: str
    account_id: int | None = None
    note: str | None = None
    agent_name: str | None = None
    record_time: datetime | None = None
    person_id: int | None = None


class GbRecordUpdate(BaseModel):
    guest_name: str | None = None
    phone: str | None = None
    amount: int | None = None
    payment_method: str | None = None
    account_id: int | None = None
    note: str | None = None
    agent_name: str | None = None
    check_status: str | None = None
    record_time: datetime | None = None
    person_id: int | None = None


class GbRecordResponse(BaseModel):
    id: int
    uuid: str
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
    created_at: datetime

    model_config = {"from_attributes": True}


class GbRecordBatchCreate(BaseModel):
    records: list[GbRecordCreate]


class BatchCheckRequest(BaseModel):
    ids: list[int]
    checked: bool


class AccountSummaryItem(BaseModel):
    record_count: int
    total_amount: int
