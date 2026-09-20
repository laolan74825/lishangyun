from datetime import date, datetime

from pydantic import BaseModel


class PersonCreate(BaseModel):
    name: str
    nickname: str | None = None
    phone: str | None = None
    aliases: list[str] = []
    relation_tag: str = "其他"
    note: str | None = None


class PersonUpdate(BaseModel):
    name: str | None = None
    nickname: str | None = None
    phone: str | None = None
    aliases: list[str] | None = None
    relation_tag: str | None = None
    note: str | None = None


class PersonResponse(BaseModel):
    id: int
    name: str
    nickname: str | None = None
    phone: str | None = None
    aliases: list[str] = []
    relation_tag: str
    note: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PersonTransactionSummary(BaseModel):
    total_out: int
    total_in: int
    net: int
