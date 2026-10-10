from datetime import datetime
from app.core.time import utcnow
from app.core.user_id import add_user_with_generated_id
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
    # 只能创建一般用户或系统管理员；系统管理员仅超级管理员可创建
    role: str = Field("user", pattern="^(admin|user)$")
    nickname: str | None = Field(None, max_length=50)
    email: str | None = Field(None, max_length=100)


class UpdateUserRequest(BaseModel):
    # 授权/降级只能在 一般用户 与 系统管理员 之间进行，仅超级管理员可操作
    role: str | None = Field(None, pattern="^(admin|user)$")
    is_active: bool | None = None
    email: str | None = None
    nickname: str | None = None


class UpdateSettingsRequest(BaseModel):
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_password: str | None = None
    # 短信服务：mode 为 mock（只记日志，开发联调）或 aliyun（真实发送）
    sms_mode: str | None = Field(None, pattern="^(mock|aliyun)$")
    sms_access_key_id: str | None = None
    sms_access_key_secret: str | None = None
    sms_sign_name: str | None = None
    sms_template_code: str | None = None


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
    current_user: AdminUser = ...,
):
    result = await db.execute(select(User).where(User.username == body.username))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="用户名已存在")
    if body.role == "admin" and current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="只有超级管理员可以创建系统管理员")
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        nickname=body.nickname,
        email=body.email,
    )
    await add_user_with_generated_id(db, user)
    await db.commit()
    await db.refresh(user)
    return UserInfo.model_validate(user)


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    body: UpdateUserRequest = Body(...),
    db: DbSession = ...,
    current_user: AdminUser = ...,
):
    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    # 超级管理员账户受保护：不允许被禁用，也不允许被调整角色
    if user.role == "super_admin" and (body.role is not None or body.is_active is not None):
        raise HTTPException(status_code=400, detail="不能修改超级管理员的角色或状态")
    if body.role is not None:
        # 给一般用户授权为系统管理员 / 收回授权，仅超级管理员可操作
        if current_user.role != "super_admin":
            raise HTTPException(status_code=403, detail="只有超级管理员可以调整用户角色")
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
    if user.role == "super_admin":
        raise HTTPException(status_code=400, detail="不能删除超级管理员")
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
        elif row.key == "sms_access_key_secret_enc":
            result_dict["sms_access_key_secret_set"] = bool(row.value)
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
    if body.sms_mode is not None:
        await _set("sms_mode", body.sms_mode)
    if body.sms_access_key_id is not None:
        await _set("sms_access_key_id", body.sms_access_key_id)
    if body.sms_access_key_secret is not None:
        await _set("sms_access_key_secret_enc", encrypt_value(body.sms_access_key_secret))
    if body.sms_sign_name is not None:
        await _set("sms_sign_name", body.sms_sign_name)
    if body.sms_template_code is not None:
        await _set("sms_template_code", body.sms_template_code)

    await db.commit()
    return {"message": "已更新"}
