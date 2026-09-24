# Conventions & Constraints Reference

## Coding Conventions

### Python Style

- **Type hints**: All function signatures must have complete type annotations.
- **Annotated dependencies**: Prefer `Annotated[Type, Depends(...)]` over inline `= Depends(...)`.
- **Docstrings**: Use for public API endpoints (brief, one-line).
- **Naming**: snake_case for functions/variables, PascalCase for classes, UPPER_SNAKE for constants.
- **Imports**: Group as stdlib → third-party → app-local, alphabetically within each group.

### FastAPI Patterns

```python
# Router declaration
router = APIRouter(prefix="/resource", tags=["resource"])

# Dependency injection (preferred Annotated style)
from typing import Annotated
from fastapi import Depends
from sqlalchemy.orm import Session

DB = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

# Role-based access
from app.core.dependencies import require_role
AdminUser = Annotated[User, Depends(require_role("admin"))]

# Response model
@router.get("/", response_model=list[ResourceResponse])
def list_resources(db: DB, current_user: CurrentUser):
    return db.query(Resource).filter(Resource.owner_id == current_user.id).all()

# Error responses — 404 使用按资源类型不同的消息
raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="礼簿不存在")  # 或 "记录不存在"/"人员不存在"/"账户不存在"/"用户不存在"
raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")
raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户名已存在")  # 或具体字段错误信息
```

### Pydantic Schema Conventions

```python
from typing import Literal
from pydantic import BaseModel, Field
from datetime import datetime

# Request schema — 使用 Field() 验证约束，Literal 约束枚举字符串
class ResourceCreate(BaseModel):
    name: str = Field(..., max_length=50)                          # 匹配 String(50) 列长度
    amount: int = Field(..., ge=0)                                 # 金额不允许负数
    payment_method: Literal["cash", "wechat", "other"]             # 枚举字符串用 Literal
    status: Literal["收礼中", "已完成"] = "收礼中"                    # 带默认值的枚举
    note: str | None = Field(None, max_length=500)                 # 可选字段 + 长度限制

# Update schema — 所有字段可选
class ResourceUpdate(BaseModel):
    name: str | None = Field(None, max_length=50)
    amount: int | None = Field(None, ge=0)

# Response schema — enable ORM mapping
class ResourceResponse(BaseModel):
    id: int
    name: str
    amount: int
    created_at: datetime
    model_config = {"from_attributes": True}
```

**Field() 验证规则对照表：**

| 模型列定义 | Schema 验证 |
|-----------|------------|
| `String(N)` | `Field(..., max_length=N)` |
| `Integer`（金额） | `Field(..., ge=0)` |
| `Integer`（daily_limit） | `Field(default=2000000000, ge=0)` |
| 枚举样式字符串 | `Literal["val1", "val2"]` |

### Data Isolation Pattern（待实施）

> ⚠ 当前代码中业务模型尚未添加 `owner_id` 列。以下是需求文档要求的目标模式，在 `owner_id` 添加后使用。

所有业务端点必须按 owner_id 过滤：

```python
# 正确 — 按当前用户过滤
items = db.query(Person).filter(Person.owner_id == current_user.id).all()

# 错误 — 无 owner 过滤（数据泄漏）
items = db.query(Person).all()
```

在 `owner_id` 添加之前，当前代码暂无此过滤。添加 `owner_id` 时需同步更新所有业务查询。

### Audit Log Pattern

GbRecord mutations must create operation_log entries.注意使用正确的列名：

```python
from app.models.operation_log import OperationLog

log = OperationLog(
    guestbook_id=record.guestbook_id,
    gb_record_id=record.id,           # 注意：字段名是 gb_record_id，不是 record_id
    action_type="CREATE",             # 注意：字段名是 action_type，不是 action；值为大写 CREATE/UPDATE/DELETE
    before_data=None,                 # 注意：字段名是 before_data，不是 before_snapshot
    after_data=json.dumps(record_data, ensure_ascii=False, default=str),  # 注意：字段名是 after_data；default=str 处理 datetime 等不可序列化类型
    operator_name=operator_name,      # 注意：来自终端操作员参数，不是 current_user.username
    client_id=client_id,
    # owner_id=current_user.id,       # ⚠ 待添加：OperationLog 尚未有 owner_id 列
)
db.add(log)
```

OperationLog 是**不可变的**：禁止对该表执行 UPDATE 或 DELETE。

## Role Permission System

> ⚠ 当前代码中角色体系尚未完全实现。现有代码使用 `"admin"` 和 `"editor"` 两个角色（见 auth.py register 默认 role="admin"，User model default role="editor"）。目标角色体系如下，待后续开发：

| 角色 | 标识 | 权限范围 |
|------|------|----------|
| 超级管理员 | `super_admin` | 全部系统管理权限，系统初始化时创建 |
| 子管理员 | `sub_admin` | 被授权的特定管理职能（权限点机制） |
| 普通用户 | `user` | 个人数据完全控制，终端注册 |
| 家庭成员 | `family_member` | 共享记账本的协作权限（邀请+审核） |
| 临时协作者 | `collaborator` | 指定礼簿的有限操作权限（授权码） |

使用 `require_role()` 依赖保护管理员端点：

```python
@router.delete("/users/{user_id}")
def delete_user(user_id: int, admin: AdminUser = ..., db: DB = ...):
```

## Error Handling

| Scenario | Status Code | Detail Message |
|----------|------------|----------------|
| Invalid credentials (login) | 401 | "用户名或密码错误" |
| Token expired/invalid | 401 | "无效的认证令牌" |
| User disabled (login) | 403 | "账户已被禁用" |
| User disabled (get_current_user) | 401 | "用户不存在或已禁用" |
| Insufficient role | 403 | "权限不足" |
| Resource not found | 404 | 按资源类型不同："礼簿不存在"/"记录不存在"/"人员不存在"/"账户不存在"/"用户不存在" |
| Validation error | 400 | 具体字段错误信息（如"用户名已存在"） |
| Duplicate resource | 400 | "用户名已存在" |

## Alembic Migration Workflow

```bash
# After modifying models:
cd server
alembic revision --autogenerate -m "description of change"

# Review the generated script in alembic/versions/
# Then apply:
alembic upgrade head

# Rollback one step:
alembic downgrade -1
```

Rules:
- Never modify an already-applied migration. Create a new one instead.
- Always write a working `downgrade()` function.
- Review auto-generated scripts — Alembic may detect false positives (e.g., index renames).
- Run `alembic check` to verify model/migration alignment.

## Package Management

```bash
# Add dependency
uv pip install <package>
# Then add to requirements.txt manually or use:
uv pip freeze > requirements.txt

# Install from requirements
uv pip install -r requirements.txt
```

## Performance Notes

- Target: 3000+ records per guestbook with smooth operation.

### 分页

所有列表端点必须实现分页：

```python
@router.get("/", response_model=list[ResourceResponse])
def list_resources(
    db: DB,
    current_user: CurrentUser,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    return (
        db.query(Resource)
        .filter(Resource.owner_id == current_user.id)
        .order_by(Resource.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
```

### 数据库层聚合

使用 `func.count()` / `func.sum()` 在数据库层执行聚合，不在 Python 层循环计算：

```python
from sqlalchemy import func

# 正确 — 数据库层聚合
total = db.query(func.sum(GbRecord.amount)).filter(
    GbRecord.guestbook_id == gb_id
).scalar() or 0

# 错误 — Python 层循环（3000+ 记录时性能差）
records = db.query(GbRecord).filter(GbRecord.guestbook_id == gb_id).all()
total = sum(r.amount for r in records)
```

### 索引

- Index all `owner_id`, `guestbook_id`, and frequently-filtered columns.
- 所有 `ForeignKey` 列必须有 `index=True`。
