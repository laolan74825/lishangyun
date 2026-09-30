import logging
import secrets
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

logger = logging.getLogger(__name__)
from sqlalchemy import delete, func, select

from app.core.crypto import decrypt_value, encrypt_value
from app.core.dependencies import CurrentUser, DbSession, get_current_user
from app.core.email_service import send_reset_email, send_verification_email
from app.core.rate_limit import login_attempts
from app.core.security import create_access_token, hash_password, needs_rehash, verify_password
from app.core.time import utcnow
from app.models.email_verification_code import EmailVerificationCode
from app.models.reset_code import ResetCode
from app.models.security_email import SecurityEmail
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RegisterRequest,
    SendVerificationCodeRequest,
    TokenResponse,
    UserInfo,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# 验证码有效期：10 分钟，给真实用户留足查收邮件的时间
CODE_EXPIRE_MINUTES = 10
# 同一邮箱的重发节流间隔（秒）
CODE_RESEND_INTERVAL_SECONDS = 60


@router.get("/status")
async def auth_status(db: DbSession):
    """Check if system needs initialization (no users exist)."""
    result = await db.execute(select(func.count(User.id)).where(User.is_deleted == False))
    user_count = result.scalar()
    return {"needs_init": user_count == 0, "user_count": user_count}


def _generate_code() -> str:
    """生成 6 位数字验证码（密码学安全随机数）。"""
    return "".join(str(secrets.randbelow(10)) for _ in range(6))


async def _enforce_resend_interval(db: DbSession, model, email: str) -> None:
    """同一邮箱在节流间隔内只允许发一次验证码；超过间隔则清除旧的未使用验证码。"""
    result = await db.execute(
        select(model).where(
            model.email == email,
            model.used == False,
            model.expires_at > utcnow(),
        ).order_by(model.created_at.desc())
    )
    latest = result.scalars().first()
    if latest is None:
        return
    elapsed = (utcnow() - latest.created_at).total_seconds()
    if elapsed < CODE_RESEND_INTERVAL_SECONDS:
        remaining = int(CODE_RESEND_INTERVAL_SECONDS - elapsed) + 1
        raise HTTPException(status_code=429, detail=f"发送过于频繁，请 {remaining} 秒后再试")
    await db.execute(delete(model).where(model.email == email, model.used == False))


async def _get_smtp_config(db: DbSession) -> tuple[str, int, str, str]:
    keys = ("smtp_host", "smtp_port", "smtp_user", "smtp_password_enc")
    rows = {}
    for key in keys:
        result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
        row = result.scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=400, detail="邮件服务未配置，请联系管理员")
        rows[key] = row.value
    return rows["smtp_host"], int(rows["smtp_port"]), rows["smtp_user"], decrypt_value(rows["smtp_password_enc"])


@router.post("/send-verification-code")
async def send_email_verification_code(
    body: SendVerificationCodeRequest,
    db: DbSession,
):
    email = body.email.strip().lower()

    existing = await db.execute(
        select(SecurityEmail).where(
            SecurityEmail.email == email,
            SecurityEmail.is_verified == True,
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="该邮箱已被注册")

    await _enforce_resend_interval(db, EmailVerificationCode, email)

    smtp_host, smtp_port, smtp_user, smtp_pass = await _get_smtp_config(db)

    code = _generate_code()
    verification_code = EmailVerificationCode(
        email=email,
        code=code,
        expires_at=utcnow() + timedelta(minutes=CODE_EXPIRE_MINUTES),
    )
    db.add(verification_code)
    await db.commit()

    try:
        send_verification_email(email, code, smtp_host, smtp_port, smtp_user, smtp_pass)
    except Exception:
        logger.exception("发送邮箱验证码失败: email=%s", email)
        raise HTTPException(status_code=500, detail="邮件发送失败，请稍后再试")

    return {"message": "验证码已发送"}


async def _verify_email_code(db: DbSession, email: str, code: str) -> None:
    result = await db.execute(
        select(EmailVerificationCode).where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.code == code,
            EmailVerificationCode.used == False,
            EmailVerificationCode.expires_at > utcnow(),
        )
    )
    verification_code = result.scalars().first()
    if not verification_code:
        raise HTTPException(status_code=400, detail="邮箱验证码无效或已过期")
    verification_code.used = True


@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest, db: DbSession):
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "open_registration")
    )
    setting = result.scalar_one_or_none()
    if setting and setting.value == "false":
        raise HTTPException(status_code=400, detail="系统注册功能已关闭，请联系管理员")

    await _verify_email_code(db, body.security_email_1, body.security_email_1_code)

    if body.security_email_2:
        if not body.security_email_2_code:
            raise HTTPException(status_code=400, detail="备用安全邮箱需要提供验证码")
        await _verify_email_code(db, body.security_email_2, body.security_email_2_code)

    email_1 = body.security_email_1.strip().lower()
    existing_email = await db.execute(
        select(SecurityEmail).where(
            SecurityEmail.email == email_1,
            SecurityEmail.is_verified == True,
        )
    )
    if existing_email.scalars().first():
        raise HTTPException(status_code=409, detail="该邮箱已被注册，请使用其他邮箱或登录已有账户")

    result = await db.execute(select(User).where(User.is_deleted == False))
    existing_users = result.scalars().all()
    role = "super_admin" if len(existing_users) == 0 else "user"

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=role,
        nickname=body.nickname,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    security_email_1 = SecurityEmail(
        user_id=user.id,
        email=email_1,
        is_primary=True,
        is_verified=True,
    )
    db.add(security_email_1)

    if body.security_email_2:
        email_2 = body.security_email_2.strip().lower()
        security_email_2 = SecurityEmail(
            user_id=user.id,
            email=email_2,
            is_primary=False,
            is_verified=True,
        )
        db.add(security_email_2)

    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=UserInfo.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: DbSession):
    if login_attempts.is_locked(body.username):
        minutes = login_attempts.remaining_minutes(body.username)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"失败次数过多，账户已临时锁定，请约 {minutes} 分钟后重试",
        )

    result = await db.execute(
        select(User).where(User.username == body.username, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        login_attempts.record_failure(body.username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账户已被禁用")

    login_attempts.record_success(body.username)

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
        await db.commit()

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=UserInfo.model_validate(user))


@router.get("/me", response_model=UserInfo)
async def me(current_user: CurrentUser):
    return UserInfo.model_validate(current_user)


@router.put("/password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    if not verify_password(body.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="原密码错误")
    current_user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"message": "密码已修改"}


@router.post("/password-reset/request")
async def request_reset(
    body: PasswordResetRequest,
    bg: BackgroundTasks,
    db: DbSession,
):
    email = body.email.strip().lower()
    result = await db.execute(
        select(SecurityEmail).where(
            SecurityEmail.email == email,
            SecurityEmail.is_verified == True,
        )
    )
    security_email = result.scalars().first()
    if not security_email:
        return {"message": "如果该邮箱已注册并验证，验证码将稍后发送"}

    result = await db.execute(
        select(User).where(User.id == security_email.user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        return {"message": "如果该邮箱已注册并验证，验证码将稍后发送"}

    await _enforce_resend_interval(db, ResetCode, email)

    smtp_host_row = (await db.execute(select(SystemSetting).where(SystemSetting.key == "smtp_host"))).scalar_one_or_none()
    smtp_port_row = (await db.execute(select(SystemSetting).where(SystemSetting.key == "smtp_port"))).scalar_one_or_none()
    smtp_user_row = (await db.execute(select(SystemSetting).where(SystemSetting.key == "smtp_user"))).scalar_one_or_none()
    smtp_pass_row = (await db.execute(select(SystemSetting).where(SystemSetting.key == "smtp_password_enc"))).scalar_one_or_none()

    if not all([smtp_host_row, smtp_port_row, smtp_user_row, smtp_pass_row]):
        raise HTTPException(status_code=400, detail="邮件服务未配置，请联系管理员")

    code = _generate_code()
    reset_code = ResetCode(
        user_id=user.id,
        email=email,
        code=code,
        expires_at=utcnow() + timedelta(minutes=CODE_EXPIRE_MINUTES),
    )
    db.add(reset_code)
    await db.commit()

    bg.add_task(
        send_reset_email,
        email,
        code,
        smtp_host_row.value,
        int(smtp_port_row.value),
        smtp_user_row.value,
        decrypt_value(smtp_pass_row.value),
    )
    return {"message": "验证码已发送"}


@router.post("/password-reset/confirm")
async def confirm_reset(
    body: PasswordResetConfirm,
    db: DbSession,
):
    email = body.email.strip().lower()
    result = await db.execute(
        select(ResetCode).where(
            ResetCode.email == email,
            ResetCode.code == body.code,
            ResetCode.used == False,
            ResetCode.expires_at > utcnow(),
        )
    )
    reset_code = result.scalars().first()
    if not reset_code:
        raise HTTPException(status_code=400, detail="验证码无效或已过期")

    result = await db.execute(
        select(SecurityEmail).where(
            SecurityEmail.email == email,
            SecurityEmail.is_verified == True,
        )
    )
    security_email = result.scalars().first()
    if not security_email:
        raise HTTPException(status_code=400, detail="该邮箱未验证或不存在")

    result = await db.execute(
        select(User).where(User.id == security_email.user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="用户不存在")

    user.password_hash = hash_password(body.new_password)
    reset_code.used = True
    await db.commit()
    return {"message": "密码已重置"}


@router.get("/users/search")
async def search_users(
    current_user: CurrentUser,
    db: DbSession,
    q: str = "",
):
    if len(q) < 2:
        return []
    pattern = f"%{q}%"
    stmt = (
        select(User.id, User.username, User.nickname)
        .where(
            User.id != current_user.id,
            User.is_deleted == False,
            User.status == "active",
        )
        .where(
            (User.username.ilike(pattern)) | (User.nickname.ilike(pattern))
        )
        .limit(10)
    )
    result = await db.execute(stmt)
    return [{"id": r.id, "username": r.username, "nickname": r.nickname} for r in result]
