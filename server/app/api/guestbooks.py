from datetime import datetime
from app.core.time import utcnow
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, delete, func, select

from app.core.dependencies import CurrentUser, DbSession, require_role
from app.core.guestbook_access import get_guestbook_access
from app.core.helpers import match_person_id, paginate_query, write_audit_log
from app.models.authorization_action_log import AuthorizationActionLog
from app.models.collaboration_invite import CollaborationInvite
from app.models.gb_record import GbRecord
from app.models.guestbook import Guestbook
from app.models.guestbook_host import GuestbookHost
from app.models.person import Person
from app.models.terminal_settings import TerminalSettings
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.gb_record import GbRecordBatchCreate, GbRecordCreate, GbRecordResponse
from app.schemas.guestbook import GuestbookCloseRequest, GuestbookCreate, GuestbookResponse, GuestbookSummary, GuestbookUpdate, MergeCreatePersonsRequest
from app.utils.idempotency import new_uuid

router = APIRouter(prefix="/guestbooks", tags=["guestbooks"])

EditorUser = Annotated[User, Depends(require_role("super_admin", "admin", "user", "collaborator"))]
OwnerUser = Annotated[User, Depends(require_role("super_admin", "admin", "user"))]


@router.get("/", response_model=PaginatedResponse[GuestbookResponse])
async def list_guestbooks(
    current_user: CurrentUser,
    db: DbSession,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    stmt = (
        select(Guestbook)
        .where(Guestbook.owner_id == current_user.id, Guestbook.is_deleted == False)
    )
    if status:
        stmt = stmt.where(Guestbook.status == status)
    stmt = stmt.order_by(Guestbook.id.desc())
    items, pagination = await paginate_query(db, stmt, page, page_size)
    return PaginatedResponse(items=items, pagination=pagination)


@router.get("/summaries", response_model=list[GuestbookSummary])
async def list_summaries(current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Guestbook)
        .where(Guestbook.owner_id == current_user.id, Guestbook.is_deleted == False)
        .order_by(Guestbook.id.desc())
    )
    guestbooks = result.scalars().all()
    summaries = []
    for g in guestbooks:
        total_records, total_amount, checked_count, checked_amount = (await db.execute(
            select(
                func.count(GbRecord.id),
                func.coalesce(func.sum(GbRecord.amount), 0),
                func.coalesce(func.sum(case((GbRecord.check_status == "checked", 1), else_=0)), 0),
                func.coalesce(func.sum(case((GbRecord.check_status == "checked", GbRecord.amount), else_=0)), 0),
            ).where(GbRecord.guestbook_id == g.id, GbRecord.is_deleted == False)
        )).one()
        summaries.append(GuestbookSummary(
            id=g.id, name=g.name, event_type=g.event_type, event_date=g.event_date,
            status=g.status, total_records=total_records, total_amount=total_amount,
            checked_count=checked_count, unchecked_count=total_records - checked_count,
            checked_amount=checked_amount, unchecked_amount=total_amount - checked_amount,
            person_merged_at=g.person_merged_at,
        ))
    return summaries


@router.get("/{guestbook_id}", response_model=GuestbookResponse)
async def get_guestbook(guestbook_id: int, current_user: CurrentUser, db: DbSession):
    access = await get_guestbook_access(db, current_user, guestbook_id)
    access.require("reconcile", "both")
    return access.guestbook


@router.post("/", response_model=dict)
async def create_guestbook(
    body: GuestbookCreate,
    db: DbSession,
    current_user: EditorUser,
):
    gb = Guestbook(owner_id=current_user.id, **body.model_dump())
    db.add(gb)
    await db.flush()
    write_audit_log(db, current_user.id, "guestbooks", gb.id, "CREATE",
                    operator_name=current_user.username, after=body.model_dump())
    await db.commit()
    return {"id": gb.id}


@router.put("/{guestbook_id}")
async def update_guestbook(
    guestbook_id: int,
    body: GuestbookUpdate,
    db: DbSession,
    current_user: EditorUser,
):
    result = await db.execute(
        select(Guestbook).where(
            Guestbook.id == guestbook_id, Guestbook.owner_id == current_user.id,
            Guestbook.is_deleted == False
        )
    )
    gb = result.scalar_one_or_none()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")
    before = {c.name: getattr(gb, c.name) for c in Guestbook.__table__.columns}
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(gb, k, v)
    gb.updated_at = utcnow()
    write_audit_log(db, current_user.id, "guestbooks", gb.id, "UPDATE",
                    operator_name=current_user.username, before=before, after=body.model_dump(exclude_unset=True))
    await db.commit()
    return {"message": "已更新"}


@router.delete("/{guestbook_id}")
async def delete_guestbook(
    guestbook_id: int,
    db: DbSession,
    current_user: OwnerUser,
):
    result = await db.execute(
        select(Guestbook).where(
            Guestbook.id == guestbook_id, Guestbook.owner_id == current_user.id,
            Guestbook.is_deleted == False
        )
    )
    gb = result.scalar_one_or_none()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")
    # 有可见收礼记录的阻断，需先导出备份；空礼簿（含记录已单独删光的）直接物理删除
    record_count = (await db.execute(
        select(func.count(GbRecord.id))
        .where(GbRecord.guestbook_id == guestbook_id, GbRecord.is_deleted == False)
    )).scalar_one()
    if record_count > 0:
        raise HTTPException(status_code=400, detail="该礼簿已有收礼记录，请先导出备份后再删除")
    before = {c.name: getattr(gb, c.name) for c in Guestbook.__table__.columns}
    # 空礼簿无保留价值，直接删除；连带清理全部收礼记录（含已单独删除的）与关联设置
    await db.execute(delete(GbRecord).where(GbRecord.guestbook_id == guestbook_id))
    await db.execute(delete(GuestbookHost).where(GuestbookHost.guestbook_id == guestbook_id))
    await db.execute(delete(TerminalSettings).where(TerminalSettings.guestbook_id == guestbook_id))
    write_audit_log(db, current_user.id, "guestbooks", guestbook_id, "DELETE",
                    operator_name=current_user.username, before=before,
                    note="空礼簿，直接删除")
    await db.delete(gb)
    await db.commit()
    return {"message": "已删除"}


@router.post("/{guestbook_id}/close")
async def close_guestbook(
    guestbook_id: int,
    db: DbSession,
    current_user: EditorUser,
    payload: GuestbookCloseRequest | None = None,
):
    result = await db.execute(
        select(Guestbook).where(
            Guestbook.id == guestbook_id, Guestbook.owner_id == current_user.id,
            Guestbook.is_deleted == False
        )
    )
    gb = result.scalar_one_or_none()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")
    if gb.status != "active":
        raise HTTPException(status_code=400, detail="只有进行中的礼簿可以结束")
    # 需全部对账才可以结束礼簿
    unchecked_count = (await db.execute(
        select(func.count(GbRecord.id))
        .where(
            GbRecord.guestbook_id == guestbook_id,
            GbRecord.is_deleted == False,
            GbRecord.check_status != "checked",
        )
    )).scalar_one()
    if unchecked_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"还有 {unchecked_count} 笔收礼记录未对账，全部对账后才能结束礼簿",
        )
    gb.status = "closing"
    gb.closing_at = utcnow()
    summary = payload.summary if payload else None
    if summary is not None:
        gb.closing_summary = summary.strip() or None
    gb.updated_at = utcnow()
    # 结束收礼会中止协助收礼任务：撤销该礼簿所有待接受/协作中的邀请
    invites_result = await db.execute(
        select(CollaborationInvite).where(
            CollaborationInvite.guestbook_id == guestbook_id,
            CollaborationInvite.status.in_(("pending", "accepted")),
        )
    )
    revoked_count = 0
    for invite in invites_result.scalars().all():
        old_status = invite.status
        invite.status = "revoked"
        action = "取消邀请" if old_status == "pending" else "撤销授权"
        db.add(AuthorizationActionLog(
            invite_id=invite.id, action_type="REVOKE",
            operator_name=current_user.nickname or current_user.username,
            detail=f"{action}（原状态：{old_status}，原因：结束收礼）",
        ))
        revoked_count += 1
    await db.commit()
    return {"message": "礼簿已进入收尾阶段", "revoked_invites": revoked_count}


@router.post("/{guestbook_id}/reopen")
async def reopen_guestbook(
    guestbook_id: int,
    db: DbSession,
    current_user: EditorUser,
):
    result = await db.execute(
        select(Guestbook).where(
            Guestbook.id == guestbook_id, Guestbook.owner_id == current_user.id,
            Guestbook.is_deleted == False
        )
    )
    gb = result.scalar_one_or_none()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")
    if gb.status != "closing":
        raise HTTPException(status_code=400, detail="只有收尾中的礼簿可以返回收礼中")
    gb.status = "active"
    gb.closing_at = None
    gb.updated_at = utcnow()
    await db.commit()
    return {"message": "礼簿已返回收礼中"}


@router.post("/{guestbook_id}/archive")
async def archive_guestbook(
    guestbook_id: int,
    db: DbSession,
    current_user: OwnerUser,
):
    result = await db.execute(
        select(Guestbook).where(
            Guestbook.id == guestbook_id, Guestbook.owner_id == current_user.id,
            Guestbook.is_deleted == False
        )
    )
    gb = result.scalar_one_or_none()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")
    if gb.status not in ("active", "closing"):
        raise HTTPException(status_code=400, detail="只有进行中或收尾中的礼簿可以归档")
    gb.status = "archived"
    gb.archived_at = utcnow()
    gb.updated_at = utcnow()
    await db.commit()
    return {"message": "礼簿已归档"}


# 已归档的礼簿可以恢复为收尾中，以便补录/修正后重新归档
# 恢复后 clearing 记录保留，重新归档时覆盖 archived_at
@router.post("/{guestbook_id}/unarchive")
async def unarchive_guestbook(
    guestbook_id: int,
    db: DbSession,
    current_user: OwnerUser,
):
    result = await db.execute(
        select(Guestbook).where(
            Guestbook.id == guestbook_id, Guestbook.owner_id == current_user.id,
            Guestbook.is_deleted == False
        )
    )
    gb = result.scalar_one_or_none()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")
    if gb.status != "archived":
        raise HTTPException(status_code=400, detail="只有已归档的礼簿可以恢复为收尾中")
    gb.status = "closing"
    gb.archived_at = None
    gb.updated_at = utcnow()
    await db.commit()
    return {"message": "礼簿已恢复为收尾中"}


# 礼簿合并：将礼簿内未关联人员库的记录按宾客姓名/电话建立 person_id 关联（不搬迁数据）
# 执行后标记 person_merged_at；已合并礼簿后续的修改/补录会自动解析 person_id 保持同步
@router.post("/{guestbook_id}/merge-persons")
async def merge_persons_to_library(
    guestbook_id: int,
    db: DbSession,
    current_user: OwnerUser,
):
    access = await get_guestbook_access(db, current_user, guestbook_id)
    gb = access.guestbook

    # 收尾中或已归档的礼簿允许合并；收礼中数据尚不稳定，暂不提供
    if gb.status == "active":
        raise HTTPException(status_code=400, detail="收礼中的礼簿暂不能合并，请先结束收礼进入收尾")

    result = await db.execute(
        select(GbRecord)
        .where(GbRecord.guestbook_id == guestbook_id, GbRecord.is_deleted == False)
        .order_by(GbRecord.id)
    )
    records = result.scalars().all()

    linked = 0      # 本次新建立关联的记录数
    unmatched = 0   # 无法在人员库匹配到的记录数
    already = 0     # 已有关联、跳过的记录数
    for r in records:
        if r.person_id:
            already += 1
            continue
        pid = await match_person_id(db, current_user.id, r.guest_name, r.phone)
        if pid is not None:
            r.person_id = pid
            linked += 1
        else:
            unmatched += 1

    gb.person_merged_at = utcnow()
    gb.updated_at = utcnow()
    write_audit_log(
        db, current_user.id, "guestbook", guestbook_id, "UPDATE",
        guestbook_id=guestbook_id, operator_name=current_user.username,
        note=f"礼簿合并到人员库：新关联 {linked} 条，未匹配 {unmatched} 条，已关联 {already} 条",
    )
    await db.commit()
    return {"linked": linked, "unmatched": unmatched, "already_linked": already}


# 合并向导「新建人员」：对用户勾选的无法匹配记录，按礼簿数据（姓名+电话）新建人员并关联。
# 创建前再次按 match_person_id 规则查重——若该人员已被创建/已能匹配，则直接关联，不重复建人。
@router.post("/{guestbook_id}/merge-persons/create-persons")
async def merge_create_persons(
    guestbook_id: int,
    body: MergeCreatePersonsRequest,
    db: DbSession,
    current_user: OwnerUser,
):
    access = await get_guestbook_access(db, current_user, guestbook_id)
    gb = access.guestbook

    # 与合并执行同一约束：收礼中的礼簿不提供
    if gb.status == "active":
        raise HTTPException(status_code=400, detail="收礼中的礼簿暂不能合并，请先结束收礼进入收尾")

    result = await db.execute(
        select(GbRecord).where(
            GbRecord.guestbook_id == guestbook_id,
            GbRecord.id.in_(body.record_ids),
            GbRecord.is_deleted == False,
        )
    )
    records = result.scalars().all()

    created = 0        # 本次新建的人员数
    linked_existing = 0  # 人员已存在（被并发创建或已可匹配），直接关联
    skipped = 0        # 已有关联或不属于该礼簿的记录，跳过
    for r in records:
        if r.person_id:
            skipped += 1
            continue
        pid = await match_person_id(db, current_user.id, r.guest_name, r.phone)
        if pid is not None:
            r.person_id = pid
            linked_existing += 1
            continue
        person = Person(
            owner_id=current_user.id,
            name=r.guest_name,
            phone=r.phone,
        )
        db.add(person)
        await db.flush()
        write_audit_log(db, current_user.id, "persons", person.id, "CREATE",
                        operator_name=current_user.username,
                        after={"name": person.name, "phone": person.phone, "source": "guestbook_merge"})
        r.person_id = person.id
        created += 1

    gb.person_merged_at = utcnow()
    gb.updated_at = utcnow()
    write_audit_log(
        db, current_user.id, "guestbook", guestbook_id, "UPDATE",
        guestbook_id=guestbook_id, operator_name=current_user.username,
        note=f"合并向导新建人员：新建 {created} 人，关联已有人员 {linked_existing} 条，跳过 {skipped} 条",
    )
    await db.commit()
    return {"created": created, "linked_existing": linked_existing, "skipped": skipped}


@router.get("/{guestbook_id}/summary")
async def guestbook_summary(guestbook_id: int, current_user: CurrentUser, db: DbSession):
    access = await get_guestbook_access(db, current_user, guestbook_id)
    access.require("reconcile", "both")
    gb = access.guestbook

    total_records = (await db.execute(
        select(func.count(GbRecord.id))
        .where(GbRecord.guestbook_id == guestbook_id, GbRecord.is_deleted == False)
    )).scalar_one()
    total_amount = (await db.execute(
        select(func.coalesce(func.sum(GbRecord.amount), 0))
        .where(GbRecord.guestbook_id == guestbook_id, GbRecord.is_deleted == False)
    )).scalar_one()
    checked_count = (await db.execute(
        select(func.count(GbRecord.id))
        .where(GbRecord.guestbook_id == guestbook_id, GbRecord.check_status == "checked",
               GbRecord.is_deleted == False)
    )).scalar_one()
    return {
        "total_records": total_records,
        "total_amount": total_amount,
        "checked_count": checked_count,
        "unchecked_count": total_records - checked_count,
    }


@router.post("/{guestbook_id}/proxy-records", response_model=list[int])
async def proxy_create_records(
    guestbook_id: int,
    body: GbRecordBatchCreate,
    db: DbSession,
    current_user: CurrentUser,
):
    access = await get_guestbook_access(db, current_user, guestbook_id)
    access.require("record", "both")
    gb = access.guestbook

    if gb.status == "archived":
        raise HTTPException(status_code=400, detail="已归档的礼簿不可录入")

    operator = body.operator_name or current_user.username
    ids = []
    for item in body.records:
        # 收尾中补录的记录无需对账，自动标记为已对账
        record = GbRecord(
            uuid=new_uuid(),
            owner_id=gb.owner_id,
            guestbook_id=guestbook_id,
            check_status="checked" if gb.status == "closing" else "unchecked",
            record_time=item.record_time or utcnow(),
            operator_name=operator,
            **item.model_dump(exclude={"record_time", "operator_name", "client_id"}),
        )
        # 已合并礼簿：补录记录自动解析人员关联
        if gb.person_merged_at and not record.person_id:
            record.person_id = await match_person_id(db, gb.owner_id, record.guest_name, record.phone)
        db.add(record)
        await db.flush()
        ids.append(record.id)
    await db.commit()
    return ids
