from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.gb_record import GbRecord
from app.models.guestbook import Guestbook
from app.models.user import User
from app.schemas.guestbook import GuestbookCreate, GuestbookResponse, GuestbookSummary, GuestbookUpdate

router = APIRouter(prefix="/guestbooks", tags=["guestbooks"])


@router.get("/", response_model=list[GuestbookResponse])
def list_guestbooks(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Guestbook).order_by(Guestbook.id.desc()).all()


@router.get("/summaries", response_model=list[GuestbookSummary])
def list_summaries(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    guestbooks = db.query(Guestbook).order_by(Guestbook.id.desc()).all()
    result = []
    for g in guestbooks:
        records = db.query(GbRecord).filter(GbRecord.guestbook_id == g.id).all()
        result.append(
            GuestbookSummary(
                id=g.id,
                name=g.name,
                event_type=g.event_type,
                event_date=g.event_date,
                status=g.status,
                total_records=len(records),
                total_amount=sum(r.amount for r in records),
                checked_count=sum(1 for r in records if r.check_status == "checked"),
                unchecked_count=sum(1 for r in records if r.check_status == "unchecked"),
            )
        )
    return result


@router.get("/{guestbook_id}", response_model=GuestbookResponse)
def get_guestbook(guestbook_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    gb = db.query(Guestbook).filter(Guestbook.id == guestbook_id).first()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")
    return gb


@router.post("/", response_model=int)
def create_guestbook(
    body: GuestbookCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    gb = Guestbook(**body.model_dump())
    db.add(gb)
    db.commit()
    db.refresh(gb)
    return gb.id


@router.put("/{guestbook_id}")
def update_guestbook(
    guestbook_id: int,
    body: GuestbookUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    gb = db.query(Guestbook).filter(Guestbook.id == guestbook_id).first()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(gb, k, v)
    db.commit()
    return {"message": "已更新"}


@router.delete("/{guestbook_id}")
def delete_guestbook(
    guestbook_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    gb = db.query(Guestbook).filter(Guestbook.id == guestbook_id).first()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")
    record_count = db.query(GbRecord).filter(GbRecord.guestbook_id == guestbook_id).count()
    if record_count > 0:
        raise HTTPException(status_code=400, detail="该礼簿已有收礼记录，请先导出备份后再删除")
    db.delete(gb)
    db.commit()
    return {"message": "已删除"}


@router.post("/{guestbook_id}/complete")
def complete_guestbook(
    guestbook_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    gb = db.query(Guestbook).filter(Guestbook.id == guestbook_id).first()
    if not gb:
        raise HTTPException(status_code=404, detail="礼簿不存在")
    gb.status = "已完成"
    gb.completed_at = datetime.utcnow()
    db.commit()
    return {"message": "已结束"}


@router.get("/{guestbook_id}/summary")
def guestbook_summary(guestbook_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    records = db.query(GbRecord).filter(GbRecord.guestbook_id == guestbook_id).all()
    return {
        "total_records": len(records),
        "total_amount": sum(r.amount for r in records),
        "checked_count": sum(1 for r in records if r.check_status == "checked"),
        "unchecked_count": sum(1 for r in records if r.check_status == "unchecked"),
    }
