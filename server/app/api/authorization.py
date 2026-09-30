import secrets

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession
from app.core.helpers import paginate_query
from app.core.time import utcnow
from app.models.authorization_action_log import AuthorizationActionLog
from app.models.authorization_code import AuthorizationCode
from app.models.guestbook import Guestbook
from app.schemas.authorization_code import (
    AuthorizationActionLogResponse,
    AuthorizationCodeBindRequest,
    AuthorizationCodeCreate,
    AuthorizationCodeResponse,
)

router = APIRouter(prefix="/authorization", tags=["authorization"])


def _generate_code() -> str:
    return secrets.token_urlsafe(16)[:16].upper()


@router.post("/codes", response_model=dict)
async def create_code(body: AuthorizationCodeCreate, db: DbSession, current_user: CurrentUser):
    print(f"[DEBUG] create_code called with: guestbook_id={body.guestbook_id}, grantee_name={body.grantee_name}")
    result = await db.execute(
        select(Guestbook).where(
            Guestbook.id == body.guestbook_id,
            Guestbook.owner_id == current_user.id,
            Guestbook.is_deleted == False,
        )
    )
    guestbook = result.scalar_one_or_none()
    print(f"[DEBUG] guestbook found: {guestbook}")
    if not guestbook:
        raise HTTPException(404, "礼簿不存在")

    expires_at = body.expires_at
    if expires_at.tzinfo is not None:
        expires_at = expires_at.replace(tzinfo=None)
    print(f"[DEBUG] expires_at: {expires_at}, utcnow: {utcnow()}")

    if expires_at <= utcnow():
        raise HTTPException(400, "过期时间不能早于当前时间")

    code = AuthorizationCode(
        owner_id=current_user.id,
        guestbook_id=body.guestbook_id,
        code=_generate_code(),
        grantee_name=body.grantee_name,
        grantee_account_id=body.grantee_account_id,
        permissions=body.permissions,
        expires_at=expires_at,
        status="active",
    )
    print(f"[DEBUG] adding code to db")
    db.add(code)
    await db.flush()
    print(f"[DEBUG] code flushed, id={code.id}")

    log = AuthorizationActionLog(
        authorization_code_id=code.id,
        action_type="GENERATE",
        operator_name=current_user.nickname or current_user.username,
        detail=f"生成授权码，被授权人：{body.grantee_name}，权限：{body.permissions}",
    )
    db.add(log)
    await db.commit()
    print(f"[DEBUG] committed, returning code={code.code}")
    return {"id": code.id, "code": code.code}


@router.get("/codes", response_model=list[AuthorizationCodeResponse])
async def list_codes(
    db: DbSession, current_user: CurrentUser,
    guestbook_id: int | None = None,
    status: str | None = None,
):
    stmt = select(AuthorizationCode).where(AuthorizationCode.owner_id == current_user.id)
    if guestbook_id:
        stmt = stmt.where(AuthorizationCode.guestbook_id == guestbook_id)
    if status:
        stmt = stmt.where(AuthorizationCode.status == status)
    stmt = stmt.order_by(AuthorizationCode.created_at.desc())

    result = await db.execute(stmt)
    codes = result.scalars().all()

    now = utcnow()
    for c in codes:
        if c.status == "active" and c.expires_at < now:
            c.status = "expired"

    await db.commit()
    return codes


@router.get("/codes/{code_id}", response_model=AuthorizationCodeResponse)
async def get_code(code_id: int, db: DbSession, current_user: CurrentUser):
    result = await db.execute(
        select(AuthorizationCode).where(
            AuthorizationCode.id == code_id,
            AuthorizationCode.owner_id == current_user.id,
        )
    )
    code = result.scalar_one_or_none()
    if not code:
        raise HTTPException(404, "授权码不存在")

    if code.status == "active" and code.expires_at < utcnow():
        code.status = "expired"
        await db.commit()

    return code


@router.post("/codes/bind")
async def bind_code(body: AuthorizationCodeBindRequest, db: DbSession, current_user: CurrentUser):
    result = await db.execute(
        select(AuthorizationCode).where(AuthorizationCode.code == body.code)
    )
    code = result.scalar_one_or_none()
    if not code:
        raise HTTPException(404, "授权码无效")

    if code.status != "active":
        raise HTTPException(400, f"授权码状态为 {code.status}，无法绑定")

    if code.expires_at < utcnow():
        code.status = "expired"
        await db.commit()
        raise HTTPException(400, "授权码已过期")

    if body.grantor_account_id != code.owner_id:
        raise HTTPException(403, "授权人账户 ID 不匹配")

    if current_user.id != code.grantee_account_id:
        raise HTTPException(403, "当前用户不是被授权人")

    code.status = "bound"
    code.grantee_user_id = current_user.id
    code.bound_at = utcnow()

    log = AuthorizationActionLog(
        authorization_code_id=code.id,
        action_type="BIND",
        operator_name=current_user.nickname or current_user.username,
        grantee_user_id=current_user.id,
        detail=f"绑定授权码，被授权人：{code.grantee_name}",
    )
    db.add(log)
    await db.commit()
    return {"message": "授权码绑定成功", "guestbook_id": code.guestbook_id, "permissions": code.permissions}


@router.post("/codes/{code_id}/revoke")
async def revoke_code(code_id: int, db: DbSession, current_user: CurrentUser):
    result = await db.execute(
        select(AuthorizationCode).where(
            AuthorizationCode.id == code_id,
            AuthorizationCode.owner_id == current_user.id,
        )
    )
    code = result.scalar_one_or_none()
    if not code:
        raise HTTPException(404, "授权码不存在")

    if code.status == "revoked":
        raise HTTPException(400, "授权码已被撤销")

    old_status = code.status
    code.status = "revoked"

    log = AuthorizationActionLog(
        authorization_code_id=code.id,
        action_type="REVOKE",
        operator_name=current_user.nickname or current_user.username,
        grantee_user_id=code.grantee_user_id,
        detail=f"撤销授权码（原状态：{old_status}），被授权人：{code.grantee_name}",
    )
    db.add(log)
    await db.commit()
    return {"message": "授权码已撤销"}


@router.get("/codes/{code_id}/logs", response_model=list[AuthorizationActionLogResponse])
async def list_code_logs(
    code_id: int, db: DbSession, current_user: CurrentUser,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
):
    code_result = await db.execute(
        select(AuthorizationCode).where(
            AuthorizationCode.id == code_id,
            AuthorizationCode.owner_id == current_user.id,
        )
    )
    if not code_result.scalar_one_or_none():
        raise HTTPException(404, "授权码不存在")

    stmt = (
        select(AuthorizationActionLog)
        .where(AuthorizationActionLog.authorization_code_id == code_id)
        .order_by(AuthorizationActionLog.created_at.desc())
    )
    items, _ = await paginate_query(db, stmt, page, page_size)
    return items
