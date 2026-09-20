from datetime import datetime

from pydantic import BaseModel


class PaymentAccountCreate(BaseModel):
    name: str
    type: str
    identifier: str | None = None
    daily_limit: int = 2000000000
    qr_code: str | None = None
    is_active: bool = True


class PaymentAccountUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    identifier: str | None = None
    daily_limit: int | None = None
    qr_code: str | None = None
    is_active: bool | None = None


class PaymentAccountResponse(BaseModel):
    id: int
    name: str
    type: str
    identifier: str | None = None
    daily_limit: int
    qr_code: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
