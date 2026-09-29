import json
import math
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.operation_log import OperationLog


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
