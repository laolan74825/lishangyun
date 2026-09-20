from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_value, encrypt_value
from app.core.dependencies import require_role
from app.core.security import hash_password
from app.database import get_db
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.schemas.auth import UserInfo


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "editor"
    email: str | None = None


router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[UserInfo])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    return [UserInfo.model_validate(u) for u in db.query(User).all()]


@router.post("/users", response_model=UserInfo)
def create_user(
    body: CreateUserRequest = Body(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin")),
):
    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="用户名已存在")
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        email=body.email,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserInfo.model_validate(user)


class UpdateUserRequest(BaseModel):
    role: str | None = None
    is_active: bool | None = None
    email: str | None = None


@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    body: UpdateUserRequest = Body(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.email is not None:
        user.email = body.email
    user.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "已更新"}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能删除自己")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    db.delete(user)
    db.commit()
    return {"message": "已删除"}


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    rows = db.query(SystemSetting).all()
    result = {}
    for row in rows:
        if row.key == "smtp_password_enc":
            result["smtp_password_set"] = bool(row.value)
        else:
            result[row.key] = row.value
    return result


class UpdateSettingsRequest(BaseModel):
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_password: str | None = None


@router.put("/settings")
def update_settings(
    body: UpdateSettingsRequest = Body(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin")),
):
    def _set(key: str, value: str):
        row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if row:
            row.value = value
        else:
            db.add(SystemSetting(key=key, value=value))

    if body.smtp_host is not None:
        _set("smtp_host", body.smtp_host)
    if body.smtp_port is not None:
        _set("smtp_port", str(body.smtp_port))
    if body.smtp_user is not None:
        _set("smtp_user", body.smtp_user)
    if body.smtp_password is not None:
        _set("smtp_password_enc", encrypt_value(body.smtp_password))

    db.commit()
    return {"message": "已更新"}
