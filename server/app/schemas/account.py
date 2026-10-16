from datetime import datetime

from pydantic import BaseModel, Field


class ProfileUpdate(BaseModel):
    nickname: str | None = Field(None, max_length=50)
    username: str | None = Field(None, max_length=50, description="新用户名，长度 3~50，唯一性在服务端校验")
    auto_lock_minutes: int | None = Field(None, ge=1, le=1440)


class ProfileResponse(BaseModel):
    id: int
    username: str
    role: str
    nickname: str | None = None
    email: str | None = None
    status: str
    security_mode: str
    auto_lock_minutes: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SecurityEmailItem(BaseModel):
    id: int
    email: str
    is_primary: bool
    is_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SecurityEmailAdd(BaseModel):
    email: str = Field(..., max_length=100)
    code: str = Field(..., max_length=10)


class AccountDeleteRequest(BaseModel):
    password: str
