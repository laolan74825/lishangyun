from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.daily_record import DailyRecordResponse

RelationshipTag = Literal["relative", "friend", "colleague", "classmate", "neighbor", "other"]


class PersonCreate(BaseModel):
    name: str = Field(..., max_length=50)
    nickname: str | None = Field(None, max_length=50)
    phone: str | None = Field(None, max_length=20)
    aliases: list[str] = []
    relationship_tag: RelationshipTag = "other"
    note: str | None = None


class PersonUpdate(BaseModel):
    name: str | None = Field(None, max_length=50)
    nickname: str | None = Field(None, max_length=50)
    phone: str | None = Field(None, max_length=20)
    aliases: list[str] | None = None
    relationship_tag: RelationshipTag | None = None
    note: str | None = None
    is_private: bool | None = None


class PersonResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    nickname: str | None = None
    phone: str | None = None
    aliases: list[str] = []
    relationship_tag: str
    note: str | None = None
    is_private: bool
    sync_version: int
    is_deleted: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PersonSummaryGbRecord(BaseModel):
    """人员来往明细中的礼簿收礼记录（附礼簿名称/事由，供前端展示事由）"""
    id: int
    guestbook_id: int
    guestbook_name: str
    guestbook_event_type: str
    guest_name: str
    amount: int
    payment_method: str
    record_time: datetime
    note: str | None = None
    agent_name: str | None = None


class PersonTransactionSummary(BaseModel):
    total_out: int
    total_in: int
    net: int
    daily_records: list[DailyRecordResponse] = []
    gb_records: list[PersonSummaryGbRecord] = []


class PersonMergeRequest(BaseModel):
    source_person_id: int
    target_person_id: int


class PersonMergeResult(BaseModel):
    target_person_id: int
    migrated_gb_records: int
    migrated_daily_records: int
    merged_aliases: list[str]
