import logging

from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

DEFAULT_SECRET_KEY = "change-me-in-production"
DEFAULT_ENCRYPTION_KEY = "0" * 64


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/giftregistry"
    secret_key: str = DEFAULT_SECRET_KEY
    access_token_expire_minutes: int = 1440
    app_encryption_key: str = DEFAULT_ENCRYPTION_KEY
    allowed_origins: str = "http://localhost:5173"
    environment: str = "development"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()


def _key_problems() -> list[str]:
    problems = []
    if settings.secret_key == DEFAULT_SECRET_KEY:
        problems.append("SECRET_KEY 仍为默认值 change-me-in-production")
    if settings.app_encryption_key == DEFAULT_ENCRYPTION_KEY:
        problems.append("APP_ENCRYPTION_KEY 仍为全零默认值")
    elif len(settings.app_encryption_key) != 64:
        problems.append("APP_ENCRYPTION_KEY 必须是 64 位十六进制字符串（32 字节 AES 密钥）")
    else:
        try:
            bytes.fromhex(settings.app_encryption_key)
        except ValueError:
            problems.append("APP_ENCRYPTION_KEY 不是合法的十六进制字符串")
    return problems


def validate_security_settings() -> None:
    """启动时校验密钥配置：生产环境使用默认/非法密钥直接拒绝启动，
    开发环境仅告警，避免本地误配置导致服务静默带伤运行。"""
    problems = _key_problems()
    if not problems:
        return
    detail = "；".join(problems)
    if settings.environment == "production":
        raise RuntimeError(
            f"生产环境密钥配置不安全：{detail}。"
            "请在 .env 中设置随机生成的 SECRET_KEY 和 APP_ENCRYPTION_KEY。"
        )
    logger.warning("密钥配置不安全（%s），仅允许在开发环境使用", detail)
