from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./giftregistry.db"
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 1440
    app_encryption_key: str = "0" * 64
    allowed_origins: str = "http://localhost:5173"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
