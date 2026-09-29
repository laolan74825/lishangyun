from datetime import timedelta

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession
from app.core.email_service import send_verification_email
from app.core.security import hash_password, verify_password
from app.core.time import utcnow
from app.models.email_verification_code import EmailVerificationCode
from app.models.security_email import SecurityEmail
from app.models.user import User
from app.schemas.account import (
    AccountDeleteRequest,
    ProfileResponse,
    ProfileUpdate,
    SecurityEmailAdd,
    SecurityEmailItem,
)
from app.schemas.auth import SendVerificationCodeRequest

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/profile", response_model=ProfileResponse)
async def get_profile(current_user: CurrentUser):
    return current_user


@router.put("/profile")
async def update_profile(
    body: ProfileUpdate,
    current_user: CurrentUser,
    db: DbSession,
):
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(current_user, k, v)
    current_user.updated_at = utcnow()
    await db.commit()
    return {"message": "已更新"}


@router.get("/security-emails", response_model=list[SecurityEmailItem])
async def list_security_emails(current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(SecurityEmail).where(SecurityEmail.user_id == current_user.id)
        .order_by(SecurityEmail.is_primary.desc(), SecurityEmail.id)
    )
    return result.scalars().all()


@router.post("/security-emails/send-code")
async def send_email_code(
    body: SendVerificationCodeRequest,
    db: DbSession,
):
    email = body.email.strip().lower()

    result = await db.execute(
        select(SecurityEmail).where(
            SecurityEmail.email == email,
            SecurityEmail.user_id.isnot(None),
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该邮箱已被其他账户使用")

    existing = await db.execute(
        select(EmailVerificationCode).where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.used == False,
            EmailVerificationCode.expires_at > utcnow(),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=429, detail="验证码已发送，请查看邮箱或稍后再试")

    from app.api.auth import _get_smtp_config
    smtp_host, smtp_port, smtp_user, smtp_pass = await _get_smtp_config(db)

    code = "".join(__import__("random").choices("0123456789", k=6))
    vc = EmailVerificationCode(email=email, code=code, expires_at=utcnow() + timedelta(minutes=1))
    db.add(vc)
    await db.commit()

    try:
        send_verification_email(email, code, smtp_host, smtp_port, smtp_user, smtp_pass)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"邮件发送失败: {str(e)}")

    return {"message": "验证码已发送"}


@router.post("/security-emails")
async def add_security_email(
    body: SecurityEmailAdd,
    current_user: CurrentUser,
    db: DbSession,
):
    email = body.email.strip().lower()

    result = await db.execute(
        select(EmailVerificationCode).where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.code == body.code,
            EmailVerificationCode.used == False,
            EmailVerificationCode.expires_at > utcnow(),
        )
    )
    vc = result.scalar_one_or_none()
    if not vc:
        raise HTTPException(status_code=400, detail="验证码无效或已过期")
    vc.used = True

    existing = await db.execute(
        select(SecurityEmail).where(
            SecurityEmail.user_id == current_user.id,
            SecurityEmail.email == email,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该邮箱已添加")

    is_primary = not bool(
        (await db.execute(
            select(SecurityEmail).where(SecurityEmail.user_id == current_user.id)
        )).scalar_one_or_none()
    )

    se = SecurityEmail(
        user_id=current_user.id,
        email=email,
        is_primary=is_primary,
        is_verified=True,
        verified_at=utcnow(),
    )
    db.add(se)
    await db.commit()
    return {"message": "安全邮箱已添加"}


@router.delete("/security-emails/{email_id}")
async def remove_security_email(
    email_id: int,
    current_user: CurrentUser,
    db: DbSession,
):
    result = await db.execute(
        select(SecurityEmail).where(
            SecurityEmail.id == email_id,
            SecurityEmail.user_id == current_user.id,
        )
    )
    se = result.scalar_one_or_none()
    if not se:
        raise HTTPException(status_code=404, detail="邮箱不存在")
    if se.is_primary:
        raise HTTPException(status_code=400, detail="不能删除主安全邮箱")

    await db.delete(se)
    await db.commit()
    return {"message": "已删除"}


@router.post("/delete")
async def delete_account(
    body: AccountDeleteRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    if not verify_password(body.password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="密码错误")

    current_user.is_deleted = True
    current_user.is_active = False
    current_user.deleted_at = utcnow()
    current_user.password_hash = hash_password("")
    await db.commit()
    return {"message": "账户已注销"}
