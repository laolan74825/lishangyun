from datetime import datetime

from pydantic import BaseModel


class OperationLogResponse(BaseModel):
    id: int
    owner_id: int
    target_table: str
    target_id: int
    guestbook_id: int | None = None
    action_type: str
    operator_name: str | None = None
    client_id: str | None = None
    before_data: str | None = None
    after_data: str | None = None
    note: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
