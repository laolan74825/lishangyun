from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

AuthorizationPermission = Literal["record", "reconcile", "both"]
AuthorizationCodeStatus = Literal["active", "bound", "revoked", "expired"]


class AuthorizationCodeCreate(BaseModel):
    guestbook_id: int
    grantee_name: str = Field(..., max_length=50)
    grantee_account_id: int
    permissions: AuthorizationPermission = "record"
    expires_at: datetime


class AuthorizationCodeBindRequest(BaseModel):
    code: str
    grantor_account_id: int


class AuthorizationCodeResponse(BaseModel):
    id: int
    owner_id: int
    guestbook_id: int
    code: str
    grantee_name: str
    grantee_account_id: int
    grantee_user_id: int | None = None
    permissions: str
    status: str
    expires_at: datetime
    bound_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuthorizationActionLogResponse(BaseModel):
    id: int
    authorization_code_id: int
    action_type: str
    operator_name: str | None = None
    client_id: str | None = None
    detail: str | None = None
    record_id: int | None = None
    grantee_user_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
