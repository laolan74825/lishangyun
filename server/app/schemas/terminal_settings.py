from datetime import datetime

from pydantic import BaseModel, Field


class TerminalSettingsRead(BaseModel):
    id: int
    guestbook_id: int
    client_id: str
    operator_name: str
    default_cash_account: int | None = None
    default_wechat_account: int | None = None
    updated_at: datetime

    model_config = {"from_attributes": True}


class TerminalSettingsUpsert(BaseModel):
    client_id: str = Field(..., max_length=50)
    operator_name: str = Field(..., max_length=50)
    default_cash_account: int | None = None
    default_wechat_account: int | None = None
