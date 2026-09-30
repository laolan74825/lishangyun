"""E2E 测试数据：创建 owner / invitee 两个用户（绕过邮箱验证码）。

用法（在仓库根目录）：
    server/.venv/Scripts/python.exe e2e/e2e_seed.py
"""
import asyncio
import sys
from pathlib import Path

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

from app.core.security import hash_password  # noqa: E402
from app.models.user import User  # noqa: E402

ENGINE = create_async_engine(
    "postgresql+asyncpg://postgres:postgres@localhost:5432/giftregistry"
)
Session = async_sessionmaker(ENGINE, expire_on_commit=False)

USERS = [
    {"username": "e2e_owner", "password": "E2eOwner@123", "nickname": "E2E授权人",
     "email": "e2e_owner@test.com", "role": "user"},
    {"username": "e2e_invitee", "password": "E2eInvitee@123", "nickname": "E2E受邀人",
     "email": "e2e_invitee@test.com", "role": "user"},
]


async def main():
    async with Session() as db:
        for u in USERS:
            from sqlalchemy import select
            existing = (await db.execute(
                select(User).where(User.username == u["username"])
            )).scalar_one_or_none()
            if existing:
                print(f"skip existing: {u['username']}")
                continue
            db.add(User(
                username=u["username"],
                password_hash=hash_password(u["password"]),
                nickname=u["nickname"],
                email=u["email"],
                role=u["role"],
            ))
        await db.commit()
        from sqlalchemy import select as sel
        rows = (await db.execute(sel(User.id, User.username).where(
            User.username.in_([x["username"] for x in USERS])
        ))).all()
        for r in rows:
            print(f"user: id={r.id} username={r.username}")


asyncio.run(main())
