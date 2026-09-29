import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, or_, select

from app.core.dependencies import CurrentUser, DbSession
from app.core.helpers import paginate_query, write_audit_log
from app.core.time import utcnow
from app.models.daily_record import DailyRecord
from app.models.family_group import FamilyGroup
from app.models.family_member import FamilyMember
from app.models.gb_record import GbRecord
from app.models.notification import Notification
from app.models.person import Person
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.family_group import FamilyGroupCreate, FamilyGroupResponse, FamilyGroupUpdate, JoinFamilyGroupRequest
from app.schemas.family_member import FamilyMemberResponse, UpdateMemberActiveRequest, UpdateMemberRoleRequest

router = APIRouter(prefix="/family", tags=["family"])


def _generate_invite_code() -> str:
    return secrets.token_urlsafe(12)[:12].upper()


async def _get_group_as_owner(db, group_id: int, user_id: int) -> FamilyGroup:
    result = await db.execute(select(FamilyGroup).where(FamilyGroup.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "家庭组不存在")
    if group.owner_id != user_id:
        raise HTTPException(403, "仅主账户可执行此操作")
    return group


async def _get_group_as_member(db, group_id: int, user_id: int) -> tuple[FamilyGroup, FamilyMember]:
    result = await db.execute(select(FamilyGroup).where(FamilyGroup.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "家庭组不存在")

    member_result = await db.execute(
        select(FamilyMember).where(
            FamilyMember.family_group_id == group_id,
            FamilyMember.user_id == user_id,
            FamilyMember.status == "active",
            FamilyMember.is_active == True,
        )
    )
    member = member_result.scalar_one_or_none()
    if not member and group.owner_id != user_id:
        raise HTTPException(403, "您不是该家庭组成员")
    return group, member


async def _is_owner(db, group_id: int, user_id: int) -> bool:
    result = await db.execute(select(FamilyGroup).where(FamilyGroup.id == group_id))
    group = result.scalar_one_or_none()
    return group is not None and group.owner_id == user_id


async def _member_count(db, group_id: int) -> int:
    result = await db.execute(
        select(func.count(FamilyMember.id)).where(
            FamilyMember.family_group_id == group_id,
            FamilyMember.status == "active",
        )
    )
    return result.scalar_one()


# ==================== 家庭组 CRUD ====================

@router.post("/groups", response_model=dict)
async def create_group(body: FamilyGroupCreate, db: DbSession, current_user: CurrentUser):
    existing = await db.execute(
        select(FamilyGroup).where(FamilyGroup.owner_id == current_user.id)
    )
    if existing.scalars().first():
        raise HTTPException(400, "您已创建过家庭组")

    invite_expires_at = None
    if body.invite_expires_hours:
        invite_expires_at = utcnow() + timedelta(hours=body.invite_expires_hours)

    group = FamilyGroup(
        owner_id=current_user.id,
        name=body.name,
        description=body.description,
        invite_code=_generate_invite_code(),
        invite_expires_at=invite_expires_at,
    )
    db.add(group)
    await db.flush()

    owner_member = FamilyMember(
        family_group_id=group.id,
        user_id=current_user.id,
        role="owner",
        status="active",
        display_name=current_user.nickname or current_user.username,
        joined_at=utcnow(),
    )
    db.add(owner_member)

    write_audit_log(db, current_user.id, "family_group", group.id, "CREATE",
                    operator_name=current_user.username, after=body.model_dump())
    await db.commit()
    return {"id": group.id, "invite_code": group.invite_code}


@router.get("/groups", response_model=list[FamilyGroupResponse])
async def list_my_groups(current_user: CurrentUser, db: DbSession):
    owned_result = await db.execute(
        select(FamilyGroup).where(FamilyGroup.owner_id == current_user.id)
    )
    owned = list(owned_result.scalars().all())

    membership_result = await db.execute(
        select(FamilyGroup)
        .join(FamilyMember, FamilyMember.family_group_id == FamilyGroup.id)
        .where(
            FamilyMember.user_id == current_user.id,
            FamilyMember.status == "active",
            FamilyMember.is_active == True,
        )
    )
    joined = list(membership_result.scalars().all())

    groups = []
    for g in owned + joined:
        count = await _member_count(db, g.id)
        groups.append(FamilyGroupResponse(
            id=g.id, owner_id=g.owner_id, name=g.name, invite_code=g.invite_code,
            description=g.description, invite_expires_at=g.invite_expires_at,
            member_count=count, created_at=g.created_at, updated_at=g.updated_at,
        ))
    return groups


@router.get("/groups/{group_id}", response_model=FamilyGroupResponse)
async def get_group(group_id: int, current_user: CurrentUser, db: DbSession):
    group, _ = await _get_group_as_member(db, group_id, current_user.id)
    count = await _member_count(db, group_id)
    return FamilyGroupResponse(
        id=group.id, owner_id=group.owner_id, name=group.name, invite_code=group.invite_code,
        description=group.description, invite_expires_at=group.invite_expires_at,
        member_count=count, created_at=group.created_at, updated_at=group.updated_at,
    )


@router.put("/groups/{group_id}")
async def update_group(group_id: int, body: FamilyGroupUpdate, db: DbSession, current_user: CurrentUser):
    group = await _get_group_as_owner(db, group_id, current_user.id)
    before = {c.name: getattr(group, c.name) for c in FamilyGroup.__table__.columns}
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(group, k, v)
    group.updated_at = utcnow()
    write_audit_log(db, current_user.id, "family_group", group.id, "UPDATE",
                    operator_name=current_user.username, before=before, after=body.model_dump(exclude_unset=True))
    await db.commit()
    return {"message": "已更新"}


@router.delete("/groups/{group_id}")
async def dissolve_group(group_id: int, db: DbSession, current_user: CurrentUser):
    group = await _get_group_as_owner(db, group_id, current_user.id)

    members_result = await db.execute(
        select(FamilyMember).where(
            FamilyMember.family_group_id == group_id,
            FamilyMember.status == "active",
        )
    )
    for m in members_result.scalars().all():
        m.status = "removed"

    before = {c.name: getattr(group, c.name) for c in FamilyGroup.__table__.columns}
    write_audit_log(db, current_user.id, "family_group", group.id, "DELETE",
                    operator_name=current_user.username, before=before)
    await db.delete(group)
    await db.commit()
    return {"message": "家庭组已解散"}


# ==================== 邀请码 ====================

@router.post("/groups/{group_id}/refresh-invite")
async def refresh_invite_code(group_id: int, db: DbSession, current_user: CurrentUser):
    group = await _get_group_as_owner(db, group_id, current_user.id)
    group.invite_code = _generate_invite_code()
    group.updated_at = utcnow()
    await db.commit()
    return {"invite_code": group.invite_code, "invite_expires_at": group.invite_expires_at}


@router.post("/join")
async def join_group(body: JoinFamilyGroupRequest, db: DbSession, current_user: CurrentUser):
    result = await db.execute(
        select(FamilyGroup).where(FamilyGroup.invite_code == body.invite_code)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "邀请码无效")

    if group.owner_id == current_user.id:
        raise HTTPException(400, "不能加入自己创建的家庭组")

    if group.invite_expires_at and group.invite_expires_at < utcnow():
        raise HTTPException(400, "邀请码已过期")

    existing = await db.execute(
        select(FamilyMember).where(
            FamilyMember.family_group_id == group.id,
            FamilyMember.user_id == current_user.id,
        )
    )
    member = existing.scalar_one_or_none()
    if member:
        if member.status == "active" and member.is_active:
            raise HTTPException(400, "您已是该家庭组成员")
        if member.status == "removed":
            raise HTTPException(400, "您已被移除，无法重新加入")

    if not member:
        member = FamilyMember(
            family_group_id=group.id,
            user_id=current_user.id,
            role="member",
            status="active",
            display_name=current_user.nickname or current_user.username,
            joined_at=utcnow(),
        )
        db.add(member)
    else:
        member.status = "active"
        member.is_active = True
        member.joined_at = utcnow()

    write_audit_log(db, group.owner_id, "family_member", member.id or 0, "CREATE",
                    operator_name=current_user.username,
                    after={"family_group_id": group.id, "user_id": current_user.id})
    await db.flush()

    db.add(Notification(
        user_id=group.owner_id,
        type="family_member_joined",
        title="新成员加入",
        content=f"{current_user.nickname or current_user.username} 加入了家庭组「{group.name}」",
        related_type="family_member",
        related_id=member.id,
    ))

    await db.commit()
    return {"message": "已加入家庭组", "group_id": group.id}


@router.post("/groups/{group_id}/leave")
async def leave_group(group_id: int, db: DbSession, current_user: CurrentUser):
    if await _is_owner(db, group_id, current_user.id):
        raise HTTPException(400, "主账户不能退出，请先解散家庭组")

    result = await db.execute(
        select(FamilyMember).where(
            FamilyMember.family_group_id == group_id,
            FamilyMember.user_id == current_user.id,
            FamilyMember.status == "active",
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(404, "您不是该家庭组成员")

    member.status = "removed"
    member.is_active = False
    await db.commit()
    return {"message": "已退出家庭组"}


# ==================== 成员管理 ====================

@router.get("/groups/{group_id}/members", response_model=list[FamilyMemberResponse])
async def list_members(group_id: int, current_user: CurrentUser, db: DbSession):
    await _get_group_as_member(db, group_id, current_user.id)

    result = await db.execute(
        select(FamilyMember, User.username, User.nickname)
        .join(User, User.id == FamilyMember.user_id)
        .where(FamilyMember.family_group_id == group_id)
        .order_by(FamilyMember.role.asc(), FamilyMember.joined_at.asc())
    )
    rows = result.all()
    members = []
    for m, username, nickname in rows:
        members.append(FamilyMemberResponse(
            id=m.id, family_group_id=m.family_group_id, user_id=m.user_id,
            role=m.role, status=m.status, display_name=m.display_name,
            is_active=m.is_active, username=username, nickname=nickname,
            joined_at=m.joined_at, created_at=m.created_at,
        ))
    return members


@router.put("/groups/{group_id}/members/{member_id}/role")
async def update_member_role(
    group_id: int, member_id: int, body: UpdateMemberRoleRequest,
    db: DbSession, current_user: CurrentUser,
):
    await _get_group_as_owner(db, group_id, current_user.id)

    result = await db.execute(
        select(FamilyMember).where(
            FamilyMember.id == member_id,
            FamilyMember.family_group_id == group_id,
            FamilyMember.status == "active",
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(404, "成员不存在")
    if member.role == "owner":
        raise HTTPException(400, "不能修改主账户角色")

    member.role = body.role
    await db.commit()
    return {"message": "角色已更新"}


@router.put("/groups/{group_id}/members/{member_id}/active")
async def toggle_member_active(
    group_id: int, member_id: int, body: UpdateMemberActiveRequest,
    db: DbSession, current_user: CurrentUser,
):
    await _get_group_as_owner(db, group_id, current_user.id)

    result = await db.execute(
        select(FamilyMember).where(
            FamilyMember.id == member_id,
            FamilyMember.family_group_id == group_id,
            FamilyMember.status == "active",
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(404, "成员不存在")
    if member.role == "owner":
        raise HTTPException(400, "不能禁用主账户")

    member.is_active = body.is_active
    await db.commit()
    return {"message": "已更新"}


@router.delete("/groups/{group_id}/members/{member_id}")
async def remove_member(group_id: int, member_id: int, db: DbSession, current_user: CurrentUser):
    await _get_group_as_owner(db, group_id, current_user.id)

    result = await db.execute(
        select(FamilyMember).where(
            FamilyMember.id == member_id,
            FamilyMember.family_group_id == group_id,
            FamilyMember.status == "active",
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(404, "成员不存在")
    if member.role == "owner":
        raise HTTPException(400, "不能移除主账户")

    member.status = "removed"
    member.is_active = False
    await db.commit()
    return {"message": "成员已移除"}


# ==================== 家庭数据共享视图 ====================

async def _get_family_member_ids(db, group_id: int, current_user_id: int) -> list[int]:
    """获取家庭组中所有活跃成员的 user_id 列表（含当前用户）"""
    group_result = await db.execute(select(FamilyGroup).where(FamilyGroup.id == group_id))
    group = group_result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "家庭组不存在")

    is_owner = group.owner_id == current_user_id
    if not is_owner:
        member_result = await db.execute(
            select(FamilyMember).where(
                FamilyMember.family_group_id == group_id,
                FamilyMember.user_id == current_user_id,
                FamilyMember.status == "active",
                FamilyMember.is_active == True,
            )
        )
        if not member_result.scalar_one_or_none():
            raise HTTPException(403, "您不是该家庭组成员")

    members_result = await db.execute(
        select(FamilyMember.user_id).where(
            FamilyMember.family_group_id == group_id,
            FamilyMember.status == "active",
            FamilyMember.is_active == True,
        )
    )
    return list(members_result.scalars().all())


@router.get("/groups/{group_id}/shared/persons")
async def shared_persons(
    group_id: int, current_user: CurrentUser, db: DbSession,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
):
    member_ids = await _get_family_member_ids(db, group_id, current_user.id)

    stmt = (
        select(Person)
        .where(
            Person.owner_id.in_(member_ids),
            Person.is_deleted == False,
            or_(Person.is_private == False, Person.owner_id == current_user.id),
        )
        .order_by(Person.name.asc())
    )
    items, pagination = await paginate_query(db, stmt, page, page_size)
    return {"items": items, "pagination": pagination}


@router.get("/groups/{group_id}/shared/daily-records")
async def shared_daily_records(
    group_id: int, current_user: CurrentUser, db: DbSession,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
):
    member_ids = await _get_family_member_ids(db, group_id, current_user.id)

    stmt = (
        select(DailyRecord)
        .where(
            DailyRecord.owner_id.in_(member_ids),
            DailyRecord.is_deleted == False,
            or_(DailyRecord.is_private == False, DailyRecord.owner_id == current_user.id),
        )
        .order_by(DailyRecord.event_date.desc())
    )
    items, pagination = await paginate_query(db, stmt, page, page_size)
    return {"items": items, "pagination": pagination}


@router.get("/groups/{group_id}/shared/stats")
async def shared_stats(group_id: int, current_user: CurrentUser, db: DbSession):
    member_ids = await _get_family_member_ids(db, group_id, current_user.id)

    person_count = (await db.execute(
        select(func.count(Person.id)).where(
            Person.owner_id.in_(member_ids), Person.is_deleted == False,
            or_(Person.is_private == False, Person.owner_id == current_user.id),
        )
    )).scalar_one()

    daily_in = (await db.execute(
        select(func.coalesce(func.sum(DailyRecord.amount), 0)).where(
            DailyRecord.owner_id.in_(member_ids),
            DailyRecord.type == "in",
            DailyRecord.is_deleted == False,
            or_(DailyRecord.is_private == False, DailyRecord.owner_id == current_user.id),
        )
    )).scalar_one()

    daily_out = (await db.execute(
        select(func.coalesce(func.sum(DailyRecord.amount), 0)).where(
            DailyRecord.owner_id.in_(member_ids),
            DailyRecord.type == "out",
            DailyRecord.is_deleted == False,
            or_(DailyRecord.is_private == False, DailyRecord.owner_id == current_user.id),
        )
    )).scalar_one()

    return {
        "person_count": person_count,
        "total_received": daily_in,
        "total_sent": daily_out,
        "member_count": len(member_ids),
    }
