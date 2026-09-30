import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from app.core.dependencies import CurrentUser, DbSession
from app.core.time import utcnow
from app.models.authorization_action_log import AuthorizationActionLog
from app.models.collaboration_invite import CollaborationInvite
from app.models.guestbook import Guestbook
from app.models.user import User
from app.schemas.collaboration_invite import (
    AuthorizationActionLogResponse,
    CollaborationInviteAcceptRequest,
    CollaborationInviteAcceptedResponse,
    CollaborationInviteCreate,
    CollaborationInvitePendingResponse,
    CollaborationInviteResponse,
    UserSearchResult,
)

router = APIRouter(prefix="/collaboration", tags=["collaboration"])

SIGNAL_VALID_MINUTES = 10


def _to_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _log(invite_id: int, action_type: str, operator_name: str | None, detail: str) -> AuthorizationActionLog:
    return AuthorizationActionLog(
        invite_id=invite_id, action_type=action_type, operator_name=operator_name, detail=detail
    )


async def _find_user_by_keyword(db, keyword: str, exclude_user_id: int) -> User | None:
    lowered = keyword.strip().lower()
    result = await db.execute(
        select(User).where(
            User.id != exclude_user_id,
            User.is_deleted == False,
            User.status == "active",
            or_(
                func.lower(User.email) == lowered,
                func.lower(User.username) == lowered,
            ),
        )
    )
    return result.scalar_one_or_none()


def _mark_expired(invites: list[CollaborationInvite], now: datetime) -> list[CollaborationInvite]:
    """懒过期检测：pending 看信号，accepted 看协作结束时间。返回仍有效的记录。"""
    alive = []
    for invite in invites:
        if invite.status == "pending" and invite.signal_expires_at < now:
            invite.status = "expired"
        elif invite.status == "accepted" and invite.collaboration_end_at < now:
            invite.status = "expired"
        else:
            alive.append(invite)
    return alive


def _visible_code(invite: CollaborationInvite, now: datetime) -> str | None:
    """invite_code 脱敏：仅 pending 且信号有效时返回明文，否则返回 None。
    纯函数，不修改 ORM 对象（避免会话 autoflush 把 null 写回数据库）。"""
    if invite.status == "pending" and invite.signal_expires_at >= now:
        return invite.invite_code
    return None


@router.get("/search", response_model=UserSearchResult)
async def search_user(
    db: DbSession,
    current_user: CurrentUser,
    keyword: str = Query(..., min_length=3, max_length=255),
):
    user = await _find_user_by_keyword(db, keyword, current_user.id)
    if not user:
        raise HTTPException(404, "未找到该邮箱或用户名对应的用户")
    return UserSearchResult(id=user.id, username=user.username, email=user.email)


@router.post("/invites", response_model=dict)
async def create_invite(body: CollaborationInviteCreate, db: DbSession, current_user: CurrentUser):
    invitee = await _find_user_by_keyword(db, body.invitee_keyword, current_user.id)
    if not invitee:
        raise HTTPException(404, "未找到该邮箱或用户名对应的用户")

    result = await db.execute(
        select(Guestbook).where(
            Guestbook.id == body.guestbook_id,
            Guestbook.owner_id == current_user.id,
            Guestbook.is_deleted == False,
        )
    )
    guestbook = result.scalar_one_or_none()
    if not guestbook:
        raise HTTPException(404, "礼簿不存在")

    start_at = _to_naive_utc(body.collaboration_start_at)
    end_at = _to_naive_utc(body.collaboration_end_at)
    now = utcnow()
    if end_at <= start_at:
        raise HTTPException(400, "协作结束时间必须晚于开始时间")
    if start_at < now:
        raise HTTPException(400, "协作开始时间不能早于当前时间")

    dup_result = await db.execute(
        select(CollaborationInvite).where(
            CollaborationInvite.inviter_id == current_user.id,
            CollaborationInvite.invitee_id == invitee.id,
            CollaborationInvite.guestbook_id == body.guestbook_id,
            CollaborationInvite.status == "pending",
        )
    )
    if dup_result.scalar_one_or_none():
        raise HTTPException(409, "邀请已发送，请等待对方处理")

    active_result = await db.execute(
        select(CollaborationInvite).where(
            CollaborationInvite.inviter_id == current_user.id,
            CollaborationInvite.invitee_id == invitee.id,
            CollaborationInvite.guestbook_id == body.guestbook_id,
            CollaborationInvite.status == "accepted",
            CollaborationInvite.collaboration_end_at > now,
        )
    )
    if active_result.scalar_one_or_none():
        raise HTTPException(409, "对方已在协作中，如需调整请先撤销原授权")

    invite = CollaborationInvite(
        inviter_id=current_user.id,
        invitee_id=invitee.id,
        guestbook_id=body.guestbook_id,
        invite_code=str(secrets.randbelow(1000000)).zfill(6),
        permissions=body.permissions,
        status="pending",
        signal_expires_at=now + timedelta(minutes=SIGNAL_VALID_MINUTES),
        collaboration_start_at=start_at,
        collaboration_end_at=end_at,
    )
    db.add(invite)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "邀请已发送，请等待对方处理")

    operator = current_user.nickname or current_user.username
    db.add(_log(invite.id, "SEND", operator,
                f"发送协作邀请，被邀请人：{invitee.username}，权限：{body.permissions}，"
                f"协作时段：{start_at:%Y-%m-%d %H:%M} ~ {end_at:%Y-%m-%d %H:%M}"))
    await db.commit()

    return {
        "id": invite.id,
        "invite_code": invite.invite_code,
        "invitee_email": invitee.email,
        "signal_expires_at": invite.signal_expires_at,
        "collaboration_start_at": invite.collaboration_start_at,
        "collaboration_end_at": invite.collaboration_end_at,
    }


@router.get("/invites/pending", response_model=list[CollaborationInvitePendingResponse])
async def list_pending_invites(db: DbSession, current_user: CurrentUser):
    now = utcnow()
    result = await db.execute(
        select(CollaborationInvite)
        .where(
            CollaborationInvite.invitee_id == current_user.id,
            CollaborationInvite.status == "pending",
        )
        .order_by(CollaborationInvite.created_at.desc())
    )
    invites = list(result.scalars().all())
    alive = _mark_expired(invites, now)
    if len(alive) != len(invites):
        await db.commit()

    items = []
    for invite in alive:
        inviter = await db.get(User, invite.inviter_id)
        guestbook = await db.get(Guestbook, invite.guestbook_id)
        items.append(CollaborationInvitePendingResponse(
            id=invite.id,
            inviter_id=invite.inviter_id,
            inviter_username=(inviter.nickname or inviter.username) if inviter else "未知用户",
            guestbook_id=invite.guestbook_id,
            guestbook_name=guestbook.name if guestbook else "未知礼簿",
            permissions=invite.permissions,
            signal_expires_at=invite.signal_expires_at,
            created_at=invite.created_at,
        ))
    return items


@router.post("/invites/accept", response_model=dict)
async def accept_invite(body: CollaborationInviteAcceptRequest, db: DbSession, current_user: CurrentUser):
    result = await db.execute(
        select(CollaborationInvite).where(
            CollaborationInvite.id == body.invite_id,
            CollaborationInvite.invitee_id == current_user.id,
        )
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(404, "邀请不存在")

    now = utcnow()
    if invite.status != "pending":
        raise HTTPException(400, f"邀请状态为 {invite.status}，无法接受")
    if invite.signal_expires_at < now:
        invite.status = "expired"
        await db.commit()
        raise HTTPException(400, "邀请信号已过期，请对方重新发送")
    if invite.invite_code != body.invite_code:
        raise HTTPException(400, "邀请码不正确")

    invite.status = "accepted"
    invite.accepted_at = now

    operator = current_user.nickname or current_user.username
    db.add(_log(invite.id, "ACCEPT", operator, f"接受协作邀请（礼簿 ID：{invite.guestbook_id}）"))
    await db.commit()

    return {
        "message": "已接受协作邀请",
        "guestbook_id": invite.guestbook_id,
        "permissions": invite.permissions,
        "collaboration_start_at": invite.collaboration_start_at,
        "collaboration_end_at": invite.collaboration_end_at,
    }


@router.post("/invites/{invite_id}/reject", response_model=dict)
async def reject_invite(invite_id: int, db: DbSession, current_user: CurrentUser):
    result = await db.execute(
        select(CollaborationInvite).where(
            CollaborationInvite.id == invite_id,
            CollaborationInvite.invitee_id == current_user.id,
        )
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(404, "邀请不存在")
    if invite.status != "pending":
        raise HTTPException(400, f"邀请状态为 {invite.status}，无法拒绝")

    invite.status = "rejected"
    operator = current_user.nickname or current_user.username
    db.add(_log(invite.id, "REJECT", operator, "拒绝协作邀请"))
    await db.commit()
    return {"message": "邀请已拒绝"}


@router.get("/invites", response_model=list[CollaborationInviteResponse])
async def list_invites(
    db: DbSession,
    current_user: CurrentUser,
    guestbook_id: int | None = None,
    status: str | None = None,
):
    now = utcnow()
    stmt = select(CollaborationInvite).where(
        CollaborationInvite.inviter_id == current_user.id
    ).order_by(CollaborationInvite.created_at.desc())
    if guestbook_id:
        stmt = stmt.where(CollaborationInvite.guestbook_id == guestbook_id)
    if status == "active":
        stmt = stmt.where(CollaborationInvite.status.in_(["pending", "accepted"]))
    elif status:
        stmt = stmt.where(CollaborationInvite.status == status)

    result = await db.execute(stmt)
    invites = list(result.scalars().all())
    total = len(invites)
    alive = _mark_expired(invites, now)
    if len(alive) != total:
        await db.commit()

    items = []
    for invite in invites:
        invitee = await db.get(User, invite.invitee_id)
        items.append(CollaborationInviteResponse(
            id=invite.id,
            inviter_id=invite.inviter_id,
            invitee_id=invite.invitee_id,
            invitee_username=invitee.username if invitee else "未知用户",
            invitee_email=invitee.email if invitee else None,
            guestbook_id=invite.guestbook_id,
            invite_code=_visible_code(invite, now),
            permissions=invite.permissions,
            status=invite.status,
            signal_expires_at=invite.signal_expires_at,
            collaboration_start_at=invite.collaboration_start_at,
            collaboration_end_at=invite.collaboration_end_at,
            accepted_at=invite.accepted_at,
            created_at=invite.created_at,
        ))
    return items


@router.get("/invites/accepted", response_model=list[CollaborationInviteAcceptedResponse])
async def list_accepted_collaborations(db: DbSession, current_user: CurrentUser):
    now = utcnow()
    result = await db.execute(
        select(CollaborationInvite)
        .where(
            CollaborationInvite.invitee_id == current_user.id,
            CollaborationInvite.status == "accepted",
        )
        .order_by(CollaborationInvite.accepted_at.desc())
    )
    invites = list(result.scalars().all())
    total = len(invites)
    alive = _mark_expired(invites, now)
    if len(alive) != total:
        await db.commit()

    items = []
    for invite in alive:
        inviter = await db.get(User, invite.inviter_id)
        guestbook = await db.get(Guestbook, invite.guestbook_id)
        items.append(CollaborationInviteAcceptedResponse(
            id=invite.id,
            inviter_id=invite.inviter_id,
            inviter_username=(inviter.nickname or inviter.username) if inviter else "未知用户",
            guestbook_id=invite.guestbook_id,
            guestbook_name=guestbook.name if guestbook else "未知礼簿",
            permissions=invite.permissions,
            collaboration_start_at=invite.collaboration_start_at,
            collaboration_end_at=invite.collaboration_end_at,
            accepted_at=invite.accepted_at,
        ))
    return items


@router.post("/invites/{invite_id}/revoke", response_model=dict)
async def revoke_invite(invite_id: int, db: DbSession, current_user: CurrentUser):
    result = await db.execute(
        select(CollaborationInvite).where(
            CollaborationInvite.id == invite_id,
            CollaborationInvite.inviter_id == current_user.id,
        )
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(404, "邀请不存在")
    if invite.status not in ("pending", "accepted"):
        raise HTTPException(400, f"邀请状态为 {invite.status}，无法撤销")

    old_status = invite.status
    invite.status = "revoked"
    operator = current_user.nickname or current_user.username
    action = "取消邀请" if old_status == "pending" else "撤销授权"
    db.add(_log(invite.id, "REVOKE", operator, f"{action}（原状态：{old_status}）"))
    await db.commit()

    return {"message": "邀请已撤销" if old_status == "pending" else "授权已撤销"}


@router.get("/invites/{invite_id}/logs", response_model=list[AuthorizationActionLogResponse])
async def list_invite_logs(invite_id: int, db: DbSession, current_user: CurrentUser):
    result = await db.execute(
        select(CollaborationInvite).where(
            CollaborationInvite.id == invite_id,
            CollaborationInvite.inviter_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "邀请不存在")

    logs_result = await db.execute(
        select(AuthorizationActionLog)
        .where(AuthorizationActionLog.invite_id == invite_id)
        .order_by(AuthorizationActionLog.created_at.desc())
        .limit(100)
    )
    return logs_result.scalars().all()
