from typing import Literal

from pydantic import BaseModel, Field

# 角色体系：一般用户(user) / 系统管理员(admin) / 超级管理员(super_admin)
# 超级管理员仅由系统首个注册用户产生，不通过接口授予
RoleType = Literal["super_admin", "admin", "user"]
UserStatus = Literal["active", "disabled", "deactivated"]
SecurityMode = Literal["normal", "enhanced"]


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=128)
    nickname: str | None = Field(None, max_length=50)
    security_email_1: str = Field(..., max_length=100, description="主安全邮箱，必填")
    security_email_1_code: str = Field(..., max_length=10, description="主安全邮箱验证码")
    security_email_2: str | None = Field(None, max_length=100, description="备用安全邮箱，选填")
    security_email_2_code: str | None = Field(None, max_length=10, description="备用安全邮箱验证码")


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserInfo"


class UserInfo(BaseModel):
    id: int
    username: str
    role: str
    nickname: str | None = None
    email: str | None = None
    status: str = "active"
    security_mode: str = "normal"
    is_active: bool

    model_config = {"from_attributes": True}


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6, max_length=128)


class PasswordResetRequest(BaseModel):
    email: str


class PasswordResetEmailHintRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)


class PasswordResetConfirm(BaseModel):
    email: str
    code: str
    new_password: str = Field(..., min_length=6, max_length=128)


class SendVerificationCodeRequest(BaseModel):
    email: str = Field(..., max_length=100)
