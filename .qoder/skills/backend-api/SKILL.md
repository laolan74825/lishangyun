---
name: backend-api
description: GiftRegistry backend API development agent. Use when writing FastAPI endpoints, SQLAlchemy ORM models, Pydantic schemas, Alembic migrations, or business logic in server/app/. Covers CRUD for persons, guestbooks, gb_records, daily_records, payment_accounts, auth, admin, stats, operation_logs, terminal_settings. Enforces ORM-only (no text() SQL), amounts in cents, owner_id data isolation, and full type hints.
---

# Backend API Agent — 随礼记账本

Develop and maintain the FastAPI backend for GiftRegistry. All work lives under `server/app/`.

## Tech Stack

- Python 3.12, FastAPI 0.115+, SQLAlchemy 2.0, Pydantic v2, Alembic 1.13+, SQLite（开发默认）/ PostgreSQL 16（生产）
- Auth: python-jose (HS256 JWT) + bcrypt password hashing
- Package manager: **uv** (not pip)

## Hard Constraints

1. **ORM only** — All DB operations via SQLAlchemy 2.0 ORM. Never use `text()`, `connection.execute()`, or raw SQL strings.
2. **Amounts in cents** — All money fields are `INTEGER` (unit: 分). Never use `Float`/`Decimal` for money.
3. **Type hints everywhere** — Every function must have complete type annotations. 新代码使用 `Annotated[..., Depends(...)]` 进行依赖注入（现有代码全部使用旧式 `= Depends(...)`，逐步迁移中）。
4. **Data isolation** — All business queries must filter by `owner_id`. ⚠ 当前业务模型尚未添加 `owner_id` 列，新增或修改模型时需按需求文档要求添加此字段。
5. **Server-generated UUID** — GbRecord creation generates UUID server-side (`uuid.uuid4()`). Each insert gets a unique UUID; the UNIQUE constraint on `uuid` column prevents DB-level duplicates.
6. **Audit logging** — GbRecord create/update/delete must write to `operation_log`（字段名：`gb_record_id`, `action_type`, `before_data`, `after_data`；action_type 值为大写 `"CREATE"`/`"UPDATE"`/`"DELETE"`）。Logs are immutable (no UPDATE/DELETE on the table).
7. **Password security** — bcrypt hash only. Admins cannot reset user passwords; users reset via security email.

## Development Flow

```
Requirement → Confirm affected Models → Write/update Schema → Write API route → Write/update Alembic migration → Verify
```

## Code Patterns

### Model Definition

```python
from datetime import datetime

from sqlalchemy import Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class Example(Base):
    __tablename__ = "examples"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)  # ⚠ 待添加
    name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # cents
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
```

### API Route

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Annotated
from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/examples", tags=["examples"])

@router.get("/")
def list_examples(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return db.query(Example).filter(Example.owner_id == current_user.id).all()
```

### Pydantic Schema

```python
from typing import Literal

from pydantic import BaseModel, Field
from datetime import datetime

class ExampleCreate(BaseModel):
    name: str = Field(..., max_length=50)
    amount: int = Field(..., ge=0)                        # cents, 不允许负数
    payment_method: Literal["cash", "wechat", "other"]    # 枚举字符串必须用 Literal 约束

class ExampleResponse(BaseModel):
    id: int
    name: str
    amount: int
    created_at: datetime
    model_config = {"from_attributes": True}
```

## Project Structure

See `references/project-structure.md` for the full directory tree with file purposes.

## Data Models

See `references/data-models.md` for all ORM models, table names, key columns, and relationships.

## Conventions & Constraints

See `references/conventions.md` for detailed coding conventions, role permissions, error handling patterns, and PostgreSQL migration notes.

## Checklist Before Commit

- [ ] 新增/修改模型时，确认是否需要添加 `owner_id`（数据隔离，需求要求但尚未实施）
- [ ] 金额字段为 INTEGER（分），不使用 Float
- [ ] 无 `text()` 或原生 SQL
- [ ] 所有函数有类型标注，新代码依赖使用 `Annotated`（现有代码为 `= Depends(...)` 模式）
- [ ] GbRecord 的增删改写入 `operation_log`（字段名：`guestbook_id`, `gb_record_id`, `action_type`, `before_data`, `after_data`）
- [ ] 新增/变更模型有对应的 Alembic 迁移
- [ ] Pydantic 响应模型使用 `model_config = {"from_attributes": True}`
- [ ] OperationLog 列名正确：`gb_record_id`（非 record_id）、`action_type`（非 action）、`before_data`/`after_data`（非 before_snapshot/after_snapshot）
- [ ] Pydantic schema 使用 `Field(max_length=...)` 匹配 `String(N)` 列长度，金额字段使用 `Field(ge=0)`
- [ ] 枚举样式的字符串字段使用 `Literal["val1", "val2"]` 类型约束
- [ ] 列表端点实现分页（`limit`/`offset`，默认 page_size=20，max=100）
- [ ] 聚合查询使用 `func.count()`/`func.sum()` 在数据库层执行，不在 Python 层循环计算
