"""启动时密钥配置校验的单元测试。"""
import pytest

from app.config import settings, validate_security_settings


@pytest.fixture
def restore_settings():
    original = (settings.secret_key, settings.app_encryption_key, settings.environment)
    yield
    settings.secret_key, settings.app_encryption_key, settings.environment = original


class TestValidateSecuritySettings:
    def test_production_with_default_keys_raises(self, restore_settings):
        settings.secret_key = "change-me-in-production"
        settings.app_encryption_key = "0" * 64
        settings.environment = "production"
        with pytest.raises(RuntimeError, match="密钥配置不安全"):
            validate_security_settings()

    def test_production_with_default_secret_only_raises(self, restore_settings):
        settings.secret_key = "change-me-in-production"
        settings.app_encryption_key = "ab" * 32
        settings.environment = "production"
        with pytest.raises(RuntimeError, match="SECRET_KEY"):
            validate_security_settings()

    def test_production_with_invalid_hex_key_raises(self, restore_settings):
        settings.secret_key = "s" * 48
        settings.app_encryption_key = "zz" * 32
        settings.environment = "production"
        with pytest.raises(RuntimeError, match="APP_ENCRYPTION_KEY"):
            validate_security_settings()

    def test_production_with_valid_keys_passes(self, restore_settings):
        settings.secret_key = "s" * 48
        settings.app_encryption_key = "ab" * 32
        settings.environment = "production"
        validate_security_settings()

    def test_development_with_defaults_only_warns(self, restore_settings):
        settings.secret_key = "change-me-in-production"
        settings.app_encryption_key = "0" * 64
        settings.environment = "development"
        validate_security_settings()  # 不应抛异常
