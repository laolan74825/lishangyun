from datetime import datetime
from app.core.time import utcnow
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.crypto import decrypt_value, encrypt_value
from app.core.dependencies import CurrentUser, DbSession, require_role
from app.core.helpers import paginate_query
from app.core.security import hash_password
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.schemas.auth import UserInfo
from app.schemas.common import PaginatedResponse


class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=128)
    role: str = Field("user", pattern="^(super_admin|admin|user|family_member|collaborator)$")
    nickname: str | None = Field(None, max_length=50)
    email: str | None = Field(None, max_length=100)


class UpdateUserRequest(BaseModel):
    role: str | None = Field(None, pattern="^(super_admin|admin|user|family_member|collaborator)$")
    is_active: bool | None = None
    email: str | None = None
    nickname: str | None = None


class UpdateSettingsRequest(BaseModel):
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_password: str | None = None


AdminUser = Annotated[User, Depends(require_role("super_admin", "admin"))]

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=PaginatedResponse[UserInfo])
async def list_users(
    db: DbSession,
    _: AdminUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    stmt = select(User).where(User.is_deleted == False).order_by(User.id)
    items, pagination = await paginate_query(db, stmt, page, page_size)
    user_items = [UserInfo.model_validate(u) for u in items]
    return PaginatedResponse(items=user_items, pagination=pagination)


@router.post("/users", response_model=UserInfo)
async def create_user(
    body: CreateUserRequest = Body(...),
    db: DbSession = ...,
    _: AdminUser = ...,
):
    result = await db.execute(select(User).where(User.username == body.username))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="用户名已存在")
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        nickname=body.nickname,
        email=body.email,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserInfo.model_validate(user)


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    body: UpdateUserRequest = Body(...),
    db: DbSession = ...,
    _: AdminUser = ...,
):
    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
        user.status = "active" if body.is_active else "disabled"
    if body.email is not None:
        user.email = body.email
    if body.nickname is not None:
        user.nickname = body.nickname
    user.updated_at = utcnow()
    await db.commit()
    return {"message": "已更新"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: AdminUser,
    db: DbSession,
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能删除自己")
    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.is_deleted = True
    user.deleted_at = utcnow()
    user.is_active = False
    user.status = "deactivated"
    await db.commit()
    return {"message": "已删除"}


@router.get("/settings")
async def get_settings(db: DbSession, _: AdminUser):
    result = await db.execute(select(SystemSetting))
    rows = result.scalars().all()
    result_dict = {}
    for row in rows:
        if row.key == "smtp_password_enc":
            result_dict["smtp_password_set"] = bool(row.value)
        else:
            result_dict[row.key] = row.value
    return result_dict


@router.put("/settings")
async def update_settings(
    body: UpdateSettingsRequest = Body(...),
    db: DbSession = ...,
    _: AdminUser = ...,
):
    async def _set(key: str, value: str):
        result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = value
        else:
            db.add(SystemSetting(key=key, value=value))

    if body.smtp_host is not None:
        await _set("smtp_host", body.smtp_host)
    if body.smtp_port is not None:
        await _set("smtp_port", str(body.smtp_port))
    if body.smtp_user is not None:
        await _set("smtp_user", body.smtp_user)
    if body.smtp_password is not None:
        await _set("smtp_password_enc", encrypt_value(body.smtp_password))

    await db.commit()
    return {"message": "已更新"}
