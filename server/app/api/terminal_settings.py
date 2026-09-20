from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.terminal_settings import TerminalSettings
from app.models.user import User

router = APIRouter(prefix="/terminal-settings", tags=["terminal-settings"])


@router.get("/")
def get_settings(
    guestbook_id: int = Query(...),
    client_id: str = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    ts = (
        db.query(TerminalSettings)
        .filter(TerminalSettings.guestbook_id == guestbook_id, TerminalSettings.client_id == client_id)
        .first()
    )
    if not ts:
        return None
    return {
        "id": ts.id,
        "guestbook_id": ts.guestbook_id,
        "client_id": ts.client_id,
        "operator_name": ts.operator_name,
        "default_cash_account": ts.default_cash_account,
        "default_wechat_account": ts.default_wechat_account,
        "updated_at": ts.updated_at.isoformat() if ts.updated_at else None,
    }


@router.put("/")
def save_settings(
    guestbook_id: int,
    client_id: str,
    operator_name: str,
    default_cash_account: int | None = None,
    default_wechat_account: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    ts = (
        db.query(TerminalSettings)
        .filter(TerminalSettings.guestbook_id == guestbook_id, TerminalSettings.client_id == client_id)
        .first()
    )
    if ts:
        ts.operator_name = operator_name
        ts.default_cash_account = default_cash_account
        ts.default_wechat_account = default_wechat_account
        ts.updated_at = datetime.utcnow()
    else:
        ts = TerminalSettings(
            guestbook_id=guestbook_id,
            client_id=client_id,
            operator_name=operator_name,
            default_cash_account=default_cash_account,
            default_wechat_account=default_wechat_account,
        )
        db.add(ts)
    db.commit()
    return {"message": "已保存"}
