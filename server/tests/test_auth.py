from datetime import timedelta

import pytest
from sqlalchemy import select

from app.config import settings
from app.core.rate_limit import login_attempts
from app.core.security import hash_password
from app.core.time import utcnow
from app.models.email_verification_code import EmailVerificationCode
from app.models.phone_verification_code import PhoneVerificationCode
from app.models.operation_log import OperationLog
from app.models.user import User
from tests.conftest import TestAsyncSession


async def _seed_phone_code(phone: str, code: str = "123456") -> None:
    """种入一条未使用、未过期的短信验证码，供注册流程校验。

    使用独立短会话而非 db_session fixture：fixture 跑在 session 级事件循环，
    连接绑定后不能在测试函数的事件循环里复用（asyncpg 会报
    "another operation is in progress"）。
    """
    async with TestAsyncSession() as session:
        session.add(PhoneVerificationCode(
            phone=phone,
            code=code,
            expires_at=utcnow() + timedelta(minutes=10),
        ))
        await session.commit()

class TestRegister:
    async def test_new_user_id_uses_year_seq_format(self, client):
        await _seed_phone_code("13800000001")
        resp = client.post("/api/auth/register", json={
            "username": "fmtuser",
            "password": "password123",
            "phone": "13800000001",
            "phone_code": "123456",
        })
        assert resp.status_code == 200
        uid = resp.json()["user"]["id"]
        year = utcnow().year
        assert year * 1_000_000 < uid < (year + 1) * 1_000_000

    async def test_first_user_becomes_super_admin(self, client):
        await _seed_phone_code("13800000002")
        resp = client.post("/api/auth/register", json={
            "username": "admin",
            "password": "password123",
            "nickname": "管理员",
            "phone": "13800000002",
            "phone_code": "123456",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["role"] == "super_admin"
        assert data["user"]["username"] == "admin"

    async def test_second_user_gets_user_role(self, client, super_admin):
        await _seed_phone_code("13800000003")
        resp = client.post("/api/auth/register", json={
            "username": "user2",
            "password": "password123",
            "phone": "13800000003",
            "phone_code": "123456",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["role"] == "user"
        assert data["user"]["username"] == "user2"

    async def test_register_short_username_rejected(self, client, db_session):
        resp = client.post("/api/auth/register", json={
            "username": "ab",
            "password": "password123",
            "phone": "13800001003",
            "phone_code": "123456",
        })
        assert resp.status_code == 400

    async def test_register_short_password_rejected(self, client, db_session):
        resp = client.post("/api/auth/register", json={
            "username": "admin",
            "password": "12345",
        })
        assert resp.status_code == 422

    async def test_register_invalid_phone_rejected(self, client):
        resp = client.post("/api/auth/register", json={
            "username": "badphone",
            "password": "password123",
            "phone": "123456",
            "phone_code": "123456",
        })
        assert resp.status_code == 422

    async def test_register_duplicate_username_rejected(self, client, super_admin):
        await _seed_phone_code("13800000004")
        resp = client.post("/api/auth/register", json={
            "username": "admin",
            "password": "password123",
            "phone": "13800000004",
            "phone_code": "123456",
        })
        assert resp.status_code == 409
        assert "用户名" in resp.json()["detail"]

    async def test_register_duplicate_phone_rejected(self, client):
        await _seed_phone_code("13800000005")
        resp = client.post("/api/auth/register", json={
            "username": "phoneowner",
            "password": "password123",
            "phone": "13800000005",
            "phone_code": "123456",
        })
        assert resp.status_code == 200
        await _seed_phone_code("13800000005")
        resp = client.post("/api/auth/register", json={
            "username": "phoneowner2",
            "password": "password123",
            "phone": "13800000005",
            "phone_code": "123456",
        })
        assert resp.status_code == 409
        assert "手机号" in resp.json()["detail"]

    async def test_register_wrong_code_rejected(self, client):
        await _seed_phone_code("13800000006", code="111111")
        resp = client.post("/api/auth/register", json={
            "username": "wrongcode",
            "password": "password123",
            "phone": "13800000006",
            "phone_code": "999999",
        })
        assert resp.status_code == 400
        assert "无效或已过期" in resp.json()["detail"]

    async def test_register_optional_email_stored_unverified(self, client, db_session):
        await _seed_phone_code("13800000007")
        resp = client.post("/api/auth/register", json={
            "username": "withemail",
            "password": "password123",
            "phone": "13800000007",
            "phone_code": "123456",
            "security_email_1": "Opt@Test.com",
        })
        assert resp.status_code == 200
        from app.models.security_email import SecurityEmail
        result = await db_session.execute(
            select(SecurityEmail).where(SecurityEmail.email == "opt@test.com")
        )
        row = result.scalar_one_or_none()
        assert row is not None and row.is_verified == False


class TestLogin:
    async def test_login_success(self, client, normal_user):
        resp = client.post("/api/auth/login", json={
            "username": "user1",
            "password": "password123",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["username"] == "user1"

    async def test_login_wrong_password(self, client, normal_user):
        resp = client.post("/api/auth/login", json={
            "username": "user1",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401

    async def test_login_nonexistent_user(self, client, db_session):
        resp = client.post("/api/auth/login", json={
            "username": "nobody",
            "password": "password123",
        })
        assert resp.status_code == 401

    async def test_login_disabled_user(self, client, db_session):
        u = User(
            username="disabled",
            password_hash=hash_password("password123"),
            role="user",
            is_active=False,
        )
        db_session.add(u)
        await db_session.commit()

        resp = client.post("/api/auth/login", json={
            "username": "disabled",
            "password": "password123",
        })
        assert resp.status_code == 403


class TestLoginRateLimit:
    @pytest.fixture(autouse=True)
    def _clear_attempts(self):
        # 内存计数器跨测试存活，避免其他用例的失败记录干扰
        login_attempts._attempts.clear()
        yield
        login_attempts._attempts.clear()

    async def test_locked_after_max_failures(self, client, normal_user, monkeypatch):
        monkeypatch.setattr(settings, "login_max_attempts", 3)
        for _ in range(3):
            resp = client.post("/api/auth/login", json={
                "username": "user1", "password": "wrongpassword",
            })
            assert resp.status_code == 401

        # 即使密码正确，锁定期间也返回 429
        resp = client.post("/api/auth/login", json={
            "username": "user1", "password": "password123",
        })
        assert resp.status_code == 429
        assert "锁定" in resp.json()["detail"]

    async def test_success_resets_failure_count(self, client, normal_user, monkeypatch):
        monkeypatch.setattr(settings, "login_max_attempts", 3)
        for _ in range(2):
            client.post("/api/auth/login", json={
                "username": "user1", "password": "wrongpassword",
            })

        resp = client.post("/api/auth/login", json={
            "username": "user1", "password": "password123",
        })
        assert resp.status_code == 200

        # 成功后计数清零：再失败 2 次（不到上限）仍可正常登录
        for _ in range(2):
            client.post("/api/auth/login", json={
                "username": "user1", "password": "wrongpassword",
            })
        resp = client.post("/api/auth/login", json={
            "username": "user1", "password": "password123",
        })
        assert resp.status_code == 200

    async def test_lock_expires_after_window(self, client, normal_user, monkeypatch):
        from app.core import rate_limit

        monkeypatch.setattr(settings, "login_max_attempts", 2)
        monkeypatch.setattr(settings, "login_lock_minutes", 10)
        real_now = rate_limit._now
        fake_now = [real_now()]
        monkeypatch.setattr(rate_limit, "_now", lambda: fake_now[0])

        for _ in range(2):
            client.post("/api/auth/login", json={
                "username": "user1", "password": "wrongpassword",
            })
        resp = client.post("/api/auth/login", json={
            "username": "user1", "password": "password123",
        })
        assert resp.status_code == 429

        # 模拟窗口期过后：解锁且计数清零
        fake_now[0] += 10 * 60 + 1
        resp = client.post("/api/auth/login", json={
            "username": "user1", "password": "password123",
        })
        assert resp.status_code == 200


class TestMe:
    async def test_me_returns_current_user(self, client, admin_headers):
        resp = client.get("/api/auth/me", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["username"] == "admin"
        assert resp.json()["role"] == "super_admin"

    async def test_me_without_token_returns_401(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401

    async def test_me_with_invalid_token_returns_401(self, client):
        resp = client.get("/api/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
        assert resp.status_code == 401


class TestChangePassword:
    async def test_change_password_success(self, client, normal_user, user_headers):
        resp = client.put("/api/auth/password", json={
            "old_password": "password123",
            "new_password": "newpassword456",
        }, headers=user_headers)
        assert resp.status_code == 200

        resp2 = client.post("/api/auth/login", json={
            "username": "user1",
            "password": "newpassword456",
        })
        assert resp2.status_code == 200

    async def test_change_password_wrong_old(self, client, normal_user, user_headers):
        resp = client.put("/api/auth/password", json={
            "old_password": "wrongold",
            "new_password": "newpassword456",
        }, headers=user_headers)
        assert resp.status_code == 400


class TestDataIsolation:
    async def test_deleted_user_cannot_login(self, client, db_session):
        u = User(
            username="deleted_user",
            password_hash=hash_password("password123"),
            role="user",
            is_active=True,
            is_deleted=True,
        )
        db_session.add(u)
        await db_session.commit()

        resp = client.post("/api/auth/login", json={
            "username": "deleted_user",
            "password": "password123",
        })
        assert resp.status_code == 401


class TestSendVerificationCode:
    """邮箱验证码：60 秒重发节流 + 10 分钟有效期。"""

    @pytest.fixture()
    async def smtp_settings(self, db_session):
        from app.core.crypto import encrypt_value
        from app.models.system_setting import SystemSetting

        db_session.add_all([
            SystemSetting(key="smtp_host", value="smtp.test"),
            SystemSetting(key="smtp_port", value="465"),
            SystemSetting(key="smtp_user", value="noreply@test"),
            SystemSetting(key="smtp_password_enc", value=encrypt_value("secret")),
        ])
        await db_session.commit()

    @pytest.fixture()
    async def sms_mock_settings(self, db_session):
        from app.models.system_setting import SystemSetting

        db_session.add(SystemSetting(key="sms_mode", value="mock"))
        await db_session.commit()

    @pytest.fixture()
    def _patch_email_sender(self, monkeypatch):
        monkeypatch.setattr("app.api.auth.send_verification_email", lambda *a, **k: None)
        monkeypatch.setattr("app.api.account.send_verification_email", lambda *a, **k: None)

    async def test_send_sms_code_mock_mode(self, client, sms_mock_settings, monkeypatch):
        monkeypatch.setattr("app.api.auth._generate_code", lambda: "654321")
        resp = client.post("/api/auth/send-sms-code", json={"phone": "13800000200"})
        assert resp.status_code == 200

        async with TestAsyncSession() as session:
            result = await session.execute(
                select(PhoneVerificationCode).where(PhoneVerificationCode.phone == "13800000200")
            )
            row = result.scalar_one_or_none()
        assert row is not None and row.code == "654321"

    async def test_send_sms_code_unconfigured_rejected(self, client):
        resp = client.post("/api/auth/send-sms-code", json={"phone": "13800000201"})
        assert resp.status_code == 400
        assert "未配置" in resp.json()["detail"]

    async def test_send_sms_code_registered_phone_rejected(self, client, db_session, sms_mock_settings):
        u = User(
            username="regphone",
            password_hash=hash_password("password123"),
            phone="13800000202",
        )
        db_session.add(u)
        await db_session.commit()
        resp = client.post("/api/auth/send-sms-code", json={"phone": "13800000202"})
        assert resp.status_code == 409



    async def test_resend_within_interval_rejected(self, client, db_session, smtp_settings, _patch_email_sender):
        resp = client.post("/api/auth/send-verification-code", json={"email": "fresh@test.com"})
        assert resp.status_code == 200

        resp = client.post("/api/auth/send-verification-code", json={"email": "fresh@test.com"})
        assert resp.status_code == 429
        assert "秒" in resp.json()["detail"]

    async def test_resend_after_interval_replaces_old_code(
        self, client, db_session, smtp_settings, _patch_email_sender, monkeypatch,
    ):
        fake_now = [utcnow()]
        monkeypatch.setattr("app.api.auth.utcnow", lambda: fake_now[0])

        resp = client.post("/api/auth/send-verification-code", json={"email": "again@test.com"})
        assert resp.status_code == 200

        # created_at 由数据库/模型默认值按真实时间落库，与打桩时钟无关；
        # 多留余量（90 秒），避免首次请求耗时使真实间隔仍落在 60 秒节流内
        fake_now[0] += timedelta(seconds=90)
        resp = client.post("/api/auth/send-verification-code", json={"email": "again@test.com"})
        assert resp.status_code == 200

        async with TestAsyncSession() as session:
            result = await session.execute(
                select(EmailVerificationCode).where(EmailVerificationCode.email == "again@test.com")
            )
            codes = result.scalars().all()
        assert len(codes) == 1
        assert codes[0].used == False

    async def test_account_send_code_shares_throttle(self, client, db_session, smtp_settings, _patch_email_sender):
        resp = client.post("/api/account/security-emails/send-code", json={"email": "bind@test.com"})
        assert resp.status_code == 200

        resp = client.post("/api/account/security-emails/send-code", json={"email": "bind@test.com"})
        assert resp.status_code == 429

    async def test_code_valid_within_10_minutes(self, client, sms_mock_settings, monkeypatch):
        monkeypatch.setattr("app.api.auth._generate_code", lambda: "654321")
        fake_now = [utcnow()]
        monkeypatch.setattr("app.api.auth.utcnow", lambda: fake_now[0])

        resp = client.post("/api/auth/send-sms-code", json={"phone": "13800000100"})
        assert resp.status_code == 200

        # 9 分钟后注册仍可用（有效期 10 分钟）
        fake_now[0] += timedelta(minutes=9)
        resp = client.post("/api/auth/register", json={
            "username": "slowuser",
            "password": "password123",
            "phone": "13800000100",
            "phone_code": "654321",
        })
        assert resp.status_code == 200

    async def test_code_expires_after_10_minutes(self, client, sms_mock_settings, monkeypatch):
        monkeypatch.setattr("app.api.auth._generate_code", lambda: "654321")
        fake_now = [utcnow()]
        monkeypatch.setattr("app.api.auth.utcnow", lambda: fake_now[0])

        resp = client.post("/api/auth/send-sms-code", json={"phone": "13800000101"})
        assert resp.status_code == 200

        # 11 分钟后验证码应已过期
        fake_now[0] += timedelta(minutes=11)
        resp = client.post("/api/auth/register", json={
            "username": "lateuser",
            "password": "password123",
            "phone": "13800000101",
            "phone_code": "654321",
        })
        assert resp.status_code == 400
        assert "无效或已过期" in resp.json()["detail"]


class TestPasswordResetByPhone:
    """手机号找回密码：短信验证码重置全流程。"""

    @pytest.fixture()
    async def phone_user(self, db_session):
        u = User(
            username="phoneuser",
            password_hash=hash_password("oldpassword"),
            phone="13800000300",
        )
        db_session.add(u)
        await db_session.commit()
        await db_session.refresh(u)
        return u

    @pytest.fixture()
    async def sms_mock_settings(self, db_session):
        from app.models.system_setting import SystemSetting

        db_session.add(SystemSetting(key="sms_mode", value="mock"))
        await db_session.commit()

    async def _latest_reset_code(self, phone: str):
        async with TestAsyncSession() as session:
            from app.models.reset_code import ResetCode
            result = await session.execute(
                select(ResetCode).where(ResetCode.phone == phone).order_by(ResetCode.id.desc())
            )
            return result.scalars().first()

    async def test_reset_by_phone_full_flow(self, client, phone_user, sms_mock_settings):
        resp = client.post("/api/auth/password-reset/request-phone", json={"phone": "13800000300"})
        assert resp.status_code == 200

        code_row = await self._latest_reset_code("13800000300")
        assert code_row is not None and code_row.used == False

        resp = client.post("/api/auth/password-reset/confirm", json={
            "phone": "13800000300",
            "code": code_row.code,
            "new_password": "newpassword123",
        })
        assert resp.status_code == 200

        # 旧密码失效、新密码可登录
        resp = client.post("/api/auth/login", json={
            "username": "phoneuser", "password": "oldpassword",
        })
        assert resp.status_code == 401
        resp = client.post("/api/auth/login", json={
            "username": "phoneuser", "password": "newpassword123",
        })
        assert resp.status_code == 200

        # 重置码已一次性使用
        resp = client.post("/api/auth/password-reset/confirm", json={
            "phone": "13800000300",
            "code": code_row.code,
            "new_password": "anotherpassword",
        })
        assert resp.status_code == 400

    async def test_reset_by_phone_unregistered_generic(self, client, sms_mock_settings):
        resp = client.post("/api/auth/password-reset/request-phone", json={"phone": "13800000301"})
        assert resp.status_code == 200
        assert await self._latest_reset_code("13800000301") is None

    async def test_reset_confirm_phone_wrong_code(self, client, phone_user, sms_mock_settings):
        client.post("/api/auth/password-reset/request-phone", json={"phone": "13800000300"})
        resp = client.post("/api/auth/password-reset/confirm", json={
            "phone": "13800000300",
            "code": "000000",
            "new_password": "newpassword123",
        })
        assert resp.status_code == 400

    async def test_reset_confirm_without_target_rejected(self, client):
        resp = client.post("/api/auth/password-reset/confirm", json={
            "code": "123456",
            "new_password": "newpassword123",
        })
        assert resp.status_code == 422



class TestAdminRoleRules:
    """角色体系：一般用户(user) / 系统管理员(admin) / 超级管理员(super_admin)。"""

    async def test_super_admin_can_grant_admin_role(self, client, admin_headers, normal_user):
        resp = client.put(f"/api/admin/users/{normal_user.id}", json={"role": "admin"}, headers=admin_headers)
        assert resp.status_code == 200

        resp = client.get("/api/admin/users", headers=admin_headers)
        roles = {u["username"]: u["role"] for u in resp.json()["items"]}
        assert roles["user1"] == "admin"

    async def test_admin_cannot_grant_role(self, client, db_session, normal_user, user_headers):
        from tests.conftest import _make_user, _auth_headers
        sys_admin = await _make_user(db_session, username="sysadmin", role="admin")
        headers = _auth_headers(sys_admin)

        resp = client.put(f"/api/admin/users/{normal_user.id}", json={"role": "admin"}, headers=headers)
        assert resp.status_code == 403

    async def test_admin_cannot_create_admin(self, client, db_session):
        from tests.conftest import _make_user, _auth_headers
        sys_admin = await _make_user(db_session, username="sysadmin2", role="admin")
        headers = _auth_headers(sys_admin)

        resp = client.post("/api/admin/users", json={
            "username": "anotheradmin",
            "password": "password123",
            "role": "admin",
        }, headers=headers)
        assert resp.status_code == 403

    async def test_super_admin_can_create_admin_directly(self, client, admin_headers):
        resp = client.post("/api/admin/users", json={
            "username": "directadmin",
            "password": "password123",
            "role": "admin",
        }, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"

    async def test_super_admin_account_is_protected(self, client, admin_headers, super_admin):
        # 不能调整超级管理员的角色
        resp = client.put(f"/api/admin/users/{super_admin.id}", json={"role": "user"}, headers=admin_headers)
        assert resp.status_code == 400
        # 不能禁用超级管理员
        resp = client.put(f"/api/admin/users/{super_admin.id}", json={"is_active": False}, headers=admin_headers)
        assert resp.status_code == 400
        # 不能删除超级管理员
        resp = client.delete(f"/api/admin/users/{super_admin.id}", headers=admin_headers)
        assert resp.status_code == 400

    async def test_legacy_role_values_rejected(self, client, admin_headers):
        resp = client.post("/api/admin/users", json={
            "username": "legacyuser",
            "password": "password123",
            "role": "collaborator",
        }, headers=admin_headers)
        assert resp.status_code == 422


class TestLockPin:
    """锁屏密码：设置/查询/验证/清除全流程"""

    async def test_verify_password_endpoint(self, client, user_headers):
        resp = client.post("/api/auth/verify-password", json={"password": "password123"}, headers=user_headers)
        assert resp.status_code == 200
        assert resp.json()["valid"] is True

        resp = client.post("/api/auth/verify-password", json={"password": "wrong"}, headers=user_headers)
        assert resp.status_code == 400

    async def test_lock_pin_full_flow(self, client, user_headers):
        # 初始未设置
        resp = client.get("/api/auth/lock-pin", headers=user_headers)
        assert resp.json()["enabled"] is False

        # 设置：需验证登录密码
        resp = client.post("/api/auth/lock-pin", json={"pin": "1234", "password": "password123"}, headers=user_headers)
        assert resp.status_code == 200

        resp = client.get("/api/auth/lock-pin", headers=user_headers)
        assert resp.json()["enabled"] is True

        # 锁屏密码可解锁；错误密码被拒
        resp = client.post("/api/auth/verify-lock-pin", json={"pin": "1234"}, headers=user_headers)
        assert resp.status_code == 200
        resp = client.post("/api/auth/verify-lock-pin", json={"pin": "9999"}, headers=user_headers)
        assert resp.status_code == 400

        # 清除：需验证登录密码
        resp = client.request("DELETE", "/api/auth/lock-pin", json={"password": "password123"}, headers=user_headers)
        assert resp.status_code == 200

        resp = client.get("/api/auth/lock-pin", headers=user_headers)
        assert resp.json()["enabled"] is False

        # 清除后再验证应失败
        resp = client.post("/api/auth/verify-lock-pin", json={"pin": "1234"}, headers=user_headers)
        assert resp.status_code == 400

    async def test_set_lock_pin_wrong_password_rejected(self, client, user_headers):
        resp = client.post("/api/auth/lock-pin", json={"pin": "1234", "password": "wrong"}, headers=user_headers)
        assert resp.status_code == 400

        resp = client.get("/api/auth/lock-pin", headers=user_headers)
        assert resp.json()["enabled"] is False

    async def test_clear_lock_pin_wrong_password_keeps_pin(self, client, user_headers):
        client.post("/api/auth/lock-pin", json={"pin": "1234", "password": "password123"}, headers=user_headers)

        resp = client.request("DELETE", "/api/auth/lock-pin", json={"password": "wrong"}, headers=user_headers)
        assert resp.status_code == 400

        resp = client.get("/api/auth/lock-pin", headers=user_headers)
        assert resp.json()["enabled"] is True

    async def test_lock_pin_must_be_4_digits(self, client, user_headers):
        for bad in ["123", "12345", "12ab", "abcd"]:
            resp = client.post("/api/auth/lock-pin", json={"pin": bad, "password": "password123"}, headers=user_headers)
            assert resp.status_code == 422, bad

    async def test_lock_pin_hash_not_exposed(self, client, user_headers, db_session):
        from sqlalchemy import select

        from app.models.user import User

        client.post("/api/auth/lock-pin", json={"pin": "1234", "password": "password123"}, headers=user_headers)
        # 会话身份映射里可能缓存着设置前的旧对象，先过期再查
        db_session.expire_all()
        user = (await db_session.execute(
            select(User).where(User.username == "user1"))).scalar_one()
        # 数据库存哈希而非明文，且与登录密码哈希不同
        assert user.lock_pin_hash is not None
        assert user.lock_pin_hash != "1234"
        assert user.lock_pin_hash != user.password_hash



class TestPasswordResetEmailHint:
    """找回密码 email-hint：掩码提示、防枚举（用户不存在也返回 200）、按 IP 限流。"""

    async def test_hint_returns_masked_email(self, client, db_session):
        from app.models.security_email import SecurityEmail
        from tests.conftest import _make_user

        user = await _make_user(db_session, username="hintuser")
        db_session.add(SecurityEmail(
            user_id=user.id,
            email="laolan123@example.com",
            is_verified=True,
            is_primary=True,
        ))
        await db_session.commit()

        resp = client.post("/api/auth/password-reset/email-hint", json={"username": "hintuser"})
        assert resp.status_code == 200
        assert resp.json() == {"masked_email": "la***@example.com"}

    async def test_hint_unknown_user_returns_null_instead_of_404(self, client):
        resp = client.post("/api/auth/password-reset/email-hint", json={"username": "ghost_hint_user"})
        assert resp.status_code == 200
        assert resp.json() == {"masked_email": None}

    async def test_hint_user_without_verified_email_returns_null(self, client, db_session):
        from tests.conftest import _make_user

        await _make_user(db_session, username="hintnoemail")
        resp = client.post("/api/auth/password-reset/email-hint", json={"username": "hintnoemail"})
        assert resp.status_code == 200
        assert resp.json() == {"masked_email": None}

    async def test_hint_rate_limited_by_ip(self, client, monkeypatch):
        """轮换用户名批量探测时，按 IP 限流应在第 login_max_attempts 次失败后生效。"""
        from app.api import auth as auth_module
        from app.core.rate_limit import _LoginAttemptStore

        monkeypatch.setattr(auth_module, "email_hint_attempts", _LoginAttemptStore())
        for i in range(settings.login_max_attempts):
            resp = client.post(
                "/api/auth/password-reset/email-hint",
                json={"username": f"sweepuser{i}"},
            )
            assert resp.status_code == 200
            assert resp.json() == {"masked_email": None}

        resp = client.post("/api/auth/password-reset/email-hint", json={"username": "sweepuser_final"})
        assert resp.status_code == 429
        assert "分钟" in resp.json()["detail"]


class TestLoginAccountModes:
    """登录双模：用户名或手机号，服务端按格式识别。"""

    async def test_login_by_phone(self, client, db_session):
        from tests.conftest import _make_user

        user = await _make_user(db_session, username="phoneuser")
        user.phone = "13800001211"
        await db_session.commit()

        resp = client.post("/api/auth/login", json={
            "username": "13800001211",
            "password": "password123",
        })
        assert resp.status_code == 200
        assert resp.json()["user"]["username"] == "phoneuser"

    async def test_phone_pattern_username_fallback(self, client, db_session):
        """用户名形如手机号且未绑定该手机号：按手机号查不到时应回退按用户名查。"""
        from tests.conftest import _make_user

        await _make_user(db_session, username="13900001212")
        resp = client.post("/api/auth/login", json={
            "username": "13900001212",
            "password": "password123",
        })
        assert resp.status_code == 200
        assert resp.json()["user"]["username"] == "13900001212"


class TestRegisterAutoUsername:
    """注册时用户名选填：留空自动生成 用户_<ID>。"""

    async def test_register_without_username_auto_generates(self, client):
        await _seed_phone_code("13800001001")
        resp = client.post("/api/auth/register", json={
            "password": "password123",
            "phone": "13800001001",
            "phone_code": "123456",
        })
        assert resp.status_code == 200
        user = resp.json()["user"]
        assert user["username"] == f"用户_{user['id']}"

    async def test_register_empty_username_treated_as_auto(self, client):
        await _seed_phone_code("13800001002")
        resp = client.post("/api/auth/register", json={
            "username": "",
            "password": "password123",
            "phone": "13800001002",
            "phone_code": "123456",
        })
        assert resp.status_code == 200
        assert resp.json()["user"]["username"].startswith("用户_")


class TestUpdateProfileUsername:
    """设置页修改用户名：成功生效 + 唯一性冲突 409。"""

    async def test_update_username_success(self, client, user_headers):
        resp = client.put(
            "/api/account/profile",
            json={"username": "bettername"},
            headers=user_headers,
        )
        assert resp.status_code == 200

        resp = client.get("/api/account/profile", headers=user_headers)
        assert resp.json()["username"] == "bettername"

    async def test_update_username_conflict(self, client, another_user, user_headers):
        resp = client.put(
            "/api/account/profile",
            json={"username": another_user.username},
            headers=user_headers,
        )
        assert resp.status_code == 409


class TestCheckUsername:
    """注册页用户名失焦预检 /auth/check-username：可用性 + IP 限流防枚举。"""

    async def test_available_for_fresh_name(self, client):
        resp = client.post("/api/auth/check-username", json={"username": "freshname"})
        assert resp.status_code == 200
        assert resp.json() == {"available": True}

    async def test_taken_for_existing_name(self, client, db_session):
        from tests.conftest import _make_user

        await _make_user(db_session, username="takenname")
        resp = client.post("/api/auth/check-username", json={"username": "takenname"})
        assert resp.status_code == 200
        assert resp.json() == {"available": False}

    async def test_short_name_rejected(self, client):
        resp = client.post("/api/auth/check-username", json={"username": "ab"})
        assert resp.status_code == 400

    async def test_rate_limited_by_ip(self, client, db_session, monkeypatch):
        """连续探测已占用用户名（计失败）达到上限后，按 IP 锁定。"""
        from app.api import auth as auth_module
        from app.core.rate_limit import _LoginAttemptStore
        from tests.conftest import _make_user

        monkeypatch.setattr(auth_module, "username_check_attempts", _LoginAttemptStore())
        for i in range(settings.login_max_attempts):
            await _make_user(db_session, username=f"takenprobe{i}")
            resp = client.post("/api/auth/check-username", json={"username": f"takenprobe{i}"})
            assert resp.status_code == 200
            assert resp.json() == {"available": False}

        resp = client.post("/api/auth/check-username", json={"username": "takenprobe_final"})
        assert resp.status_code == 429
