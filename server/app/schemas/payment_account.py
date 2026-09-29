from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

PaymentAccountType = Literal["cash", "wechat"]


class PaymentAccountCreate(BaseModel):
    name: str = Field(..., max_length=50)
    type: PaymentAccountType
    identifier: str | None = Field(None, max_length=50)
    daily_limit: int = Field(20000000, ge=0)
    qr_code: str | None = None
    is_active: bool = True


class PaymentAccountUpdate(BaseModel):
    name: str | None = Field(None, max_length=50)
    type: PaymentAccountType | None = None
    identifier: str | None = Field(None, max_length=50)
    daily_limit: int | None = Field(None, ge=0)
    qr_code: str | None = None
    is_active: bool | None = None


class PaymentAccountResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    type: str
    identifier: str | None = None
    daily_limit: int
    qr_code: str | None = None
    is_active: bool
    is_deleted: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
