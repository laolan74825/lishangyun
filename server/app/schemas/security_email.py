from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class SecurityEmailCreate(BaseModel):
    email: str = Field(..., max_length=100)


class SecurityEmailResponse(BaseModel):
    id: int
    user_id: int
    email: str
    is_verified: bool
    is_primary: bool
    verified_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class VerifyEmailRequest(BaseModel):
    code: str
