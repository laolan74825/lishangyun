import logging
import re
import secrets
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status

logger = logging.getLogger(__name__)
from sqlalchemy import delete, func, select

from app.core.crypto import decrypt_value, encrypt_value
from app.core.dependencies import CurrentUser, DbSession, get_current_user
from app.core.email_service import send_reset_email, send_verification_email
from app.core.sms import SmsSendError, send_sms_or_mock
from app.core.rate_limit import email_hint_attempts, login_attempts, username_check_attempts
from app.core.security import create_access_token, hash_password, needs_rehash, verify_password
from app.core.time import utcnow
from app.core.user_id import add_user_with_generated_id
from app.models.email_verification_code import EmailVerificationCode
from app.models.phone_verification_code import PhoneVerificationCode
from app.models.reset_code import ResetCode
from app.models.security_email import SecurityEmail
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    LockPinClearRequest,
    LockPinSetRequest,
    LockPinStatus,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetEmailHintRequest,
    PhonePasswordResetRequest,
    PasswordResetRequest,
    RegisterRequest,
    SendSmsCodeRequest,
    SendVerificationCodeRequest,
    TokenResponse,
    UserInfo,
    UsernameCheckRequest,
    VerifyLockPinRequest,
    VerifyPasswordRequest,
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


async def _enforce_resend_interval(db: DbSession, model, target: str, field: str = "email") -> None:
    """同一目标（邮箱/手机号）在节流间隔内只允许发一次验证码；超过间隔则清除旧的未使用验证码。"""
    result = await db.execute(
        select(model).where(
            getattr(model, field) == target,
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
    await db.execute(delete(model).where(getattr(model, field) == target, model.used == False))


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

async def _get_sms_config(db: DbSession) -> dict:
    """读取短信配置。sms_mode 必填：mock=只记日志（开发联调），aliyun=真实发送。"""
    keys = ("sms_mode", "sms_access_key_id", "sms_access_key_secret_enc", "sms_sign_name", "sms_template_code")
    rows = {}
    for key in keys:
        result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
        row = result.scalar_one_or_none()
        if row:
            rows[key] = row.value
    mode = rows.get("sms_mode")
    if mode not in ("mock", "aliyun"):
        raise HTTPException(status_code=400, detail="短信服务未配置，请联系管理员")
    return {
        "mode": mode,
        "access_key_id": rows.get("sms_access_key_id"),
        "access_key_secret": decrypt_value(rows["sms_access_key_secret_enc"]) if rows.get("sms_access_key_secret_enc") else None,
        "sign_name": rows.get("sms_sign_name"),
        "template_code": rows.get("sms_template_code"),
    }


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

@router.post("/send-sms-code")
async def send_sms_verification_code(
    body: SendSmsCodeRequest,
    db: DbSession,
):
    phone = body.phone.strip()

    existing = await db.execute(
        select(User).where(User.phone == phone, User.is_deleted == False)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="该手机号已被注册")

    await _enforce_resend_interval(db, PhoneVerificationCode, phone, field="phone")

    sms = await _get_sms_config(db)
    code = _generate_code()
    verification_code = PhoneVerificationCode(
        phone=phone,
        code=code,
        expires_at=utcnow() + timedelta(minutes=CODE_EXPIRE_MINUTES),
    )
    db.add(verification_code)
    await db.commit()

    try:
        send_sms_or_mock(phone, code, **sms)
    except SmsSendError as exc:
        logger.exception("发送短信验证码失败: phone=%s", phone)
        raise HTTPException(status_code=500, detail=str(exc))

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


async def _verify_phone_code(db: DbSession, phone: str, code: str) -> None:
    result = await db.execute(
        select(PhoneVerificationCode).where(
            PhoneVerificationCode.phone == phone,
            PhoneVerificationCode.code == code,
            PhoneVerificationCode.used == False,
            PhoneVerificationCode.expires_at > utcnow(),
        )
    )
    verification_code = result.scalars().first()
    if not verification_code:
        raise HTTPException(status_code=400, detail="短信验证码无效或已过期")
    verification_code.used = True


@router.post("/check-username")
async def check_username(body: UsernameCheckRequest, request: Request, db: DbSession):
    """注册页用户名失焦预检：即时反馈是否可用，减少"填完所有信息才被告知重名"的挫败。

    最终唯一性仍以 /register 服务端校验为准；按客户端 IP 限流防枚举
    （与 email-hint 同策略：查到被占用计失败，连续 login_max_attempts 次锁定）。
    """
    ip = request.client.host if request.client else "unknown"
    if username_check_attempts.is_locked(ip):
        minutes = username_check_attempts.remaining_minutes(ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"尝试次数过多，请约 {minutes} 分钟后再试",
        )

    username = body.username.strip()
    if len(username) < 3 or len(username) > 50:
        raise HTTPException(status_code=400, detail="用户名长度需为 3~50 个字符")

    result = await db.execute(
        select(User.id).where(User.username == username, User.is_deleted == False)
    )
    taken = result.scalar_one_or_none() is not None
    if taken:
        username_check_attempts.record_failure(ip)
    else:
        username_check_attempts.record_success(ip)
    return {"available": not taken}


async def _generate_auto_username(db: DbSession, user_id: int) -> str:
    """自动生成用户名：用户_<ID>；极小概率与手工注册的同名时追加随机后缀兜底。"""
    base = f"用户_{user_id}"
    for _ in range(3):
        result = await db.execute(select(User.id).where(User.username == base))
        if result.scalar_one_or_none() is None:
            return base
        base = f"用户_{user_id}_{secrets.token_hex(2)}"
    return f"用户_{user_id}_{secrets.token_hex(4)}"


@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest, db: DbSession):
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "open_registration")
    )
    setting = result.scalar_one_or_none()
    if setting and setting.value == "false":
        raise HTTPException(status_code=400, detail="系统注册功能已关闭，请联系管理员")

    phone = body.phone.strip()
    requested_username = body.username.strip() if body.username else ""

    # 唯一性预检：用户名与手机号都不得重复（数据库唯一索引兜底）
    if requested_username:
        if len(requested_username) < 3 or len(requested_username) > 50:
            raise HTTPException(status_code=400, detail="用户名长度需为 3~50 个字符")
        existing_user = await db.execute(
            select(User).where(User.username == requested_username, User.is_deleted == False)
        )
        if existing_user.scalars().first():
            raise HTTPException(status_code=409, detail="该用户名已被使用，请换一个")
    existing_phone = await db.execute(
        select(User).where(User.phone == phone, User.is_deleted == False)
    )
    if existing_phone.scalars().first():
        raise HTTPException(status_code=409, detail="该手机号已被注册，请直接登录或换号")

    await _verify_phone_code(db, phone, body.phone_code)

    result = await db.execute(select(User).where(User.is_deleted == False))
    existing_users = result.scalars().all()
    role = "super_admin" if len(existing_users) == 0 else "user"

    # 用户名选填：留空时先写占位值拿到自增 ID，再替换为 用户_<ID>
    user = User(
        username=requested_username or f"tmp_{secrets.token_hex(8)}",
        password_hash=hash_password(body.password),
        role=role,
        nickname=body.nickname,
        phone=phone,
        is_active=True,
    )
    await add_user_with_generated_id(db, user)
    if not requested_username:
        user.username = await _generate_auto_username(db, user.id)

    # 安全邮箱选填：注册阶段不强制验证，先记为未验证，
    # 用户后续在设置页完成验证后可用于找回密码
    if body.security_email_1:
        security_email = SecurityEmail(
            user_id=user.id,
            email=body.security_email_1.strip().lower(),
            is_primary=True,
            is_verified=False,
        )
        db.add(security_email)

    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=UserInfo.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: DbSession):
    account = body.username.strip()

    if login_attempts.is_locked(account):
        minutes = login_attempts.remaining_minutes(account)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"失败次数过多，账户已临时锁定，请约 {minutes} 分钟后重试",
        )

    # 按格式识别登录凭证：手机号形态优先按手机号查；
    # 用户名允许纯数字，手机号查不到时回退按用户名查
    user = None
    if re.fullmatch(r"1[3-9]\d{9}", account):
        result = await db.execute(
            select(User).where(User.phone == account, User.is_deleted == False)
        )
        user = result.scalar_one_or_none()
    if user is None:
        result = await db.execute(
            select(User).where(User.username == account, User.is_deleted == False)
        )
        user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        login_attempts.record_failure(account)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账户已被禁用")

    login_attempts.record_success(account)

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


@router.post("/password-reset/email-hint")
async def password_reset_email_hint(
    body: PasswordResetEmailHintRequest,
    request: Request,
    db: DbSession,
):
    """根据用户名返回掩码后的安全邮箱，帮助用户回忆应输入哪个邮箱。

    只暴露掩码（保留前 1-2 个字符 + 完整域名），不泄露完整地址。
    用户不存在或未绑定安全邮箱时返回 masked_email=null，与成功响应同构（均 200），
    避免通过状态码差异枚举用户名；按客户端 IP 限流防批量探测。
    """
    ip = request.client.host if request.client else "unknown"
    if email_hint_attempts.is_locked(ip):
        minutes = email_hint_attempts.remaining_minutes(ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"尝试次数过多，请约 {minutes} 分钟后再试",
        )

    username = body.username.strip()
    result = await db.execute(
        select(User).where(User.username == username, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if user:
        email_result = await db.execute(
            select(SecurityEmail)
            .where(SecurityEmail.user_id == user.id, SecurityEmail.is_verified == True)
            .order_by(SecurityEmail.is_primary.desc(), SecurityEmail.id)
            .limit(1)
        )
        security_email = email_result.scalar_one_or_none()
        if security_email:
            email_hint_attempts.record_success(ip)
            return {"masked_email": _mask_email(security_email.email)}

    email_hint_attempts.record_failure(ip)
    return {"masked_email": None}


def _mask_email(email: str) -> str:
    """邮箱掩码：保留用户名前 1-2 位，其余以 *** 代替，域名保留完整。"""
    local, sep, domain = email.partition("@")
    if not sep or not domain:
        return "***"
    head = local[:2] if len(local) > 4 else local[:1]
    return f"{head}***@{domain}"


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

@router.post("/password-reset/request-phone")
async def request_reset_phone(
    body: PhonePasswordResetRequest,
    db: DbSession,
):
    """手机号找回密码：向该手机号发送短信验证码。

    手机号未注册时返回与成功相同的模糊文案，不泄露号码是否已注册。
    """
    phone = body.phone.strip()
    result = await db.execute(
        select(User).where(User.phone == phone, User.is_deleted == False)
    )
    user = result.scalars().first()
    if not user:
        return {"message": "如果该手机号已注册，验证码将稍后发送"}

    await _enforce_resend_interval(db, ResetCode, phone, field="phone")

    sms = await _get_sms_config(db)
    code = _generate_code()
    reset_code = ResetCode(
        user_id=user.id,
        phone=phone,
        code=code,
        expires_at=utcnow() + timedelta(minutes=CODE_EXPIRE_MINUTES),
    )
    db.add(reset_code)
    await db.commit()

    try:
        send_sms_or_mock(phone, code, **sms)
    except SmsSendError as exc:
        logger.exception("发送密码重置短信失败: phone=%s", phone)
        raise HTTPException(status_code=500, detail=str(exc))

    return {"message": "验证码已发送"}


@router.post("/password-reset/confirm")
async def confirm_reset(
    body: PasswordResetConfirm,
    db: DbSession,
):
    if body.phone:
        phone = body.phone.strip()
        result = await db.execute(
            select(ResetCode).where(
                ResetCode.phone == phone,
                ResetCode.code == body.code,
                ResetCode.used == False,
                ResetCode.expires_at > utcnow(),
            )
        )
        reset_code = result.scalars().first()
        if not reset_code:
            raise HTTPException(status_code=400, detail="验证码无效或已过期")
        result = await db.execute(
            select(User).where(User.id == reset_code.user_id, User.is_deleted == False)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=400, detail="用户不存在")
    else:
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


# 锁屏解锁：校验当前登录密码（锁屏组件在用的入口，失败统一 400 由前端提示）
@router.post("/verify-password")
async def verify_password_endpoint(
    body: VerifyPasswordRequest,
    current_user: CurrentUser,
):
    if not verify_password(body.password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="密码错误")
    return {"valid": True}


@router.get("/lock-pin", response_model=LockPinStatus)
async def get_lock_pin_status(current_user: CurrentUser):
    return LockPinStatus(enabled=current_user.lock_pin_hash is not None)


@router.post("/lock-pin")
async def set_lock_pin(
    body: LockPinSetRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    if not verify_password(body.password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="登录密码错误")
    current_user.lock_pin_hash = hash_password(body.pin)
    current_user.updated_at = utcnow()
    await db.commit()
    return {"message": "锁屏密码已设置"}


@router.delete("/lock-pin")
async def clear_lock_pin(
    body: LockPinClearRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    if not verify_password(body.password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="登录密码错误")
    current_user.lock_pin_hash = None
    current_user.updated_at = utcnow()
    await db.commit()
    return {"message": "锁屏密码已清除"}


@router.post("/verify-lock-pin")
async def verify_lock_pin(
    body: VerifyLockPinRequest,
    current_user: CurrentUser,
):
    if not current_user.lock_pin_hash or not verify_password(body.pin, current_user.lock_pin_hash):
        raise HTTPException(status_code=400, detail="锁屏密码错误")
    return {"valid": True}
