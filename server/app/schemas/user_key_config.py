from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class UserKeyConfigResponse(BaseModel):
    id: int
    user_id: int
    security_mode: str
    has_encrypted_key: bool
    has_mnemonic_hash: bool
    has_encrypted_family_key: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EnhancedModeEnableRequest(BaseModel):
    encrypted_key: str = Field(..., min_length=1)
    mnemonic_hash: str = Field(..., min_length=1)


class MnemonicVerifyRequest(BaseModel):
    mnemonic_hash: str = Field(..., min_length=1)


class FamilyKeyUploadRequest(BaseModel):
    encrypted_family_key: str = Field(..., min_length=1)


class SecurityConfigResponse(BaseModel):
    security_mode: Literal["normal", "enhanced"]
    has_encrypted_key: bool
    has_mnemonic_hash: bool
    has_encrypted_family_key: bool
    is_active: bool

