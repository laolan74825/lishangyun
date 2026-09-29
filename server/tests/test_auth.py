from sqlalchemy import select

from app.core.security import hash_password
from app.models.operation_log import OperationLog
from app.models.user import User


class TestRegister:
    async def test_first_user_becomes_super_admin(self, client, db_session):
        resp = client.post("/api/auth/register", json={
            "username": "admin",
            "password": "password123",
            "nickname": "管理员",
            "email": "admin@test.com",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["role"] == "super_admin"
        assert data["user"]["username"] == "admin"

    async def test_second_register_rejected(self, client, super_admin):
        resp = client.post("/api/auth/register", json={
            "username": "user2",
            "password": "password123",
        })
        assert resp.status_code == 400
        assert "已有管理员" in resp.json()["detail"]

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
