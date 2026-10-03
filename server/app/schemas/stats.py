from pydantic import BaseModel


class PersonRankingItem(BaseModel):
    person_id: int | None = None
    person_name: str
    total_out: int
    total_in: int
    net: int


class TransactionSummaryByName(BaseModel):
    total_out: int
    total_in: int
    net: int


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
