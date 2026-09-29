from datetime import datetime
from app.core.time import utcnow
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession, require_role
from app.models.terminal_settings import TerminalSettings
from app.models.user import User
from app.schemas.terminal_settings import TerminalSettingsRead, TerminalSettingsUpsert

router = APIRouter(prefix="/terminal-settings", tags=["terminal-settings"])

EditorUser = Annotated[User, Depends(require_role("super_admin", "admin", "user", "collaborator"))]


@router.get("/", response_model=TerminalSettingsRead | None)
async def get_settings(
    current_user: CurrentUser,
    db: DbSession,
    guestbook_id: int = Query(...),
    client_id: str = Query(...),
):
    result = await db.execute(
        select(TerminalSettings)
        .where(TerminalSettings.guestbook_id == guestbook_id, TerminalSettings.client_id == client_id)
    )
    return result.scalar_one_or_none()


@router.put("/")
async def save_settings(
    body: TerminalSettingsUpsert,
    db: DbSession,
    _: EditorUser,
    guestbook_id: int = Query(...),
):
    result = await db.execute(
        select(TerminalSettings)
        .where(TerminalSettings.guestbook_id == guestbook_id, TerminalSettings.client_id == body.client_id)
    )
    ts = result.scalar_one_or_none()
    if ts:
        ts.operator_name = body.operator_name
        ts.default_cash_account = body.default_cash_account
        ts.default_wechat_account = body.default_wechat_account
        ts.updated_at = utcnow()
    else:
        ts = TerminalSettings(
            guestbook_id=guestbook_id,
            client_id=body.client_id,
            operator_name=body.operator_name,
            default_cash_account=body.default_cash_account,
            default_wechat_account=body.default_wechat_account,
        )
        db.add(ts)
    await db.commit()
    return {"message": "已保存"}
