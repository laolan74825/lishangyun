"""统一礼簿访问依赖。

判定顺序：owner → family → collaborator（见 docs/协作邀请功能方案.md 第 4 节）。
所有协作相关端点通过 get_guestbook_access 获取访问权，再按权限映射强制校验。
"""

from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models.collaboration_invite import CollaborationInvite
from app.models.family_group import FamilyGroup
from app.models.family_member import FamilyMember
from app.models.guestbook import Guestbook
from app.models.user import User

ROLE_OWNER = "owner"
ROLE_FAMILY = "family"
ROLE_COLLABORATOR = "collaborator"


@dataclass
class GuestbookAccess:
    guestbook: Guestbook
    role: str  # owner / family / collaborator
    permissions: str | None  # 仅 collaborator：record / reconcile / both；其余角色为 None

    def require(self, *permissions: str) -> None:
        """要求协作人员具备指定权限之一；owner / family 直接放行。"""
        if self.role != ROLE_COLLABORATOR:
            return
        if self.permissions not in permissions:
            raise HTTPException(status_code=403, detail="无权限执行此操作")


async def get_guestbook_access(
    db: AsyncSession, current_user: User, guestbook_id: int
) -> GuestbookAccess:
    """返回当前用户对指定礼簿的访问权；无权限时抛 404 / 403。"""
    result = await db.execute(select(Guestbook).where(Guestbook.id == guestbook_id))
    guestbook = result.scalar_one_or_none()
    if not guestbook or guestbook.is_deleted:
        raise HTTPException(status_code=404, detail="礼簿不存在")

    if guestbook.owner_id == current_user.id:
        return GuestbookAccess(guestbook=guestbook, role=ROLE_OWNER, permissions=None)

    # 家庭成员：礼簿所有者的家庭组 active 成员
    fam_result = await db.execute(
        select(FamilyGroup).where(FamilyGroup.owner_id == guestbook.owner_id)
    )
    family_group = fam_result.scalar_one_or_none()
    if family_group:
        member_result = await db.execute(
            select(FamilyMember).where(
                FamilyMember.family_group_id == family_group.id,
                FamilyMember.user_id == current_user.id,
                FamilyMember.status == "active",
                FamilyMember.is_active == True,
            )
        )
        if member_result.scalar_one_or_none():
            return GuestbookAccess(guestbook=guestbook, role=ROLE_FAMILY, permissions=None)

    # 协作人员：已接受且当前时间在协作时段内（懒过期检测）
    now = utcnow()
    invite_result = await db.execute(
        select(CollaborationInvite).where(
            CollaborationInvite.guestbook_id == guestbook_id,
            CollaborationInvite.invitee_id == current_user.id,
            CollaborationInvite.status == "accepted",
        )
    )
    invite = invite_result.scalar_one_or_none()
    if invite is not None:
        if invite.collaboration_end_at < now:
            invite.status = "expired"
            await db.commit()
            raise HTTPException(status_code=403, detail="协作授权已失效或已到期")
        if now < invite.collaboration_start_at:
            raise HTTPException(
                status_code=403,
                detail=f"协作尚未开始，开始时间为 {invite.collaboration_start_at.strftime('%Y-%m-%d %H:%M')}",
            )
        return GuestbookAccess(
            guestbook=guestbook, role=ROLE_COLLABORATOR, permissions=invite.permissions
        )

    raise HTTPException(status_code=403, detail="无权限访问该礼簿")
