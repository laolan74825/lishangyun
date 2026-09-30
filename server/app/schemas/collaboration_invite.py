from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

CollaborationPermission = Literal["record", "reconcile", "both"]
InviteStatus = Literal["pending", "accepted", "rejected", "revoked", "expired"]


class CollaborationInviteCreate(BaseModel):
    invitee_keyword: str = Field(..., min_length=3, max_length=255)
    guestbook_id: int
    permissions: CollaborationPermission = "record"
    collaboration_start_at: datetime
    collaboration_end_at: datetime


class CollaborationInviteAcceptRequest(BaseModel):
    invite_id: int
    invite_code: str = Field(..., min_length=6, max_length=6)


class UserSearchResult(BaseModel):
    id: int
    username: str
    email: str | None = None


class CollaborationInvitePendingResponse(BaseModel):
    """首页待处理邀请"""

    id: int
    inviter_id: int
    inviter_username: str
    guestbook_id: int
    guestbook_name: str
    permissions: str
    signal_expires_at: datetime
    created_at: datetime


class CollaborationInviteResponse(BaseModel):
    """邀请人视角的邀请详情（invite_code 仅 pending 且信号有效时返回，否则 null）"""

    id: int
    inviter_id: int
    invitee_id: int
    invitee_username: str
    invitee_email: str | None = None
    guestbook_id: int
    invite_code: str | None = None
    permissions: str
    status: str
    signal_expires_at: datetime
    collaboration_start_at: datetime
    collaboration_end_at: datetime
    accepted_at: datetime | None = None
    created_at: datetime


class CollaborationInviteAcceptedResponse(BaseModel):
    """被邀请人视角的已接受协作"""

    id: int
    inviter_id: int
    inviter_username: str
    guestbook_id: int
    guestbook_name: str
    permissions: str
    collaboration_start_at: datetime
    collaboration_end_at: datetime
    accepted_at: datetime


class AuthorizationActionLogResponse(BaseModel):
    id: int
    invite_id: int
    action_type: str
    operator_name: str | None = None
    detail: str | None = None
    created_at: datetime
