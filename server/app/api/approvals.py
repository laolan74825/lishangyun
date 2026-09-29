import json
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession
from app.core.helpers import paginate_query, write_audit_log
from app.core.time import utcnow
from app.models.daily_record import DailyRecord
from app.models.family_group import FamilyGroup
from app.models.family_member import FamilyMember
from app.models.gb_record import GbRecord
from app.models.notification import Notification
from app.models.pending_approval import PendingApproval
from app.models.person import Person
from app.models.user import User
from app.schemas.pending_approval import ApprovalActionRequest, ApprovalSubmitRequest, PendingApprovalResponse

router = APIRouter(prefix="/approvals", tags=["approvals"])

TABLE_MODEL_MAP = {
    "daily_record": DailyRecord,
    "daily_records": DailyRecord,
    "person": Person,
    "persons": Person,
    "gb_record": GbRecord,
    "gb_records": GbRecord,
}


def _convert_date_values(data: dict, model: type) -> dict:
    from sqlalchemy import Date, DateTime
    converted = data.copy()
    for col in model.__table__.columns:
        if col.name not in converted:
            continue
        val = converted[col.name]
        if not isinstance(val, str):
            continue
        if isinstance(col.type, DateTime):
            try:
                converted[col.name] = datetime.fromisoformat(val)
            except (ValueError, TypeError):
                pass
        elif isinstance(col.type, Date):
            try:
                converted[col.name] = date.fromisoformat(val)
            except (ValueError, TypeError):
                pass
    return converted


async def _get_group_member(db: DbSession, group_id: int, user_id: int) -> tuple[FamilyGroup, FamilyMember | None]:
    result = await db.execute(select(FamilyGroup).where(FamilyGroup.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "家庭组不存在")

    if group.owner_id == user_id:
        return group, None

    member_result = await db.execute(
        select(FamilyMember).where(
            FamilyMember.family_group_id == group_id,
            FamilyMember.user_id == user_id,
            FamilyMember.status == "active",
            FamilyMember.is_active == True,
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(403, "您不是该家庭组成员")
    return group, member


async def _is_owner_or_admin(db: DbSession, group_id: int, user_id: int) -> bool:
    group_result = await db.execute(select(FamilyGroup).where(FamilyGroup.id == group_id))
    group = group_result.scalar_one_or_none()
    if group and group.owner_id == user_id:
        return True
    member_result = await db.execute(
        select(FamilyMember).where(
            FamilyMember.family_group_id == group_id,
            FamilyMember.user_id == user_id,
            FamilyMember.status == "active",
            FamilyMember.is_active == True,
            FamilyMember.role.in_(["owner", "admin"]),
        )
    )
    return member_result.scalar_one_or_none() is not None


def _apply_snapshot_create(data: dict, model: type, owner_id: int) -> dict:
    clean = {k: v for k, v in data.items() if k not in ("id",)}
    clean = _convert_date_values(clean, model)
    clean["owner_id"] = owner_id
    return clean


def _apply_snapshot_update(data: dict, model: type) -> dict:
    clean = {k: v for k, v in data.items() if k not in ("id", "owner_id")}
    clean = _convert_date_values(clean, model)
    return clean


async def _execute_approval(db: DbSession, approval: PendingApproval) -> None:
    snapshot = json.loads(approval.data_snapshot) if approval.data_snapshot else {}
    target_table = snapshot.get("target_table", approval.target_table)
    model = TABLE_MODEL_MAP.get(target_table)
    if not model:
        raise HTTPException(400, f"不支持的目标表: {target_table}")

    action = approval.action_type

    if action == "CREATE":
        data = snapshot.get("data", {})
        clean = _apply_snapshot_create(data, model, approval.submitter_id)
        if model in (DailyRecord, GbRecord) and "uuid" not in clean:
            clean["uuid"] = str(uuid.uuid4())
        record = model(**clean)
        db.add(record)
        await db.flush()
        approval.target_id = record.id
        write_audit_log(
            db, owner_id=approval.submitter_id,
            target_table=target_table.rstrip("s"),
            target_id=record.id, action_type="CREATE",
            note=f"Approved by reviewer (approval #{approval.id})",
        )

    elif action == "UPDATE":
        target_id = snapshot.get("target_id") or approval.target_id
        if not target_id:
            raise HTTPException(400, "UPDATE 操作缺少 target_id")
        result = await db.execute(
            select(model).where(model.id == target_id, model.owner_id == approval.submitter_id)
        )
        record = result.scalar_one_or_none()
        if not record:
            raise HTTPException(404, "目标记录不存在")
        after_data = snapshot.get("after", {})
        clean = _apply_snapshot_update(after_data, model)
        if hasattr(record, "sync_version"):
            clean["sync_version"] = record.sync_version + 1
        for k, v in clean.items():
            setattr(record, k, v)
        record.updated_at = utcnow()
        write_audit_log(
            db, owner_id=approval.submitter_id,
            target_table=target_table.rstrip("s"),
            target_id=target_id, action_type="UPDATE",
            before=snapshot.get("before"), after=after_data,
            note=f"Approved by reviewer (approval #{approval.id})",
        )

    elif action == "DELETE":
        target_id = snapshot.get("target_id") or approval.target_id
        if not target_id:
            raise HTTPException(400, "DELETE 操作缺少 target_id")
        result = await db.execute(
            select(model).where(model.id == target_id, model.owner_id == approval.submitter_id)
        )
        record = result.scalar_one_or_none()
        if not record:
            raise HTTPException(404, "目标记录不存在")
        record.is_deleted = True
        record.deleted_at = utcnow()
        if hasattr(record, "sync_version"):
            record.sync_version = record.sync_version + 1
        write_audit_log(
            db, owner_id=approval.submitter_id,
            target_table=target_table.rstrip("s"),
            target_id=target_id, action_type="DELETE",
            before=snapshot.get("before"),
            note=f"Approved by reviewer (approval #{approval.id})",
        )
    else:
        raise HTTPException(400, f"不支持的操作类型: {action}")


def _create_notification(
    db: DbSession, user_id: int, type: str, title: str,
    content: str | None = None, related_type: str | None = None, related_id: int | None = None,
) -> None:
    db.add(Notification(
        user_id=user_id, type=type, title=title, content=content,
        related_type=related_type, related_id=related_id,
    ))


# ==================== 提交审批 ====================

@router.post("/", response_model=dict)
async def submit_approval(body: ApprovalSubmitRequest, db: DbSession, current_user: CurrentUser):
    group, member = await _get_group_member(db, body.family_group_id, current_user.id)

    if group.owner_id == current_user.id:
        raise HTTPException(400, "主账户无需提交审批")

    if member and member.role in ("owner", "admin"):
        raise HTTPException(400, "管理员无需提交审批")

    expires_at = utcnow() + timedelta(days=30)

    approval = PendingApproval(
        family_group_id=body.family_group_id,
        submitter_id=current_user.id,
        action_type=body.action_type,
        target_table=body.target_table,
        target_id=body.target_id,
        data_snapshot=json.dumps(body.data_snapshot, ensure_ascii=False, default=str) if body.data_snapshot else None,
        status="pending",
        expires_at=expires_at,
    )
    db.add(approval)

    notification = Notification(
        user_id=group.owner_id,
        type="approval_submitted",
        title="新的审批请求",
        content=f"{current_user.nickname or current_user.username} 提交了{body.action_type}操作审批",
        related_type="pending_approval",
    )
    db.add(notification)

    await db.flush()

    notification.related_id = approval.id

    write_audit_log(
        db, owner_id=current_user.id,
        target_table="pending_approval", target_id=approval.id,
        action_type="CREATE",
        note=f"Submit approval for {body.action_type} on {body.target_table}",
    )

    await db.commit()
    return {"id": approval.id, "message": "审批请求已提交"}


# ==================== 审批队列查询 ====================

@router.get("/", response_model=list[PendingApprovalResponse])
async def list_approvals(
    current_user: CurrentUser, db: DbSession,
    group_id: int | None = None,
    status: str | None = None,
    submitter_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    member_groups_result = await db.execute(
        select(FamilyGroup.id).where(FamilyGroup.owner_id == current_user.id)
    )
    owned_group_ids = list(member_groups_result.scalars().all())

    membership_result = await db.execute(
        select(FamilyMember.family_group_id).where(
            FamilyMember.user_id == current_user.id,
            FamilyMember.status == "active",
            FamilyMember.is_active == True,
        )
    )
    member_group_ids = list(membership_result.scalars().all())
    all_group_ids = list(set(owned_group_ids + member_group_ids))

    if not all_group_ids:
        return []

    stmt = select(PendingApproval).where(PendingApproval.family_group_id.in_(all_group_ids))

    if group_id:
        if group_id not in all_group_ids:
            raise HTTPException(403, "无权查看该家庭组审批")
        stmt = stmt.where(PendingApproval.family_group_id == group_id)
    if status:
        stmt = stmt.where(PendingApproval.status == status)
    if submitter_id:
        stmt = stmt.where(PendingApproval.submitter_id == submitter_id)

    stmt = stmt.order_by(PendingApproval.created_at.desc())
    items, _ = await paginate_query(db, stmt, page, page_size)

    user_ids = list(set(a.submitter_id for a in items))
    user_map: dict[int, str] = {}
    if user_ids:
        users_result = await db.execute(select(User.id, User.nickname, User.username).where(User.id.in_(user_ids)))
        for uid, nickname, username in users_result.all():
            user_map[uid] = nickname or username or ""

    result = []
    for a in items:
        resp = PendingApprovalResponse(
            id=a.id, family_group_id=a.family_group_id, submitter_id=a.submitter_id,
            submitter_name=user_map.get(a.submitter_id),
            action_type=a.action_type, target_table=a.target_table,
            target_id=a.target_id, data_snapshot=a.data_snapshot,
            status=a.status, reviewer_id=a.reviewer_id, review_note=a.review_note,
            expires_at=a.expires_at, created_at=a.created_at, updated_at=a.updated_at,
        )
        result.append(resp)
    return result


@router.get("/{approval_id}", response_model=PendingApprovalResponse)
async def get_approval(approval_id: int, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(PendingApproval).where(PendingApproval.id == approval_id)
    )
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(404, "审批记录不存在")

    member_groups_result = await db.execute(
        select(FamilyGroup.id).where(FamilyGroup.owner_id == current_user.id)
    )
    owned = list(member_groups_result.scalars().all())
    membership_result = await db.execute(
        select(FamilyMember.family_group_id).where(
            FamilyMember.user_id == current_user.id,
            FamilyMember.status == "active",
            FamilyMember.is_active == True,
        )
    )
    member_ids = list(membership_result.scalars().all())
    if approval.family_group_id not in set(owned + member_ids):
        raise HTTPException(403, "无权查看该审批")

    submitter_result = await db.execute(select(User).where(User.id == approval.submitter_id))
    submitter = submitter_result.scalar_one_or_none()

    return PendingApprovalResponse(
        id=approval.id, family_group_id=approval.family_group_id,
        submitter_id=approval.submitter_id,
        submitter_name=submitter.nickname if submitter else None,
        action_type=approval.action_type, target_table=approval.target_table,
        target_id=approval.target_id, data_snapshot=approval.data_snapshot,
        status=approval.status, reviewer_id=approval.reviewer_id,
        review_note=approval.review_note, expires_at=approval.expires_at,
        created_at=approval.created_at, updated_at=approval.updated_at,
    )


# ==================== 审批操作（通过/拒绝） ====================

@router.put("/{approval_id}/review")
async def review_approval(
    approval_id: int, body: ApprovalActionRequest,
    current_user: CurrentUser, db: DbSession,
):
    result = await db.execute(
        select(PendingApproval).where(PendingApproval.id == approval_id)
    )
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(404, "审批记录不存在")
    if approval.status != "pending":
        raise HTTPException(400, f"审批已处理（当前状态: {approval.status}）")

    if approval.expires_at and approval.expires_at < utcnow():
        approval.status = "expired"
        await db.commit()
        raise HTTPException(400, "审批已过期")

    if not await _is_owner_or_admin(db, approval.family_group_id, current_user.id):
        raise HTTPException(403, "仅主账户或管理员可审批")

    if approval.submitter_id == current_user.id:
        raise HTTPException(400, "不能审批自己提交的请求")

    if body.approved:
        await _execute_approval(db, approval)
        approval.status = "approved"
        approval.reviewer_id = current_user.id
        approval.review_note = body.note

        _create_notification(
            db, user_id=approval.submitter_id,
            type="approval_approved",
            title="审批已通过",
            content=f"您的{approval.action_type}操作已审批通过",
            related_type="pending_approval",
            related_id=approval.id,
        )

        write_audit_log(
            db, owner_id=current_user.id,
            target_table="pending_approval", target_id=approval.id,
            action_type="APPROVE",
            note=f"Approved approval #{approval.id}",
        )
    else:
        approval.status = "rejected"
        approval.reviewer_id = current_user.id
        approval.review_note = body.note

        _create_notification(
            db, user_id=approval.submitter_id,
            type="approval_rejected",
            title="审批已拒绝",
            content=f"您的{approval.action_type}操作已被拒绝" + (f"，原因: {body.note}" if body.note else ""),
            related_type="pending_approval",
            related_id=approval.id,
        )

        write_audit_log(
            db, owner_id=current_user.id,
            target_table="pending_approval", target_id=approval.id,
            action_type="REJECT",
            note=f"Rejected approval #{approval.id}: {body.note}",
        )

    await db.commit()
    return {"message": "已通过" if body.approved else "已拒绝"}


# ==================== 过期审批处理 ====================

@router.post("/expire")
async def expire_approvals(current_user: CurrentUser, db: DbSession):
    owned_result = await db.execute(
        select(FamilyGroup.id).where(FamilyGroup.owner_id == current_user.id)
    )
    owned_ids = list(owned_result.scalars().all())

    admin_result = await db.execute(
        select(FamilyMember.family_group_id).where(
            FamilyMember.user_id == current_user.id,
            FamilyMember.status == "active",
            FamilyMember.is_active == True,
            FamilyMember.role.in_(["owner", "admin"]),
        )
    )
    admin_ids = list(admin_result.scalars().all())
    group_ids = list(set(owned_ids + admin_ids))

    if not group_ids:
        return {"expired_count": 0}

    now = utcnow()
    result = await db.execute(
        select(PendingApproval).where(
            PendingApproval.family_group_id.in_(group_ids),
            PendingApproval.status == "pending",
            PendingApproval.expires_at.isnot(None),
            PendingApproval.expires_at < now,
        )
    )
    expired = result.scalars().all()
    count = 0
    for approval in expired:
        approval.status = "expired"
        _create_notification(
            db, user_id=approval.submitter_id,
            type="approval_expired",
            title="审批已过期",
            content=f"您提交的{approval.action_type}操作审批已过期",
            related_type="pending_approval",
            related_id=approval.id,
        )
        count += 1

    await db.commit()
    return {"expired_count": count}
