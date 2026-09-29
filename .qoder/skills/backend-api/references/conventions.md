# Conventions & Constraints Reference

## Coding Conventions

### Python Style

- **Type hints**: All function signatures must have complete type annotations.
- **Annotated dependencies**: Prefer `Annotated[Type, Depends(...)]` over inline `= Depends(...)`.
- **Async endpoints**: All endpoints use `async def`，数据库操作通过 `AsyncSession`。
- **Docstrings**: Use for public API endpoints (brief, one-line).
- **Naming**: snake_case for functions/variables, PascalCase for classes, UPPER_SNAKE for constants.
- **Imports**: Group as stdlib → third-party → app-local, alphabetically within each group.
- **Linter**: Ruff（替代 flake8/black/isort）。

### FastAPI Patterns

```python
# Router declaration
router = APIRouter(prefix="/resource", tags=["resource"])

# Type alias for common dependencies
from typing import Annotated
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

DB = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

# Role-based access
from app.core.dependencies import require_role
AdminUser = Annotated[User, Depends(require_role("admin"))]
SuperAdmin = Annotated[User, Depends(require_role("super_admin"))]

# Sub-admin permission point check
from app.core.dependencies import require_permission
CanManageUsers = Annotated[User, Depends(require_permission("admin:user:write"))]

# Response model with pagination envelope
@router.get("/", response_model=PaginatedResponse[ResourceResponse])
async def list_resources(
    db: DB,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    query = db.query(Resource).filter(
        Resource.owner_id == current_user.id,
        Resource.is_deleted == False,
    )
    total = query.count()
    items = query.order_by(Resource.created_at.desc())\
        .offset((page - 1) * page_size).limit(page_size).all()
    return {"items": items, "pagination": {
        "page": page, "page_size": page_size,
        "total_count": total, "total_pages": (total + page_size - 1) // page_size,
    }}

# Error responses — 404 使用按资源类型不同的消息
raise HTTPException(status_code=404, detail="礼簿不存在")  # 或 "记录不存在"/"人员不存在"/"账户不存在"/"用户不存在"/"家庭组不存在"
raise HTTPException(status_code=403, detail="权限不足")
raise HTTPException(status_code=400, detail="用户名已存在")
```

### Pydantic Schema Conventions

```python
from typing import Literal
from pydantic import BaseModel, Field
from datetime import datetime, date

# Request schema — 使用 Field() 验证约束，Literal 约束枚举字符串
class ResourceCreate(BaseModel):
    name: str = Field(..., max_length=50)                          # 匹配 String(50) 列长度
    amount: int = Field(..., ge=100, le=10000000)                  # 金额范围：¥1 ~ ¥100,000（单位分）
    payment_method: Literal["cash", "wechat", "other"]             # 枚举字符串用 Literal
    event_type: Literal["wedding", "birthday", "fullmoon", "housewarming",
                        "graduation", "funeral", "holiday", "other"]  # 8 种事由
    note: str | None = Field(None, max_length=500)                 # 可选字段 + 长度限制

# Guestbook status — 三态生命周期
class GuestbookCreate(BaseModel):
    status: Literal["active", "closing", "archived"] = "active"

# GbRecord check_status — 含 disputed
class GbRecordUpdate(BaseModel):
    check_status: Literal["unchecked", "checked", "disputed"] | None = None

# Update schema — 所有字段可选
class ResourceUpdate(BaseModel):
    name: str | None = Field(None, max_length=50)
    amount: int | None = Field(None, ge=100, le=10000000)

# Response schema — enable ORM mapping
class ResourceResponse(BaseModel):
    id: int
    name: str
    amount: int
    created_at: datetime
    model_config = {"from_attributes": True}

# Paginated response envelope
class PaginationInfo(BaseModel):
    page: int
    page_size: int
    total_count: int
    total_pages: int

class PaginatedResponse(BaseModel):
    items: list[T]  # 泛型，T 为具体响应模型
    pagination: PaginationInfo
```

**Field() 验证规则对照表：**

| 模型列定义 | Schema 验证 |
|-----------|------------|
| `String(N)` | `Field(..., max_length=N)` |
| `Integer`（金额） | `Field(..., ge=100, le=10000000)` |
| `Integer`（daily_limit） | `Field(default=20000000, ge=0)` |
| `Integer`（差额调整） | `Field(...)` — 允许正负数 |
| 枚举样式字符串 | `Literal["val1", "val2"]` |

### Data Isolation Pattern（待实施）

> ⚠ 当前代码中业务模型尚未添加 `owner_id` 列。以下是目标模式。

所有业务端点必须按 owner_id 过滤，且过滤软删除：

```python
# 正确 — 按当前用户过滤 + 过滤软删除
items = (
    db.query(Person)
    .filter(Person.owner_id == current_user.id, Person.is_deleted == False)
    .all()
)

# 错误 — 无 owner 过滤（数据泄漏）
items = db.query(Person).all()

# 错误 — 未过滤软删除（返回已删除数据）
items = db.query(Person).filter(Person.owner_id == current_user.id).all()
```

### Soft Delete Pattern

5 张表使用软删除（gb_records, daily_records, persons, payment_accounts, guestbooks）：

```python
# 删除操作 — 设置软删除标记
async def soft_delete_record(db: AsyncSession, record: GbRecord) -> None:
    record.is_deleted = True
    record.deleted_at = datetime.utcnow()
    await db.commit()

# 查询 — 默认过滤已删除
query = db.query(GbRecord).filter(
    GbRecord.owner_id == current_user.id,
    GbRecord.is_deleted == False,
)

# 回收站查询 — 仅查看已删除（待实现）
query = db.query(GbRecord).filter(
    GbRecord.owner_id == current_user.id,
    GbRecord.is_deleted == True,
)

# 定时物理清除 — 30 天后（待实现）
cutoff = datetime.utcnow() - timedelta(days=30)
stale = db.query(GbRecord).filter(
    GbRecord.is_deleted == True,
    GbRecord.deleted_at < cutoff,
).all()
for record in stale:
    await db.delete(record)
```

### Audit Log Pattern（通用化）

所有关键业务操作的增删改必须创建 operation_log 条目。使用通用 `target_table` + `target_id` 模式：

```python
from app.models.operation_log import OperationLog
import json

# 创建审计日志
log = OperationLog(
    owner_id=current_user.id,
    target_table="gb_record",          # 目标表名
    target_id=record.id,               # 目标记录 ID
    guestbook_id=record.guestbook_id,  # 可选，仅 gb_record 相关操作时必填
    action_type="CREATE",              # 大写: CREATE/UPDATE/DELETE/MERGE/ARCHIVE/APPROVE/REJECT/SECURITY_SWITCH/PRIVACY_MARK
    before_data=None,                  # UPDATE/DELETE 时有值
    after_data=json.dumps(record_data, ensure_ascii=False, default=str),  # CREATE/UPDATE 时有值
    operator_name=operator_name,       # 终端操作员或操作者
    client_id=client_id,               # 可选
    note=None,                         # 可选备注（审批拒绝时填原因）
)
db.add(log)

# UPDATE 操作 — 记录 before 和 after
log = OperationLog(
    owner_id=current_user.id,
    target_table="daily_record",
    target_id=record.id,
    action_type="UPDATE",
    before_data=json.dumps(old_data, ensure_ascii=False, default=str),
    after_data=json.dumps(new_data, ensure_ascii=False, default=str),
    operator_name=current_user.username,
)
```

**审计日志覆盖范围：**

| 操作 | target_table | action_type |
|------|-------------|-------------|
| 收礼记录增删改 | gb_record | CREATE / UPDATE / DELETE |
| 收礼记录合并 | gb_record | MERGE |
| 日常记录增删改 | daily_record | CREATE / UPDATE / DELETE |
| 礼簿创建/状态变更/删除 | guestbook | CREATE / UPDATE / DELETE |
| 人员合并 | person | MERGE |
| 人员增删改 | person | CREATE / UPDATE / DELETE |
| 收款账户增删改 | payment_account | CREATE / UPDATE / DELETE |
| 家庭组创建 | family_group | CREATE |
| 家庭成员加入/移除 | family_member | CREATE / DELETE |
| 审批通过/拒绝 | pending_approval | APPROVE / REJECT |
| 安全模式切换 | user_key_config | SECURITY_SWITCH |
| 隐私标记变更 | daily_record / gb_record / person | PRIVACY_MARK |

OperationLog 是**不可变的**：禁止对该表执行 UPDATE 或 DELETE。

### Login Lockout Pattern（待实现）

```python
# 登录失败 5 次锁定 30 分钟
MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 30

async def check_lockout(user: User) -> None:
    if user.locked_until and user.locked_until > datetime.utcnow():
        raise HTTPException(status_code=423, detail="账户已锁定，请 30 分钟后重试")

async def record_failed_login(db: AsyncSession, user: User) -> None:
    user.failed_login_count += 1
    if user.failed_login_count >= MAX_FAILED_LOGINS:
        user.locked_until = datetime.utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
        user.failed_login_count = 0
    await db.commit()

async def reset_login_counter(db: AsyncSession, user: User) -> None:
    user.failed_login_count = 0
    user.locked_until = None
    await db.commit()
```

### Sub-Admin Permission Points

子管理员通过权限点机制获得特定管理职能：

| 权限点 | 标识 | 说明 |
|--------|------|------|
| 用户查看 | `admin:user:read` | 查看所有用户信息 |
| 用户管理 | `admin:user:write` | 创建、编辑、禁用用户 |
| 审计日志 | `admin:audit:read` | 查看操作审计日志 |
| 系统配置 | `admin:config:write` | 修改系统参数 |
| 公告管理 | `admin:notice:write` | 发布/编辑公告 |
| 数据备份 | `admin:backup:write` | 触发数据备份 |
| 统计查看 | `admin:stats:read` | 查看仪表盘 |

```python
# 使用权限点保护端点
@router.post("/users")
async def create_user(
    db: DB,
    admin: CanManageUsers,  # require_permission("admin:user:write")
    user_data: UserCreate,
):
    ...
```

## Role Permission System

> ⚠ 当前代码仅有 `admin` / `editor` 两个角色。目标 5 级角色体系如下：

| 角色 | 标识 | 权限范围 |
|------|------|----------|
| 超级管理员 | `super_admin` | 全部系统管理权限，系统初始化时创建，不参与账簿管理 |
| 子管理员 | `sub_admin` | 被授权的特定管理职能（权限点机制） |
| 普通用户 | `user` | 个人数据完全控制，终端注册默认角色 |
| 家庭成员 | `family_member` | 共享记账本协作（邀请+审核） |
| 临时协作者 | `collaborator` | 指定礼簿的有限操作（授权码） |

**安全原则：**
- 密码重置只能由用户本人通过安全邮箱验证码操作，管理员无权重置
- 所有业务查询必须按 `owner_id` 过滤
- 操作日志不可变（禁止 UPDATE/DELETE）
- `super_admin` 不参与账簿管理，仅管理系统运维和配置

## Error Handling

| Scenario | Status Code | Detail Message |
|----------|------------|----------------|
| Invalid credentials (login) | 401 | "用户名或密码错误" |
| Account locked | 423 | "账户已锁定，请 30 分钟后重试" |
| Token expired/invalid | 401 | "无效的认证令牌" |
| User disabled | 401 | "用户不存在或已禁用" |
| Insufficient role | 403 | "权限不足" |
| Resource not found | 404 | 按资源类型："礼簿不存在"/"记录不存在"/"人员不存在"/"账户不存在"/"用户不存在"/"家庭组不存在" |
| Validation error | 400 | 具体字段错误信息 |
| Duplicate resource | 400 | "用户名已存在" |
| Guestbook archived (write attempt) | 400 | "已归档的礼簿不可修改" |
| Approval expired | 400 | "审批已过期，请重新提交" |
| Invite code expired | 400 | "邀请码已过期" |

## WebSocket Pattern（待实现）

礼簿现场协作使用 WebSocket 实时同步：

```python
from fastapi import WebSocket, WebSocketDisconnect
from app.core.websocket_manager import ConnectionManager

manager = ConnectionManager()

@router.websocket("/ws/guestbook/{guestbook_id}")
async def guestbook_ws(websocket: WebSocket, guestbook_id: int):
    await manager.connect(websocket, guestbook_id)
    try:
        while True:
            data = await websocket.receive_json()
            # 处理消息类型: new_record / update_record / sync_request
            await manager.broadcast(guestbook_id, data, exclude=websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket, guestbook_id)

# 同步协议:
# - 新记录: {type: "new_record", record: {...}, uuid: "..."}
# - 冲突标记: {type: "conflict", uuid: "...", local_data: {...}, remote_data: {...}}
# - 5 秒心跳保活
# - UUID 防重: 服务端检查 uuid 唯一性
```

## Data Import Validation（待实现）

```python
# 导入校验规则
IMPORT_VALIDATION = {
    "amount_range": (100, 10000000),      # 分，¥1 ~ ¥100,000
    "date_format": ["YYYY-MM-DD", "YYYY/MM/DD"],
    "max_rows": 10000,
    "max_file_size_mb": 5,
    "encodings": ["utf-8", "gbk", "gb2312"],
    "payment_methods": ["cash", "wechat", "other"],
}

# 日常记录事由: 8 种（含 holiday）
DAILY_EVENT_TYPES = ["wedding", "birthday", "fullmoon", "housewarming",
                     "graduation", "funeral", "holiday", "other"]

# 礼簿记录事由: 7 种（不含 holiday）
GUESTBOOK_EVENT_TYPES = ["wedding", "birthday", "fullmoon", "housewarming",
                         "graduation", "funeral", "other"]

# 重复检测: (姓名 + 金额 + 日期) 组合判断
# 部分导入模式: 校验通过的行导入，失败的行跳过并生成错误报告
# 错误报告: Excel 文件，含原数据 + 错误列（行号、字段名、错误描述）
# 事务控制: 单次导入为单个事务
```

## Security Mode Switching（待实现）

```python
# 普通 → 增强: 引导生成密钥 → 备份助记词 → 加密本地数据 → 上传密文
# 增强 → 普通: 验证助记词/密钥 → 解密云端数据 → 二次确认 → 切换加密方式
# 切换操作必须记录审计日志 (target_table="user_key_config", action_type="SECURITY_SWITCH")

# 增强安全模式关键约束:
# - 密钥仅存储于用户设备（IndexedDB 加密区域），永不上传服务端
# - mnemonic_hash 仅用于验证助记词正确性，不存储明文
# - encrypted_key/encrypted_family_key 均为客户端加密密文
# - 通知内容不包含敏感数据
```

## Family Approval Workflow（待实现）

```python
# 家人提交修改 → 进入 pending_approval 表
# 主账户审批:
#   通过 → 根据 payload 写入业务表 + 通知提交人 (approval_approved)
#   拒绝 → 填写拒绝原因 + 通知提交人 (approval_rejected)
# 自动过期: 超 30 天未处理 → 标记 expired + 通知提交人 (approval_expired)
# 待审批记录在审批前不影响家庭共享数据池
```

## Alembic Migration Workflow

```bash
cd server
alembic revision --autogenerate -m "description of change"
alembic upgrade head        # 应用
alembic downgrade -1        # 回退一步
alembic check               # 验证模型/迁移一致性
```

Rules:
- Never modify an already-applied migration. Create a new one instead.
- Always write a working `downgrade()` function.
- Review auto-generated scripts — Alembic may detect false positives.
- Run `alembic check` to verify model/migration alignment.

## Package Management

```bash
# Add dependency (使用 uv，不用 pip)
uv pip install <package>
uv pip freeze > requirements.txt

# Install from requirements
uv pip install -r requirements.txt
```

## Performance Notes

- Target: 3000+ records per guestbook with smooth operation.

### 分页

所有列表端点必须实现分页（默认 page=1, page_size=20, max=100）：

```python
@router.get("/", response_model=PaginatedResponse[ResourceResponse])
async def list_resources(
    db: DB,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    query = db.query(Resource).filter(
        Resource.owner_id == current_user.id,
        Resource.is_deleted == False,
    )
    total = query.count()
    items = query.order_by(Resource.created_at.desc())\
        .offset((page - 1) * page_size).limit(page_size).all()
    return {"items": items, "pagination": {
        "page": page, "page_size": page_size,
        "total_count": total, "total_pages": (total + page_size - 1) // page_size,
    }}
```

**需分页的端点：** 日常记录列表、礼簿列表、礼簿收礼记录、人员列表、操作日志、待审批队列、通知列表。

**特殊：** Dashboard "最近记录" 固定返回 5 条不分页。单礼簿 3000+ 条时前端虚拟滚动。

### 数据库层聚合

使用 `func.count()` / `func.sum()` 在数据库层聚合，不在 Python 层循环：

```python
from sqlalchemy import func

# 正确 — 数据库层聚合
total = await db.scalar(
    select(func.sum(GbRecord.amount)).where(
        GbRecord.guestbook_id == gb_id,
        GbRecord.is_deleted == False,
    )
) or 0

# 错误 — Python 层循环（3000+ 记录时性能差）
records = db.query(GbRecord).filter(GbRecord.guestbook_id == gb_id).all()
total = sum(r.amount for r in records)
```

### 索引

- 独立业务表索引以 `(owner_id, ...)` 开头
- 关联表索引以 `(guestbook_id, ...)` 开头
- 所有 `ForeignKey` 和 `owner_id` 列必须有 `index=True`
- 时间字段降序索引优化"最新记录"查询
- 详见 data-models.md 索引策略章节
