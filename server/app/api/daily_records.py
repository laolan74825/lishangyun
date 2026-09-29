from datetime import date, datetime
from app.core.time import utcnow
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from app.core.dependencies import CurrentUser, DbSession, require_role
from app.core.helpers import paginate_query, write_audit_log
from app.models.daily_record import DailyRecord
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.daily_record import DailyRecordCreate, DailyRecordResponse, DailyRecordsSummary, DailyRecordUpdate
from app.utils.idempotency import new_uuid

router = APIRouter(prefix="/daily-records", tags=["daily-records"])

EditorUser = Annotated[User, Depends(require_role("super_admin", "admin", "user", "collaborator"))]
OwnerUser = Annotated[User, Depends(require_role("super_admin", "admin", "user"))]


@router.get("/", response_model=PaginatedResponse[DailyRecordResponse])
async def list_records(
    current_user: CurrentUser,
    db: DbSession,
    type: str | None = None,
    keyword: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    include_private: bool = Query(True),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    stmt = (
        select(DailyRecord)
        .where(DailyRecord.owner_id == current_user.id, DailyRecord.is_deleted == False)
    )
    if not include_private:
        stmt = stmt.where(DailyRecord.is_private == False)
    if type:
        stmt = stmt.where(DailyRecord.type == type)
    if start_date:
        stmt = stmt.where(DailyRecord.event_date >= start_date)
    if end_date:
        stmt = stmt.where(DailyRecord.event_date <= end_date)
    if keyword:
        k = f"%{keyword}%"
        stmt = stmt.where(
            (DailyRecord.person_name.ilike(k))
            | (DailyRecord.event_type.ilike(k))
            | (DailyRecord.note.ilike(k))
        )
    stmt = stmt.order_by(DailyRecord.event_date.desc(), DailyRecord.created_at.desc())
    items, pagination = await paginate_query(db, stmt, page, page_size)
    return PaginatedResponse(items=items, pagination=pagination)


@router.get("/summary", response_model=DailyRecordsSummary)
async def records_summary(
    current_user: CurrentUser,
    db: DbSession,
    type: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    keyword: str | None = None,
    include_private: bool = Query(True),
):
    base_where = [DailyRecord.owner_id == current_user.id, DailyRecord.is_deleted == False]
    if not include_private:
        base_where.append(DailyRecord.is_private == False)
    if type:
        base_where.append(DailyRecord.type == type)
    if start_date:
        base_where.append(DailyRecord.event_date >= start_date)
    if end_date:
        base_where.append(DailyRecord.event_date <= end_date)
    if keyword:
        k = f"%{keyword}%"
        base_where.append(
            (DailyRecord.person_name.ilike(k))
            | (DailyRecord.event_type.ilike(k))
            | (DailyRecord.note.ilike(k))
        )

    count_stmt = select(func.count()).select_from(DailyRecord).where(*base_where)
    total_records = (await db.execute(count_stmt)).scalar_one()

    out_stmt = select(func.coalesce(func.sum(DailyRecord.amount), 0)).select_from(DailyRecord).where(
        *base_where, DailyRecord.type == "out"
    )
    total_out = (await db.execute(out_stmt)).scalar_one()

    in_stmt = select(func.coalesce(func.sum(DailyRecord.amount), 0)).select_from(DailyRecord).where(
        *base_where, DailyRecord.type == "in"
    )
    total_in = (await db.execute(in_stmt)).scalar_one()

    return DailyRecordsSummary(
        total_records=total_records,
        total_out=total_out,
        total_in=total_in,
        net=total_in - total_out,
    )


@router.post("/", response_model=dict)
async def create_record(
    body: DailyRecordCreate,
    db: DbSession,
    current_user: EditorUser,
):
    record = DailyRecord(
        uuid=new_uuid(),
        owner_id=current_user.id,
        source="daily",
        created_by=current_user.username,
        **body.model_dump(),
    )
    db.add(record)
    await db.flush()
    write_audit_log(db, current_user.id, "daily_records", record.id, "CREATE",
                    operator_name=current_user.username, after=body.model_dump())
    await db.commit()
    return {"id": record.id}


@router.put("/{record_id}")
async def update_record(
    record_id: int,
    body: DailyRecordUpdate,
    db: DbSession,
    current_user: EditorUser,
):
    result = await db.execute(
        select(DailyRecord)
        .where(DailyRecord.id == record_id, DailyRecord.owner_id == current_user.id,
               DailyRecord.is_deleted == False)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(record, k, v)
    record.updated_at = utcnow()
    await db.commit()
    return {"message": "已更新"}


@router.delete("/{record_id}")
async def delete_record(
    record_id: int,
    db: DbSession,
    current_user: OwnerUser,
):
    result = await db.execute(
        select(DailyRecord)
        .where(DailyRecord.id == record_id, DailyRecord.owner_id == current_user.id,
               DailyRecord.is_deleted == False)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    record.is_deleted = True
    record.deleted_at = utcnow()
    await db.commit()
    return {"message": "已删除"}
