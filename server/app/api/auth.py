from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_value, encrypt_value
from app.core.dependencies import get_current_user
from app.core.email_service import send_reset_email
from app.core.security import create_access_token, hash_password, verify_password
from app.database import get_db
from app.models.reset_code import ResetCode
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RegisterRequest,
    TokenResponse,
    UserInfo,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    user_count = db.query(User).count()
    if user_count > 0:
        raise HTTPException(status_code=400, detail="系统已有管理员，请联系管理员创建账户")

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=UserInfo.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账户已被禁用")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=UserInfo.model_validate(user))


@router.get("/me", response_model=UserInfo)
def me(current_user: User = Depends(get_current_user)):
    return UserInfo.model_validate(current_user)


@router.put("/password")
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="原密码错误")
    current_user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"message": "密码已修改"}


@router.post("/password-reset/request")
def request_reset(
    body: PasswordResetRequest,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        return {"message": "如果该邮箱已注册，验证码将稍后发送"}

    smtp_host_row = db.query(SystemSetting).filter(SystemSetting.key == "smtp_host").first()
    smtp_port_row = db.query(SystemSetting).filter(SystemSetting.key == "smtp_port").first()
    smtp_user_row = db.query(SystemSetting).filter(SystemSetting.key == "smtp_user").first()
    smtp_pass_row = db.query(SystemSetting).filter(SystemSetting.key == "smtp_password_enc").first()

    if not all([smtp_host_row, smtp_port_row, smtp_user_row, smtp_pass_row]):
        raise HTTPException(status_code=400, detail="邮件服务未配置，请联系管理员")

    code = "".join(__import__("random").choices("0123456789", k=6))
    reset_code = ResetCode(
        email=body.email,
        code=code,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(reset_code)
    db.commit()

    bg.add_task(
        send_reset_email,
        body.email,
        code,
        smtp_host_row.value,
        int(smtp_port_row.value),
        smtp_user_row.value,
        decrypt_value(smtp_pass_row.value),
    )
    return {"message": "验证码已发送"}


@router.post("/password-reset/confirm")
def confirm_reset(
    body: PasswordResetConfirm,
    db: Session = Depends(get_db),
):
    reset_code = (
        db.query(ResetCode)
        .filter(
            ResetCode.email == body.email,
            ResetCode.code == body.code,
            ResetCode.used == False,
            ResetCode.expires_at > datetime.now(timezone.utc),
        )
        .first()
    )
    if not reset_code:
        raise HTTPException(status_code=400, detail="验证码无效或已过期")

    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="用户不存在")

    user.password_hash = hash_password(body.new_password)
    reset_code.used = True
    db.commit()
    return {"message": "密码已重置"}
