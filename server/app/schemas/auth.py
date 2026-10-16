from typing import Literal

from pydantic import BaseModel, Field, model_validator

# 角色体系：一般用户(user) / 系统管理员(admin) / 超级管理员(super_admin)
# 超级管理员仅由系统首个注册用户产生，不通过接口授予
RoleType = Literal["super_admin", "admin", "user"]
UserStatus = Literal["active", "disabled", "deactivated"]
SecurityMode = Literal["normal", "enhanced"]


class RegisterRequest(BaseModel):
    username: str | None = Field(None, max_length=50, description="用户名，选填；留空自动生成（用户_<ID>），注册后可在设置中修改。长度 3~50，在服务端校验")
    password: str = Field(..., min_length=6, max_length=128)
    nickname: str | None = Field(None, max_length=50)
    security_email_1: str | None = Field(None, max_length=100, description="安全邮箱，选填，注册时不强制验证")
    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$", description="手机号，必填且全站唯一")
    phone_code: str = Field(..., min_length=4, max_length=10, description="手机短信验证码")


class LoginRequest(BaseModel):
    username: str = Field(..., description="用户名或手机号，服务端按格式自动识别")
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
    phone: str | None = None
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


class UsernameCheckRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50, description="待预检的用户名，长度规则服务端复核")


class PasswordResetConfirm(BaseModel):
    email: str | None = None
    phone: str | None = None
    code: str
    new_password: str = Field(..., min_length=6, max_length=128)

    @model_validator(mode="after")
    def _at_least_one_target(self):
        if not self.email and not self.phone:
            raise ValueError("邮箱和手机号至少提供一个")
        return self



class SendVerificationCodeRequest(BaseModel):
    email: str = Field(..., max_length=100)


class SendSmsCodeRequest(BaseModel):
    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$")


class PhonePasswordResetRequest(BaseModel):
    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$")


class VerifyPasswordRequest(BaseModel):
    """锁屏解锁等场景校验当前登录密码"""
    password: str = Field(..., min_length=1, max_length=128)


class LockPinSetRequest(BaseModel):
    """设置锁屏密码：需先验证登录密码，防止他人趁设备未锁时篡改"""
    pin: str = Field(..., pattern=r"^\d{4}$", description="4 位数字锁屏密码")
    password: str = Field(..., min_length=1, max_length=128)


class LockPinClearRequest(BaseModel):
    """清除锁屏密码：同样需验证登录密码"""
    password: str = Field(..., min_length=1, max_length=128)


class LockPinStatus(BaseModel):
    """锁屏密码是否已设置（不回传哈希）"""
    enabled: bool


class VerifyLockPinRequest(BaseModel):
    pin: str = Field(..., pattern=r"^\d{4}$")
