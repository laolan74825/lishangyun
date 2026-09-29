---
name: backend-api
description: GiftRegistry backend API development agent. Use when writing FastAPI endpoints, SQLAlchemy ORM models, Pydantic schemas, Alembic migrations, or business logic in server/app/. Covers CRUD for persons, guestbooks, gb_records, daily_records, payment_accounts, auth, admin, stats, operation_logs, terminal_settings, family groups, notifications, authorization codes, account management, security modes, and WebSocket collaboration. Enforces ORM-only (no text() SQL), amounts in cents, owner_id data isolation, soft delete, generalized audit log (target_table + target_id), and full type hints.
---

# Backend API Agent — 随礼记账本

Develop and maintain the FastAPI backend for GiftRegistry. All work lives under `server/app/`.

## Tech Stack

- Python 3.14, FastAPI 0.141+, SQLAlchemy 2.0+ (async), Pydantic v2, Alembic 1.20+, PostgreSQL 17（开发与生产环境统一）
- Auth: PyJWT 2 (HS256 JWT) + Argon2 (via passlib) password hashing
- Realtime: websockets 17+ (礼簿协作 WebSocket 服务端)
- HTTP client: httpx 0.28+ (异步邮件发送/外部服务)
- Encryption: cryptography (AES-256 敏感配置加密)
- Package manager: **uv 0.12+** (not pip)

## Hard Constraints

1. **ORM only** — All DB operations via SQLAlchemy 2.0+ ORM. Never use `text()`, `connection.execute()`, or raw SQL strings.
2. **Amounts in cents** — All money fields are `INTEGER` (unit: 分). Never use `Float`/`Decimal` for money. 金额验证范围：最小 100 分（¥1.00），单笔最大 10000000 分（¥100,000.00）。
3. **Type hints everywhere** — Every function must have complete type annotations. 新代码使用 `Annotated[..., Depends(...)]` 进行依赖注入（现有代码全部使用旧式 `= Depends(...)`，逐步迁移中）。
4. **Data isolation** — All business queries must filter by `owner_id`. ⚠ 当前业务模型尚未添加 `owner_id` 列，新增或修改模型时需按需求文档要求添加此字段。
5. **Server-generated UUID** — GbRecord/DailyRecord creation generates UUID server-side (`uuid.uuid4()`). Each insert gets a unique UUID; the UNIQUE constraint on `uuid` column prevents DB-level duplicates.
6. **Generalized audit logging** — 所有业务表（gb_record / daily_record / person / guestbook / payment_account 等）的增删改必须创建 `operation_log` 条目。使用通用模式：`target_table`（被操作表名）+ `target_id`（被操作记录 ID）+ `owner_id`（操作者所属）。action_type 值：`CREATE`/`UPDATE`/`DELETE`/`MERGE`/`ARCHIVE`/`APPROVE`/`REJECT`/`SECURITY_SWITCH`/`PRIVACY_MARK` 等。Logs are immutable (no UPDATE/DELETE on the table)。
7. **Soft delete** — 5 张业务表（gb_record, daily_record, person, payment_account, guestbook）使用软删除：`is_deleted`（BOOLEAN, default=false）+ `deleted_at`（DATETIME, nullable）。删除时标记 `is_deleted=true, deleted_at=now()`，30 天后物理清除。所有业务查询必须过滤 `is_deleted == false`。
8. **Password security** — Argon2 hash only. Admins cannot reset user passwords; users reset via security email verification code (10 min expiry). 登录失败 5 次锁定 30 分钟。
9. **Sync fields** — daily_record 和 person 表含 `is_private`（隐私记录标记，同步云端但仅本人可见）和 `sync_version`（增量同步版本号，每次修改递增 1）。
10. **Guestbook lifecycle** — 礼簿三态生命周期：收礼中(active) → 收尾中(closing) → 已归档(archived)。状态转换完全由用户手动控制，不设自动过期。归档后不可逆，只读锁定。

## Development Flow

```
Requirement → Confirm affected Models → Write/update Schema → Write API route → Write/update Alembic migration → Verify
```

## Code Patterns

### Model Definition (with soft delete)

```python
from datetime import datetime

from sqlalchemy import Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class Example(Base):
    __tablename__ = "examples"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # cents, 范围 [100, 10000000]
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
```

### Model Definition (with sync fields)

```python
class DailyRecord(Base):
    __tablename__ = "daily_records"
    # ... standard columns ...
    is_private: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    sync_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```

### Audit Log (generalized pattern)

```python
from app.models.operation_log import OperationLog

log = OperationLog(
    owner_id=current_user.id,
    guestbook_id=record.guestbook_id,  # 可选，当目标为 gb_record 时必填
    target_table="gb_record",          # 被操作表名
    target_id=record.id,               # 被操作记录 ID
    action_type="CREATE",              # CREATE/UPDATE/DELETE/MERGE/ARCHIVE 等
    before_data=None,                  # UPDATE/DELETE 时记录完整旧数据 (JSON)
    after_data=json.dumps(record_data, ensure_ascii=False, default=str),
    operator_name=operator_name,       # 终端记账员姓名
    client_id=client_id,
    note=None,                         # 可选备注（如审批拒绝原因）
)
db.add(log)
```

### API Route (with pagination + soft delete filter)

```python
from fastapi import APIRouter, Depends, Query
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
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    return (
        db.query(Example)
        .filter(Example.owner_id == current_user.id, Example.is_deleted == False)
        .order_by(Example.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
```

### Pydantic Schema (with amount validation)

```python
from typing import Literal

from pydantic import BaseModel, Field
from datetime import datetime

class ExampleCreate(BaseModel):
    name: str = Field(..., max_length=50)
    amount: int = Field(..., ge=100, le=10000000)          # 分，范围 ¥1.00 ~ ¥100,000
    payment_method: Literal["cash", "wechat", "other"]     # 枚举字符串必须用 Literal 约束
    event_type: Literal["婚礼", "生日", "满月酒", "乔迁", "升学", "丧葬", "节日红包", "其他"]

class ExampleResponse(BaseModel):
    id: int
    name: str
    amount: int
    created_at: datetime
    model_config = {"from_attributes": True}
```

### Role-Based Access

```python
from app.core.dependencies import require_role

# 5 级角色: super_admin / sub_admin / user / family_member / collaborator
AdminUser = Annotated[User, Depends(require_role("super_admin", "sub_admin"))]

# 子管理员权限点检查
@router.get("/admin/stats")
def admin_stats(
    db: DB,
    admin: Annotated[User, Depends(require_role("super_admin", "sub_admin"))],
):
    if admin.role == "sub_admin" and not has_permission(admin, "admin:stats:read"):
        raise HTTPException(403, "权限不足")
    # ...
```

## API Modules

| 路由文件 | 前缀 | 功能 | 状态 |
|----------|------|------|------|
| `auth.py` | `/api/auth` | 注册、登录、密码重置、当前用户、改密 | ✅ 已实现 |
| `admin.py` | `/api/admin` | 用户 CRUD、系统设置、仪表盘、回收站、公告 | ⚠️ 部分 |
| `persons.py` | `/api/persons` | 人员 CRUD + 交易汇总 + 差额调整 | ⚠️ 部分 |
| `guestbooks.py` | `/api/guestbooks` | 礼簿 CRUD + 三态生命周期 + 主人家关联 | ⚠️ 部分 |
| `gb_records.py` | `/api/gb-records` | 收礼记录 CRUD + 批量 + 账户统计 | ⚠️ 部分 |
| `daily_records.py` | `/api/daily-records` | 日常记录 CRUD + 汇总 + 隐私标记 | ⚠️ 部分 |
| `payment_accounts.py` | `/api/payment-accounts` | 收款账户 CRUD + 限额 | ✅ 已实现 |
| `terminal_settings.py` | `/api/terminal-settings` | 终端设置读写 | ✅ 已实现 |
| `operation_logs.py` | `/api/operation-logs` | 通用审计日志查询 | ⚠️ 部分 |
| `stats.py` | `/api/stats` | 统计聚合 | ⚠️ 基础 |
| `family.py` | `/api/family` | 家庭组创建/邀请、成员管理、审批队列 | ❌ 待开发 |
| `notifications.py` | `/api/notifications` | 站内消息列表、已读标记 | ❌ 待开发 |
| `authorization.py` | `/api/authz` | 授权码生成、绑定、撤销 | ❌ 待开发 |
| `account.py` | `/api/account` | 个人资料、安全邮箱、数据导出、注销 | ❌ 待开发 |
| `security.py` | `/api/security` | 安全模式切换、密钥配置 | ❌ 待开发 |

## Project Structure

See `references/project-structure.md` for the full directory tree with file purposes.

## Data Models

See `references/data-models.md` for all ORM models, table names, key columns, and relationships.

## Conventions & Constraints

See `references/conventions.md` for detailed coding conventions, role permissions, error handling patterns, and PostgreSQL migration notes.

## Checklist Before Commit

- [ ] 新增/修改模型时，确认是否需要添加 `owner_id`（数据隔离，需求要求但尚未实施）
- [ ] 金额字段为 INTEGER（分），范围 [100, 10000000]，不使用 Float
- [ ] 无 `text()` 或原生 SQL
- [ ] 所有函数有类型标注，新代码依赖使用 `Annotated`（现有代码为 `= Depends(...)` 模式）
- [ ] 所有业务表的增删改写入 `operation_log`（通用模式：`target_table` + `target_id`，非旧式 `gb_record_id`）
- [ ] 软删除表查询过滤 `is_deleted == false`；删除操作标记 `is_deleted=true, deleted_at=now()`
- [ ] 新增/变更模型有对应的 Alembic 迁移
- [ ] Pydantic 响应模型使用 `model_config = {"from_attributes": True}`
- [ ] Pydantic schema 使用 `Field(max_length=...)` 匹配 `String(N)` 列长度
- [ ] 金额字段使用 `Field(ge=100, le=10000000)` 验证范围
- [ ] 枚举样式的字符串字段使用 `Literal["val1", "val2"]` 类型约束
- [ ] 列表端点实现分页（`limit`/`offset`，默认 page_size=20，max=100）
- [ ] 聚合查询使用 `func.count()`/`func.sum()` 在数据库层执行，不在 Python 层循环计算
- [ ] 涉及 daily_record/person 的修改递增 `sync_version`
- [ ] 隐私记录相关操作正确设置/检查 `is_private` 字段
- [ ] 礼簿状态转换符合三态矩阵（收礼中→收尾中→已归档，归档不可逆）
