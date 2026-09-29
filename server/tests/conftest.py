import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.database import Base, get_db
from app.main import app
from app.models import (
    authorization_action_log,
    authorization_code,
    daily_record,
    family_group,
    family_member,
    gb_record,
    guestbook,
    guestbook_host,
    notification,
    operation_log,
    payment_account,
    pending_approval,
    person,
    person_balance_adjustment,
    reset_code,
    security_email,
    system_setting,
    terminal_settings,
    user,
    user_key_config,
)
from app.models.user import User

TEST_DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/giftregistry_test"
test_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
TestAsyncSession = async_sessionmaker(bind=test_engine, expire_on_commit=False)


async def _override_get_db():
    async with TestAsyncSession() as db:
        try:
            yield db
        finally:
            await db.close()


app.dependency_overrides[get_db] = _override_get_db


@pytest.fixture(autouse=True)
async def setup_database():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture()
async def db_session():
    async with TestAsyncSession() as session:
        yield session


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient
    return TestClient(app)


async def _make_user(
    db_session: AsyncSession,
    username: str = "testuser",
    password: str = "password123",
    role: str = "user",
    is_active: bool = True,
) -> User:
    u = User(
        username=username,
        password_hash=hash_password(password),
        role=role,
        nickname=username,
        email=f"{username}@test.com",
        is_active=is_active,
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


def _auth_headers(u: User) -> dict[str, str]:
    token = create_access_token({"sub": str(u.id), "role": u.role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
async def super_admin(db_session: AsyncSession):
    return await _make_user(db_session, username="admin", role="super_admin")


@pytest.fixture()
async def normal_user(db_session: AsyncSession):
    return await _make_user(db_session, username="user1", role="user")


@pytest.fixture()
async def another_user(db_session: AsyncSession):
    return await _make_user(db_session, username="user2", role="user")


@pytest.fixture()
async def collaborator_user(db_session: AsyncSession):
    return await _make_user(db_session, username="collab", role="collaborator")


@pytest.fixture()
def admin_headers(super_admin) -> dict[str, str]:
    return _auth_headers(super_admin)


@pytest.fixture()
def user_headers(normal_user) -> dict[str, str]:
    return _auth_headers(normal_user)


@pytest.fixture()
def another_user_headers(another_user) -> dict[str, str]:
    return _auth_headers(another_user)


@pytest.fixture()
def collab_headers(collaborator_user) -> dict[str, str]:
    return _auth_headers(collaborator_user)
