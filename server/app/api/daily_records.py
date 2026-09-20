from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.daily_record import DailyRecord
from app.models.user import User
from app.schemas.daily_record import DailyRecordCreate, DailyRecordResponse, DailyRecordsSummary, DailyRecordUpdate
from app.utils.idempotency import new_uuid

router = APIRouter(prefix="/daily-records", tags=["daily-records"])


@router.get("/", response_model=list[DailyRecordResponse])
def list_records(
    type: str | None = None,
    keyword: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(DailyRecord).order_by(DailyRecord.event_date.desc(), DailyRecord.created_at.desc())
    if type:
        q = q.filter(DailyRecord.type == type)
    if start_date:
        q = q.filter(DailyRecord.event_date >= start_date)
    if end_date:
        q = q.filter(DailyRecord.event_date <= end_date)
    if keyword:
        k = f"%{keyword}%"
        q = q.filter(
            (DailyRecord.person_name.ilike(k))
            | (DailyRecord.event_type.ilike(k))
            | (DailyRecord.note.ilike(k))
        )
    if offset is not None and limit is not None:
        q = q.offset(offset).limit(limit)
    return q.all()


@router.get("/summary", response_model=DailyRecordsSummary)
def records_summary(
    type: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    keyword: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(DailyRecord)
    if type:
        q = q.filter(DailyRecord.type == type)
    if start_date:
        q = q.filter(DailyRecord.event_date >= start_date)
    if end_date:
        q = q.filter(DailyRecord.event_date <= end_date)
    if keyword:
        k = f"%{keyword}%"
        q = q.filter(
            (DailyRecord.person_name.ilike(k))
            | (DailyRecord.event_type.ilike(k))
            | (DailyRecord.note.ilike(k))
        )
    records = q.all()
    total_out = sum(r.amount for r in records if r.type == "out")
    total_in = sum(r.amount for r in records if r.type == "in")
    return DailyRecordsSummary(
        total_records=len(records),
        total_out=total_out,
        total_in=total_in,
        net=total_in - total_out,
    )


@router.post("/", response_model=int)
def create_record(
    body: DailyRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "editor")),
):
    record = DailyRecord(
        uuid=new_uuid(),
        source="daily",
        created_by=current_user.username,
        **body.model_dump(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record.id


@router.put("/{record_id}")
def update_record(
    record_id: int,
    body: DailyRecordUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    record = db.query(DailyRecord).filter(DailyRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(record, k, v)
    record.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "已更新"}


@router.delete("/{record_id}")
def delete_record(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    record = db.query(DailyRecord).filter(DailyRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    db.delete(record)
    db.commit()
    return {"message": "已删除"}
