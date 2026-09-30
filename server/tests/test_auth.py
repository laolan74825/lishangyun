from datetime import timedelta

from sqlalchemy import select

from app.core.security import hash_password
from app.core.time import utcnow
from app.models.email_verification_code import EmailVerificationCode
from app.models.operation_log import OperationLog
from app.models.user import User
from tests.conftest import TestAsyncSession


async def _seed_email_code(email: str, code: str = "123456") -> None:
    """种入一条未使用、未过期的邮箱验证码，供注册流程校验。

    使用独立短会话而非 db_session fixture：fixture 跑在 session 级事件循环，
    连接绑定后不能在测试函数的事件循环里复用（asyncpg 会报
    "another operation is in progress"）。
    """
    async with TestAsyncSession() as session:
        session.add(EmailVerificationCode(
            email=email,
            code=code,
            expires_at=utcnow() + timedelta(minutes=10),
        ))
        await session.commit()


class TestRegister:
    async def test_first_user_becomes_super_admin(self, client):
        await _seed_email_code("admin@test.com")
        resp = client.post("/api/auth/register", json={
            "username": "admin",
            "password": "password123",
            "nickname": "管理员",
            "security_email_1": "admin@test.com",
            "security_email_1_code": "123456",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["role"] == "super_admin"
        assert data["user"]["username"] == "admin"

    async def test_second_user_gets_user_role(self, client, super_admin):
        await _seed_email_code("user2@test.com")
        resp = client.post("/api/auth/register", json={
            "username": "user2",
            "password": "password123",
            "security_email_1": "user2@test.com",
            "security_email_1_code": "123456",
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
        })
        assert resp.status_code == 422

    async def test_register_short_password_rejected(self, client, db_session):
        resp = client.post("/api/auth/register", json={
            "username": "admin",
            "password": "12345",
        })
        assert resp.status_code == 422


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
