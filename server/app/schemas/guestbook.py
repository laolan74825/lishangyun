from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

GuestbookStatus = Literal["active", "closing", "archived"]
EventType = Literal["wedding", "engagement", "birthday", "fullmoon", "birthday_banquet", "housewarming", "graduation", "funeral", "holiday", "other"]


class GuestbookCreate(BaseModel):
    name: str = Field(..., max_length=100)
    event_type: EventType
    event_date: date
    host_person_id: int | None = None
    operator_note: str | None = None


class GuestbookUpdate(BaseModel):
    name: str | None = Field(None, max_length=100)
    event_type: EventType | None = None
    event_date: date | None = None
    host_person_id: int | None = None
    operator_note: str | None = None


class GuestbookCloseRequest(BaseModel):
    """结束收礼请求：可选填一份收礼总结说明（最多 2000 字）"""
    summary: str | None = Field(None, max_length=2000)


class MergeCreatePersonsRequest(BaseModel):
    """合并向导「按礼簿数据新建人员」：勾选无法匹配的记录，确认后为每条记录新建人员并关联"""
    record_ids: list[int] = Field(..., min_length=1)


class GuestbookResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    event_type: str
    event_date: date
    status: str
    host_person_id: int | None = None
    operator_note: str | None = None
    closing_at: datetime | None = None
    closing_summary: str | None = None
    archived_at: datetime | None = None
    person_merged_at: datetime | None = None
    is_deleted: bool
    created_at: datetime
    updated_at: datetime

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
    person_merged_at: datetime | None = None
