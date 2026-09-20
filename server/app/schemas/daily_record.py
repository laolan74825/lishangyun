from datetime import date, datetime

from pydantic import BaseModel


class DailyRecordCreate(BaseModel):
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


class DailyRecordUpdate(BaseModel):
    type: str | None = None
    person_id: int | None = None
    person_name: str | None = None
    phone: str | None = None
    amount: int | None = None
    event_type: str | None = None
    payment_method: str | None = None
    account_id: int | None = None
    event_date: date | None = None
    note: str | None = None


class DailyRecordResponse(BaseModel):
    id: int
    uuid: str
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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DailyRecordsSummary(BaseModel):
    total_records: int
    total_out: int
    total_in: int
    net: int
