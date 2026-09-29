from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class PendingApprovalResponse(BaseModel):
    id: int
    family_group_id: int
    submitter_id: int
    submitter_name: str | None = None
    action_type: str
    target_table: str
    target_id: int | None = None
    data_snapshot: str | None = None
    status: str
    reviewer_id: int | None = None
    review_note: str | None = None
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ApprovalSubmitRequest(BaseModel):
    family_group_id: int
    action_type: Literal["CREATE", "UPDATE", "DELETE"]
    target_table: str
    target_id: int | None = None
    data_snapshot: dict | None = None


class ApprovalActionRequest(BaseModel):
    approved: bool
    note: str | None = None
