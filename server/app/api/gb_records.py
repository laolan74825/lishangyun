from datetime import datetime
from app.core.time import utcnow
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from app.core.dependencies import CurrentUser, DbSession, require_role
from app.core.helpers import model_to_dict, paginate_query, write_audit_log
from app.models.gb_record import GbRecord
from app.models.guestbook import Guestbook
from app.models.payment_account import PaymentAccount
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.gb_record import (
    AccountSummaryItem,
    BatchCheckRequest,
    GbRecordBatchCreate,
    GbRecordCreate,
    GbRecordResponse,
    GbRecordUpdate,
)
from app.utils.idempotency import new_uuid

router = APIRouter(tags=["gb-records"])

EditorUser = Annotated[User, Depends(require_role("super_admin", "admin", "user", "collaborator"))]
OwnerUser = Annotated[User, Depends(require_role("super_admin", "admin", "user"))]


@router.get("/guestbooks/{gb_id}/records", response_model=PaginatedResponse[GbRecordResponse])
async def list_records(
    gb_id: int,
    current_user: CurrentUser,
    db: DbSession,
    include_private: bool = Query(True),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    stmt = (
        select(GbRecord)
        .where(GbRecord.guestbook_id == gb_id, GbRecord.owner_id == current_user.id,
               GbRecord.is_deleted == False)
        .order_by(GbRecord.record_time.desc())
    )
    if not include_private:
        stmt = stmt.where(GbRecord.is_private == False)
    items, pagination = await paginate_query(db, stmt, page, page_size)
    return PaginatedResponse(items=items, pagination=pagination)


@router.get("/guestbooks/{gb_id}/records/recent", response_model=list[GbRecordResponse])
async def recent_records(
    gb_id: int,
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(5, ge=1, le=100),
):
    result = await db.execute(
        select(GbRecord)
        .where(GbRecord.guestbook_id == gb_id, GbRecord.owner_id == current_user.id,
               GbRecord.is_deleted == False)
        .order_by(GbRecord.record_time.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/guestbooks/{gb_id}/records/search", response_model=list[GbRecordResponse])
async def search_records(
    gb_id: int,
    current_user: CurrentUser,
    db: DbSession,
    q: str = Query(..., min_length=1),
):
    keyword = f"%{q}%"
    result = await db.execute(
        select(GbRecord)
        .where(
            GbRecord.guestbook_id == gb_id,
            GbRecord.owner_id == current_user.id,
            GbRecord.is_deleted == False,
            (GbRecord.guest_name.ilike(keyword)) | (GbRecord.agent_name.ilike(keyword)),
        )
    )
    return result.scalars().all()


@router.get("/guestbooks/{gb_id}/records/duplicate")
async def check_duplicate(
    gb_id: int,
    current_user: CurrentUser,
    db: DbSession,
    name: str = Query(...),
):
    result = await db.execute(
        select(GbRecord)
        .where(GbRecord.guestbook_id == gb_id, GbRecord.owner_id == current_user.id,
               GbRecord.guest_name == name, GbRecord.is_deleted == False)
    )
    records = result.scalars().all()
    return {"has_duplicate": len(records) > 0, "records": [GbRecordResponse.model_validate(r) for r in records]}


@router.get("/guestbooks/{gb_id}/records/phone", response_model=GbRecordResponse | None)
async def find_by_phone(
    gb_id: int,
    current_user: CurrentUser,
    db: DbSession,
    phone: str = Query(...),
):
    result = await db.execute(
        select(GbRecord)
        .where(GbRecord.guestbook_id == gb_id, GbRecord.owner_id == current_user.id,
               GbRecord.phone == phone, GbRecord.is_deleted == False)
    )
    return result.scalar_one_or_none()


@router.post("/guestbooks/{gb_id}/records", response_model=int)
async def create_record(
    gb_id: int,
    body: GbRecordCreate,
    db: DbSession,
    current_user: EditorUser,
    client_id: str | None = None,
    operator_name: str | None = None,
):
    result = await db.execute(
        select(Guestbook)
        .where(Guestbook.id == gb_id, Guestbook.owner_id == current_user.id,
               Guestbook.is_deleted == False)
    )
    gb = result.scalar_one_or_none()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")

    record = GbRecord(
        uuid=new_uuid(),
        owner_id=current_user.id,
        guestbook_id=gb_id,
        check_status="unchecked",
        record_time=body.record_time or utcnow(),
        client_id=client_id,
        operator_name=operator_name,
        **body.model_dump(exclude={"record_time"}),
    )
    db.add(record)
    await db.flush()
    write_audit_log(db, current_user.id, "gb_records", record.id, "CREATE",
                    guestbook_id=gb_id, operator_name=operator_name, client_id=client_id,
                    after=body.model_dump())
    await db.commit()
    return record.id


@router.post("/guestbooks/{gb_id}/records/batch", response_model=list[int])
async def create_records_batch(
    gb_id: int,
    body: GbRecordBatchCreate,
    db: DbSession,
    current_user: EditorUser,
    client_id: str | None = None,
    operator_name: str | None = None,
):
    result = await db.execute(
        select(Guestbook)
        .where(Guestbook.id == gb_id, Guestbook.owner_id == current_user.id,
               Guestbook.is_deleted == False)
    )
    gb = result.scalar_one_or_none()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")

    ids = []
    for item in body.records:
        record = GbRecord(
            uuid=new_uuid(),
            owner_id=current_user.id,
            guestbook_id=gb_id,
            check_status="unchecked",
            record_time=item.record_time or utcnow(),
            client_id=client_id,
            operator_name=operator_name,
            **item.model_dump(exclude={"record_time"}),
        )
        db.add(record)
        await db.flush()
        ids.append(record.id)
    await db.commit()
    return ids


@router.put("/gb-records/{record_id}")
async def update_record(
    record_id: int,
    body: GbRecordUpdate,
    db: DbSession,
    current_user: EditorUser,
):
    result = await db.execute(
        select(GbRecord)
        .where(GbRecord.id == record_id, GbRecord.owner_id == current_user.id,
               GbRecord.is_deleted == False)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    before = model_to_dict(record)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(record, k, v)
    record.updated_at = utcnow()
    write_audit_log(db, current_user.id, "gb_records", record_id, "UPDATE",
                    guestbook_id=record.guestbook_id,
                    operator_name=current_user.username,
                    before=before, after=body.model_dump(exclude_unset=True))
    await db.commit()
    return {"message": "已更新"}


@router.delete("/gb-records/{record_id}")
async def delete_record(
    record_id: int,
    db: DbSession,
    current_user: OwnerUser,
):
    result = await db.execute(
        select(GbRecord)
        .where(GbRecord.id == record_id, GbRecord.owner_id == current_user.id,
               GbRecord.is_deleted == False)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    before = model_to_dict(record)
    record.is_deleted = True
    record.deleted_at = utcnow()
    write_audit_log(db, current_user.id, "gb_records", record_id, "DELETE",
                    guestbook_id=record.guestbook_id,
                    operator_name=current_user.username, before=before)
    await db.commit()
    return {"message": "已删除"}


@router.patch("/gb-records/{record_id}/check")
async def update_check_status(
    record_id: int,
    current_user: EditorUser,
    db: DbSession,
    checked: bool = Query(...),
):
    result = await db.execute(
        select(GbRecord)
        .where(GbRecord.id == record_id, GbRecord.owner_id == current_user.id,
               GbRecord.is_deleted == False)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    record.check_status = "checked" if checked else "unchecked"
    record.updated_at = utcnow()
    await db.commit()
    return {"message": "已更新"}


@router.post("/gb-records/batch-check")
async def batch_check(
    body: BatchCheckRequest,
    db: DbSession,
    current_user: EditorUser,
):
    new_status = "checked" if body.checked else "unchecked"
    result = await db.execute(
        select(GbRecord)
        .where(GbRecord.id.in_(body.ids), GbRecord.owner_id == current_user.id,
               GbRecord.is_deleted == False)
    )
    records = result.scalars().all()
    for record in records:
        record.check_status = new_status
        record.updated_at = utcnow()
    await db.commit()
    return {"message": "已批量更新"}


@router.get("/guestbooks/{gb_id}/account-summary", response_model=list[AccountSummaryItem])
async def account_summary(
    gb_id: int,
    current_user: CurrentUser,
    db: DbSession,
):
    stmt = (
        select(
            GbRecord.account_id,
            func.count(GbRecord.id).label("record_count"),
            func.sum(GbRecord.amount).label("total_amount"),
        )
        .where(GbRecord.guestbook_id == gb_id, GbRecord.owner_id == current_user.id,
               GbRecord.account_id.isnot(None), GbRecord.is_deleted == False)
        .group_by(GbRecord.account_id)
    )
    result = await db.execute(stmt)
    rows = result.all()
    items = []
    for account_id, record_count, total_amount in rows:
        acc_result = await db.execute(select(PaymentAccount).where(PaymentAccount.id == account_id))
        account = acc_result.scalar_one_or_none()
        items.append(AccountSummaryItem(
            account_id=account_id,
            account_name=account.name if account else "未知账户",
            record_count=record_count,
            total_amount=total_amount,
        ))
    return items
