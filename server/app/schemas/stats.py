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
