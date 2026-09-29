from datetime import datetime

from pydantic import BaseModel, Field


class FamilyGroupCreate(BaseModel):
    name: str = Field(..., max_length=50)
    description: str | None = None
    invite_expires_hours: int | None = Field(None, ge=1, le=720)


class FamilyGroupUpdate(BaseModel):
    name: str | None = Field(None, max_length=50)
    description: str | None = None


class FamilyGroupResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    invite_code: str
    description: str | None = None
    invite_expires_at: datetime | None = None
    member_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JoinFamilyGroupRequest(BaseModel):
    invite_code: str
