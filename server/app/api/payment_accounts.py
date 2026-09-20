from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.payment_account import PaymentAccount
from app.models.gb_record import GbRecord
from app.models.user import User
from app.schemas.payment_account import PaymentAccountCreate, PaymentAccountResponse, PaymentAccountUpdate

router = APIRouter(prefix="/payment-accounts", tags=["payment-accounts"])


@router.get("/", response_model=list[PaymentAccountResponse])
def list_accounts(
    type: str | None = None,
    active_only: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(PaymentAccount)
    if type:
        q = q.filter(PaymentAccount.type == type)
    if active_only:
        q = q.filter(PaymentAccount.is_active == True)
    return q.all()


@router.get("/{account_id}", response_model=PaymentAccountResponse)
def get_account(account_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    account = db.query(PaymentAccount).filter(PaymentAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账户不存在")
    return account


@router.post("/", response_model=int)
def create_account(
    body: PaymentAccountCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    account = PaymentAccount(**body.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return account.id


@router.put("/{account_id}")
def update_account(
    account_id: int,
    body: PaymentAccountUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    account = db.query(PaymentAccount).filter(PaymentAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账户不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(account, k, v)
    db.commit()
    return {"message": "已更新"}


@router.delete("/{account_id}")
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    account = db.query(PaymentAccount).filter(PaymentAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账户不存在")
    db.delete(account)
    db.commit()
    return {"message": "已删除"}


@router.get("/{account_id}/received-today")
def received_today(
    account_id: int,
    date: str = Query(..., description="YYYY-MM-DD"),
    guestbook_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    start = f"{date}T00:00:00"
    end = f"{date}T23:59:59"
    q = db.query(GbRecord).filter(
        GbRecord.account_id == account_id,
        GbRecord.record_time >= start,
        GbRecord.record_time <= end,
    )
    if guestbook_id is not None:
        q = q.filter(GbRecord.guestbook_id == guestbook_id)
    records = q.all()
    total = sum(r.amount for r in records)
    return {"received": total}
