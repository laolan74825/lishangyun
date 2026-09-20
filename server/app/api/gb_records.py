import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.gb_record import GbRecord
from app.models.guestbook import Guestbook
from app.models.operation_log import OperationLog
from app.models.user import User
from app.schemas.gb_record import (
    BatchCheckRequest,
    GbRecordBatchCreate,
    GbRecordCreate,
    GbRecordResponse,
    GbRecordUpdate,
)
from app.utils.idempotency import new_uuid

router = APIRouter(tags=["gb-records"])


def _add_log(db: Session, guestbook_id: int, gb_record_id: int | None, action_type: str, before=None, after=None, operator_name=None, client_id=None):
    db.add(OperationLog(
        guestbook_id=guestbook_id,
        gb_record_id=gb_record_id,
        action_type=action_type,
        operator_name=operator_name,
        client_id=client_id,
        before_data=json.dumps(before, ensure_ascii=False, default=str) if before else None,
        after_data=json.dumps(after, ensure_ascii=False, default=str) if after else None,
    ))


@router.get("/guestbooks/{gb_id}/records", response_model=list[GbRecordResponse])
def list_records(
    gb_id: int,
    limit: int | None = None,
    offset: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(GbRecord).filter(GbRecord.guestbook_id == gb_id).order_by(GbRecord.record_time.desc())
    if offset is not None and limit is not None:
        q = q.offset(offset).limit(limit)
    return q.all()


@router.get("/guestbooks/{gb_id}/records/recent", response_model=list[GbRecordResponse])
def recent_records(
    gb_id: int,
    limit: int = 5,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return (
        db.query(GbRecord)
        .filter(GbRecord.guestbook_id == gb_id)
        .order_by(GbRecord.record_time.desc())
        .limit(limit)
        .all()
    )


@router.get("/guestbooks/{gb_id}/records/search", response_model=list[GbRecordResponse])
def search_records(
    gb_id: int,
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    keyword = f"%{q}%"
    return (
        db.query(GbRecord)
        .filter(
            GbRecord.guestbook_id == gb_id,
            (GbRecord.guest_name.ilike(keyword)) | (GbRecord.agent_name.ilike(keyword)),
        )
        .all()
    )


@router.get("/guestbooks/{gb_id}/records/duplicate")
def check_duplicate(
    gb_id: int,
    name: str = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    records = (
        db.query(GbRecord)
        .filter(GbRecord.guestbook_id == gb_id, GbRecord.guest_name == name)
        .all()
    )
    return {"has_duplicate": len(records) > 0, "records": [GbRecordResponse.model_validate(r) for r in records]}


@router.get("/guestbooks/{gb_id}/records/phone", response_model=GbRecordResponse | None)
def find_by_phone(
    gb_id: int,
    phone: str = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return (
        db.query(GbRecord)
        .filter(GbRecord.guestbook_id == gb_id, GbRecord.phone == phone)
        .first()
    )


@router.post("/guestbooks/{gb_id}/records", response_model=int)
def create_record(
    gb_id: int,
    body: GbRecordCreate,
    client_id: str | None = None,
    operator_name: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    gb = db.query(Guestbook).filter(Guestbook.id == gb_id).first()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")

    record = GbRecord(
        uuid=new_uuid(),
        guestbook_id=gb_id,
        check_status="unchecked",
        record_time=body.record_time or datetime.utcnow(),
        client_id=client_id,
        operator_name=operator_name,
        **body.model_dump(exclude={"record_time"}),
    )
    db.add(record)
    db.flush()
    _add_log(db, gb_id, record.id, "CREATE", after=record.__dict__, operator_name=operator_name, client_id=client_id)
    db.commit()
    return record.id


@router.post("/guestbooks/{gb_id}/records/batch", response_model=list[int])
def create_records_batch(
    gb_id: int,
    body: GbRecordBatchCreate,
    client_id: str | None = None,
    operator_name: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    ids = []
    for item in body.records:
        record = GbRecord(
            uuid=new_uuid(),
            guestbook_id=gb_id,
            check_status="unchecked",
            record_time=item.record_time or datetime.utcnow(),
            client_id=client_id,
            operator_name=operator_name,
            **item.model_dump(exclude={"record_time"}),
        )
        db.add(record)
        db.flush()
        ids.append(record.id)
    db.commit()
    return ids


@router.put("/gb-records/{record_id}")
def update_record(
    record_id: int,
    body: GbRecordUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    record = db.query(GbRecord).filter(GbRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    before = record.__dict__.copy()
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(record, k, v)
    _add_log(db, record.guestbook_id, record_id, "UPDATE", before=before, after=record.__dict__)
    db.commit()
    return {"message": "已更新"}


@router.delete("/gb-records/{record_id}")
def delete_record(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    record = db.query(GbRecord).filter(GbRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    before = record.__dict__.copy()
    _add_log(db, record.guestbook_id, record_id, "DELETE", before=before)
    db.delete(record)
    db.commit()
    return {"message": "已删除"}


@router.patch("/gb-records/{record_id}/check")
def update_check_status(
    record_id: int,
    checked: bool = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    record = db.query(GbRecord).filter(GbRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    record.check_status = "checked" if checked else "unchecked"
    db.commit()
    return {"message": "已更新"}


@router.post("/gb-records/batch-check")
def batch_check(
    body: BatchCheckRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    status = "checked" if body.checked else "unchecked"
    for rid in body.ids:
        record = db.query(GbRecord).filter(GbRecord.id == rid).first()
        if record:
            record.check_status = status
    db.commit()
    return {"message": "已批量更新"}


@router.get("/guestbooks/{gb_id}/account-summary")
def account_summary(
    gb_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    records = db.query(GbRecord).filter(GbRecord.guestbook_id == gb_id).all()
    summary: dict[int, dict] = {}
    for r in records:
        if r.account_id is None:
            continue
        if r.account_id not in summary:
            summary[r.account_id] = {"record_count": 0, "total_amount": 0}
        summary[r.account_id]["record_count"] += 1
        summary[r.account_id]["total_amount"] += r.amount
    return summary
