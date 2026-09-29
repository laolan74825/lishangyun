from datetime import datetime
from app.core.time import utcnow
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from app.core.dependencies import CurrentUser, DbSession, require_role
from app.core.helpers import paginate_query, write_audit_log
from app.models.authorization_code import AuthorizationCode
from app.models.family_group import FamilyGroup
from app.models.family_member import FamilyMember
from app.models.gb_record import GbRecord
from app.models.guestbook import Guestbook
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.gb_record import GbRecordBatchCreate, GbRecordCreate, GbRecordResponse
from app.schemas.guestbook import GuestbookCreate, GuestbookResponse, GuestbookSummary, GuestbookUpdate
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
        total_records = (await db.execute(
            select(func.count(GbRecord.id))
            .where(GbRecord.guestbook_id == g.id, GbRecord.is_deleted == False)
        )).scalar_one()
        total_amount = (await db.execute(
            select(func.coalesce(func.sum(GbRecord.amount), 0))
            .where(GbRecord.guestbook_id == g.id, GbRecord.is_deleted == False)
        )).scalar_one()
        checked_count = (await db.execute(
            select(func.count(GbRecord.id))
            .where(GbRecord.guestbook_id == g.id, GbRecord.check_status == "checked",
                   GbRecord.is_deleted == False)
        )).scalar_one()
        summaries.append(GuestbookSummary(
            id=g.id, name=g.name, event_type=g.event_type, event_date=g.event_date,
            status=g.status, total_records=total_records, total_amount=total_amount,
            checked_count=checked_count, unchecked_count=total_records - checked_count,
        ))
    return summaries


@router.get("/{guestbook_id}", response_model=GuestbookResponse)
async def get_guestbook(guestbook_id: int, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Guestbook).where(
            Guestbook.id == guestbook_id, Guestbook.owner_id == current_user.id,
            Guestbook.is_deleted == False
        )
    )
    gb = result.scalar_one_or_none()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")
    return gb


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
    record_count = (await db.execute(
        select(func.count(GbRecord.id))
        .where(GbRecord.guestbook_id == guestbook_id, GbRecord.is_deleted == False)
    )).scalar_one()
    if record_count > 0:
        raise HTTPException(status_code=400, detail="该礼簿已有收礼记录，请先导出备份后再删除")
    before = {c.name: getattr(gb, c.name) for c in Guestbook.__table__.columns}
    gb.is_deleted = True
    gb.deleted_at = utcnow()
    write_audit_log(db, current_user.id, "guestbooks", gb.id, "DELETE",
                    operator_name=current_user.username, before=before)
    await db.commit()
    return {"message": "已删除"}


@router.post("/{guestbook_id}/close")
async def close_guestbook(
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
    if gb.status != "active":
        raise HTTPException(status_code=400, detail="只有进行中的礼簿可以结束")
    gb.status = "closing"
    gb.closing_at = utcnow()
    gb.updated_at = utcnow()
    await db.commit()
    return {"message": "礼簿已进入收尾阶段"}


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


@router.get("/{guestbook_id}/summary")
async def guestbook_summary(guestbook_id: int, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Guestbook).where(
            Guestbook.id == guestbook_id, Guestbook.owner_id == current_user.id,
            Guestbook.is_deleted == False
        )
    )
    gb = result.scalar_one_or_none()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")

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
    result = await db.execute(
        select(Guestbook).where(Guestbook.id == guestbook_id, Guestbook.is_deleted == False)
    )
    gb = result.scalar_one_or_none()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")

    if gb.status == "archived":
        raise HTTPException(status_code=400, detail="已归档的礼簿不可录入")

    authorized = False

    fam_result = await db.execute(
        select(FamilyGroup).where(FamilyGroup.owner_id == gb.owner_id)
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
            authorized = True

    if not authorized:
        auth_result = await db.execute(
            select(AuthorizationCode).where(
                AuthorizationCode.guestbook_id == guestbook_id,
                AuthorizationCode.grantee_user_id == current_user.id,
                AuthorizationCode.status == "active",
                AuthorizationCode.expires_at > utcnow(),
            )
        )
        if auth_result.scalar_one_or_none():
            authorized = True

    if not authorized:
        raise HTTPException(status_code=403, detail="无权限在该礼簿中录入")

    ids = []
    for item in body.records:
        record = GbRecord(
            uuid=new_uuid(),
            owner_id=gb.owner_id,
            guestbook_id=guestbook_id,
            check_status="unchecked",
            record_time=item.record_time or utcnow(),
            operator_name=current_user.username,
            **item.model_dump(exclude={"record_time"}),
        )
        db.add(record)
        await db.flush()
        ids.append(record.id)
    await db.commit()
    return ids
