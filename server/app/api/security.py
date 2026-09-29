from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession
from app.core.helpers import write_audit_log
from app.models.user_key_config import UserKeyConfig
from app.schemas.user_key_config import (
    EnhancedModeEnableRequest,
    FamilyKeyUploadRequest,
    MnemonicVerifyRequest,
    SecurityConfigResponse,
    UserKeyConfigResponse,
)

router = APIRouter(prefix="/security", tags=["security"])


async def _get_or_create_config(db: DbSession, user_id: int) -> UserKeyConfig:
    result = await db.execute(
        select(UserKeyConfig).where(UserKeyConfig.user_id == user_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        config = UserKeyConfig(user_id=user_id, security_mode="normal")
        db.add(config)
        await db.flush()
    return config


@router.get("/config", response_model=SecurityConfigResponse)
async def get_security_config(current_user: CurrentUser, db: DbSession):
    config = await _get_or_create_config(db, current_user.id)
    return SecurityConfigResponse(
        security_mode=config.security_mode,
        has_encrypted_key=config.encrypted_key is not None,
        has_mnemonic_hash=config.mnemonic_hash is not None,
        has_encrypted_family_key=config.encrypted_family_key is not None,
        is_active=config.is_active,
    )


@router.get("/config/detail", response_model=UserKeyConfigResponse)
async def get_security_config_detail(current_user: CurrentUser, db: DbSession):
    config = await _get_or_create_config(db, current_user.id)
    return UserKeyConfigResponse(
        id=config.id,
        user_id=config.user_id,
        security_mode=config.security_mode,
        has_encrypted_key=config.encrypted_key is not None,
        has_mnemonic_hash=config.mnemonic_hash is not None,
        has_encrypted_family_key=config.encrypted_family_key is not None,
        is_active=config.is_active,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@router.post("/enable-enhanced")
async def enable_enhanced_mode(body: EnhancedModeEnableRequest, current_user: CurrentUser, db: DbSession):
    config = await _get_or_create_config(db, current_user.id)

    if config.security_mode == "enhanced" and config.is_active:
        raise HTTPException(400, "已处于增强安全模式")

    old_mode = config.security_mode
    config.security_mode = "enhanced"
    config.encrypted_key = body.encrypted_key
    config.mnemonic_hash = body.mnemonic_hash
    config.is_active = True

    write_audit_log(
        db, owner_id=current_user.id,
        target_table="user_key_config", target_id=config.id,
        action_type="SECURITY_SWITCH",
        before={"security_mode": old_mode},
        after={"security_mode": "enhanced"},
        note="Switched from normal to enhanced security mode",
    )

    await db.commit()
    return {"message": "增强安全模式已启用"}


@router.post("/verify-mnemonic")
async def verify_mnemonic(body: MnemonicVerifyRequest, current_user: CurrentUser, db: DbSession):
    config = await _get_or_create_config(db, current_user.id)

    if config.security_mode != "enhanced" or not config.is_active:
        raise HTTPException(400, "当前未启用增强安全模式")

    if not config.mnemonic_hash:
        raise HTTPException(400, "未设置助记词")

    if body.mnemonic_hash != config.mnemonic_hash:
        raise HTTPException(401, "助记词验证失败")

    return {"message": "助记词验证成功"}


@router.post("/disable-enhanced")
async def disable_enhanced_mode(body: MnemonicVerifyRequest, current_user: CurrentUser, db: DbSession):
    config = await _get_or_create_config(db, current_user.id)

    if config.security_mode != "enhanced" or not config.is_active:
        raise HTTPException(400, "当前未启用增强安全模式")

    if not config.mnemonic_hash:
        raise HTTPException(400, "未设置助记词")

    if body.mnemonic_hash != config.mnemonic_hash:
        raise HTTPException(401, "助记词验证失败，无法切换")

    old_mode = config.security_mode
    config.security_mode = "normal"
    config.encrypted_key = None
    config.encrypted_family_key = None
    config.is_active = False

    write_audit_log(
        db, owner_id=current_user.id,
        target_table="user_key_config", target_id=config.id,
        action_type="SECURITY_SWITCH",
        before={"security_mode": old_mode, "is_active": True},
        after={"security_mode": "normal", "is_active": False},
        note="Switched from enhanced to normal security mode",
    )

    await db.commit()
    return {"message": "已切换为普通安全模式，客户端密钥缓存已清除"}


@router.post("/upload-family-key")
async def upload_family_key(body: FamilyKeyUploadRequest, current_user: CurrentUser, db: DbSession):
    config = await _get_or_create_config(db, current_user.id)

    if config.security_mode != "enhanced" or not config.is_active:
        raise HTTPException(400, "仅增强安全模式下可上传家庭密钥")

    config.encrypted_family_key = body.encrypted_family_key

    write_audit_log(
        db, owner_id=current_user.id,
        target_table="user_key_config", target_id=config.id,
        action_type="UPDATE",
        after={"has_encrypted_family_key": True},
        note="Uploaded encrypted family key",
    )

    await db.commit()
    return {"message": "家庭密钥已上传"}
