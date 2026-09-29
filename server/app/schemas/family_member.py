from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

FamilyMemberRole = Literal["owner", "admin", "member"]
FamilyMemberStatus = Literal["pending", "active", "removed"]


class FamilyMemberResponse(BaseModel):
    id: int
    family_group_id: int
    user_id: int
    role: str
    status: str
    display_name: str | None = None
    is_active: bool = True
    username: str | None = None
    nickname: str | None = None
    joined_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UpdateMemberRoleRequest(BaseModel):
    role: FamilyMemberRole


class UpdateMemberActiveRequest(BaseModel):
    is_active: bool
