import json
import math
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.operation_log import OperationLog
from app.models.person import Person


async def paginate_query(
    db: AsyncSession, stmt: Select, page: int = 1, page_size: int = 20
) -> tuple[list, dict]:
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_count = (await db.execute(count_stmt)).scalar_one()
    total_pages = max(1, math.ceil(total_count / page_size))
    items_stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    items = (await db.execute(items_stmt)).scalars().all()
    return items, {
        "page": page,
        "page_size": page_size,
        "total_count": total_count,
        "total_pages": total_pages,
    }


async def match_person_id(
    db: AsyncSession, owner_id: int, name: str, phone: str | None = None
) -> int | None:
    """按宾客姓名（可选电话）在人员库中精确匹配人员 ID。

    匹配规则：
    - 有电话时优先「姓名 + 电话」精确匹配
    - 其次退化为「姓名」精确匹配
    - 只匹配未删除的人员；同名多人且无法通过电话区分时返回 None（避免错误关联）
    """
    base_conds = [Person.owner_id == owner_id, Person.name == name, Person.is_deleted == False]
    if phone:
        result = await db.execute(
            select(Person.id).where(*base_conds, Person.phone == phone)
        )
        pid = result.scalar_one_or_none()
        if pid is not None:
            return pid
    result = await db.execute(select(Person.id).where(*base_conds))
    rows = result.scalars().all()
    # 同名多人时无法确定关联对象，返回 None 交由用户人工处理
    return rows[0] if len(rows) == 1 else None


def write_audit_log(
    db: AsyncSession,
    owner_id: int,
    target_table: str,
    target_id: int,
    action_type: str,
    guestbook_id: int | None = None,
    operator_name: str | None = None,
    client_id: str | None = None,
    before: Any = None,
    after: Any = None,
    note: str | None = None,
) -> None:
    db.add(OperationLog(
        owner_id=owner_id,
        target_table=target_table,
        target_id=target_id,
        guestbook_id=guestbook_id,
        action_type=action_type,
        operator_name=operator_name,
        client_id=client_id,
        before_data=json.dumps(before, ensure_ascii=False, default=str) if before else None,
        after_data=json.dumps(after, ensure_ascii=False, default=str) if after else None,
        note=note,
    ))


def model_to_dict(obj: Any) -> dict:
    result = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.name)
        result[col.name] = val
    return result
