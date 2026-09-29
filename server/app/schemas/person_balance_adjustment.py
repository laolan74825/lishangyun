from datetime import datetime

from pydantic import BaseModel, Field


class PersonBalanceAdjustmentCreate(BaseModel):
    person_id: int
    amount: int = Field(..., ge=-100000000, le=100000000)
    reason: str


class PersonBalanceAdjustmentResponse(BaseModel):
    id: int
    owner_id: int
    person_id: int
    amount: int
    reason: str
    created_by: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
