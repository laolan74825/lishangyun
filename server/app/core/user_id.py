"""用户 ID 生成规则：创建年份（4 位）+ 6 位流水号，如 2026000001。

流水号按年份从 1 开始递增，同年最多 999999 个账户。
并发冲突时自动重试获取新 ID。
"""

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models.user import User

SEQ_MODULUS = 1_000_000  # 6 位流水号


async def generate_user_id(db: AsyncSession) -> int:
    """按 年份*1_000_000 + 当年流水号 生成用户 ID。"""
    year = utcnow().year
    base = year * SEQ_MODULUS
    result = await db.execute(
        select(func.max(User.id)).where(User.id >= base, User.id < base + SEQ_MODULUS)
    )
    max_id = result.scalar() or 0
    return max(max_id + 1, base + 1)


async def add_user_with_generated_id(
    db: AsyncSession, user: User, max_retries: int = 3
) -> User:
    """为 user 生成新格式 ID 并写入数据库（flush）。

    并发下流水号可能冲突，遇到唯一键冲突时回滚后换新 ID 重试。
    """
    for _ in range(max_retries):
        user.id = await generate_user_id(db)
        db.add(user)
        try:
            await db.flush()
            return user
        except IntegrityError:
            await db.rollback()
    raise HTTPException(status_code=500, detail="用户创建失败，请重试")
