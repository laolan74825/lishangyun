from datetime import datetime

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: int
    user_id: int
    type: str
    title: str
    content: str | None = None
    is_read: bool
    related_type: str | None = None
    related_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationCountResponse(BaseModel):
    unread_count: int
