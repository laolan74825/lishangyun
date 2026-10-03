from pydantic import BaseModel

from app.schemas.daily_record import DailyRecordResponse
from app.schemas.person import PersonSummaryGbRecord


class PersonRankingItem(BaseModel):
    person_id: int | None = None
    person_name: str
    total_out: int
    total_in: int
    net: int


class TransactionSummaryByName(BaseModel):
    """按姓名查询的往来汇总：含差额调整计入后的净差额与来往明细"""
    total_out: int
    total_in: int
    adjustment_total: int = 0
    net: int
    daily_count: int = 0
    gb_count: int = 0
    daily_records: list[DailyRecordResponse] = []
    gb_records: list[PersonSummaryGbRecord] = []


class OverviewSummary(BaseModel):
    """首页总览汇总：日常随礼 + 礼簿收礼（礼簿收礼计入收到）"""
    total_out: int
    total_in: int
    net: int


class MonthlyTrendItem(BaseModel):
    month: str
    received: int
    sent: int


class EventDistributionItem(BaseModel):
    event_type: str
    total_amount: int
    record_count: int


class GuestbookStatsItem(BaseModel):
    guestbook_id: int
    guestbook_name: str
    event_type: str
    event_date: str
    total_records: int
    total_amount: int
    checked_count: int
