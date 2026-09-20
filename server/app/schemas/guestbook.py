from datetime import date, datetime

from pydantic import BaseModel


class GuestbookCreate(BaseModel):
    name: str
    event_type: str
    event_date: date
    status: str = "收礼中"
    operator_note: str | None = None


class GuestbookUpdate(BaseModel):
    name: str | None = None
    event_type: str | None = None
    event_date: date | None = None
    status: str | None = None
    operator_note: str | None = None


class GuestbookResponse(BaseModel):
    id: int
    name: str
    event_type: str
    event_date: date
    status: str
    created_at: datetime
    completed_at: datetime | None = None
    operator_note: str | None = None

    model_config = {"from_attributes": True}


class GuestbookSummary(BaseModel):
    id: int
    name: str
    event_type: str
    event_date: date
    status: str
    total_records: int = 0
    total_amount: int = 0
    checked_count: int = 0
    unchecked_count: int = 0
