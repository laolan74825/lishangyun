# Data Models Reference

All models inherit from `Base` (defined in `app/database.py`). Use SQLAlchemy 2.0 mapped column syntax.

## Model Registry

> **重要说明：** 标注 `⚠ 待添加 owner_id` 的模型，表示当前代码中尚未实现 `owner_id` 字段。根据需求文档（用户管理需求规划.md），所有业务模型必须添加 `owner_id` 以实现数据隔离。在添加之前，这些字段不存在于实际代码中。

| Model | Table | Key Columns | Notes |
|-------|-------|-------------|-------|
| User | `users` | id, username (UNIQUE), password_hash, role, email, is_active, created_at, updated_at | 角色: admin / editor（当前代码有两种角色，待扩展为 super_admin/sub_admin/user/family_member/collaborator）。仅有 is_active 禁用机制，无软删除（无 deleted_at 列） |
| Person | `persons` | id, name, nickname, phone, aliases (JSON text), relation_tag, note, created_at | ⚠ 待添加 owner_id。别名通过 @property 以 JSON 字符串存取 |
| PaymentAccount | `payment_accounts` | id, name, type (cash/wechat), identifier, daily_limit, qr_code, is_active, created_at | ⚠ 待添加 owner_id。微信类型需 qr_code + daily_limit 限额 |
| Guestbook | `guestbooks` | id, name, event_type, event_date (Date), status, created_at, completed_at, operator_note | ⚠ 待添加 owner_id。status 默认值 "收礼中"（非 "active"） |
| GbRecord | `gb_records` | id, uuid (UNIQUE), guestbook_id, person_id, guest_name, phone, amount, payment_method, account_id, note, agent_name, check_status, record_time, client_id, operator_name, created_at | ⚠ 待添加 owner_id。核心业务表，UUID 防重，金额单位为分 |
| DailyRecord | `daily_records` | id, uuid (UNIQUE), type (String(3)), person_id, person_name, phone, amount, event_type, payment_method, account_id, event_date (Date), note, source, source_id, created_by, created_at, updated_at | ⚠ 待添加 owner_id。type 值为 "in"/"out"（String(3)），source 标记来源 |
| OperationLog | `operation_logs` | id, guestbook_id, gb_record_id, action_type, operator_name, client_id, before_data (Text/JSON), after_data (Text/JSON), created_at | ⚠ 待添加 owner_id。不可变审计日志，禁止 UPDATE/DELETE |
| TerminalSettings | `terminal_settings` | id, guestbook_id, client_id, operator_name, default_cash_account, default_wechat_account, updated_at | ⚠ 待添加 owner_id。UNIQUE(guestbook_id, client_id)，两个默认账户字段分别对应现金和微信 |
| SystemSetting | `system_settings` | key (PK, String(50)), value (Text, nullable) | 全局键值配置，主键为 key 而非自增 id |
| ResetCode | `reset_codes` | id, email, code, expires_at, used | 密码重置验证码，10 分钟过期 |

## 当前模型实际列定义

### User (users)

```python
id: Mapped[int]                   # PK, autoincrement
username: Mapped[str]             # String(50), UNIQUE, NOT NULL
password_hash: Mapped[str]        # String(128), NOT NULL
role: Mapped[str]                 # String(20), NOT NULL, default="editor"
email: Mapped[str | None]         # String(100), nullable
is_active: Mapped[bool]           # Boolean, NOT NULL, default=True
created_at: Mapped[datetime]      # DateTime, NOT NULL
updated_at: Mapped[datetime]      # DateTime, NOT NULL, onupdate=datetime.utcnow
```

### Person (persons)

```python
id: Mapped[int]                   # PK, autoincrement
name: Mapped[str]                 # String(50), NOT NULL, index
nickname: Mapped[str | None]      # String(50), nullable
phone: Mapped[str | None]         # String(20), nullable, index
_aliases: Mapped[str]             # column "aliases", Text, NOT NULL, default="[]"  → @property 存取 JSON
relation_tag: Mapped[str]         # String(20), NOT NULL, default="其他"
note: Mapped[str | None]          # Text, nullable
created_at: Mapped[datetime]      # DateTime, NOT NULL
# ⚠ 缺少 owner_id — 待添加
```

### PaymentAccount (payment_accounts)

```python
id: Mapped[int]                   # PK, autoincrement
name: Mapped[str]                 # String(50), NOT NULL
type: Mapped[str]                 # String(10), NOT NULL, index  → "cash" | "wechat"
identifier: Mapped[str | None]    # String(50), nullable
daily_limit: Mapped[int]          # Integer, NOT NULL, default=2000000000  → 单位：分
qr_code: Mapped[str | None]       # Text, nullable
is_active: Mapped[bool]           # Boolean, NOT NULL, default=True, index
created_at: Mapped[datetime]      # DateTime, NOT NULL
# ⚠ 缺少 owner_id — 待添加
```

### Guestbook (guestbooks)

```python
id: Mapped[int]                   # PK, autoincrement
name: Mapped[str]                 # String(100), NOT NULL  → 注意：字段名是 name 而非 title
event_type: Mapped[str]           # String(30), NOT NULL
event_date: Mapped[date]          # Date, NOT NULL, index
status: Mapped[str]               # String(20), NOT NULL, default="收礼中", index
created_at: Mapped[datetime]      # DateTime, NOT NULL
completed_at: Mapped[datetime | None]  # DateTime, nullable
operator_note: Mapped[str | None] # Text, nullable
# ⚠ 缺少 owner_id — 待添加
```

### GbRecord (gb_records)

```python
id: Mapped[int]                   # PK, autoincrement
uuid: Mapped[str]                 # String(36), UNIQUE, NOT NULL, index
guestbook_id: Mapped[int]         # Integer, FK→guestbooks.id ON DELETE CASCADE, NOT NULL, index
person_id: Mapped[int | None]     # Integer, FK→persons.id ON DELETE SET NULL, nullable, index
guest_name: Mapped[str]           # String(50), NOT NULL, index
phone: Mapped[str | None]         # String(20), nullable
amount: Mapped[int]               # Integer, NOT NULL  → 单位：分
payment_method: Mapped[str]       # String(10), NOT NULL
account_id: Mapped[int | None]    # Integer, FK→payment_accounts.id ON DELETE SET NULL, nullable, index
note: Mapped[str | None]          # Text, nullable
agent_name: Mapped[str | None]    # String(50), nullable
check_status: Mapped[str]         # String(20), NOT NULL, default="unchecked", index
record_time: Mapped[datetime]     # DateTime, NOT NULL, default=datetime.utcnow, index
client_id: Mapped[str | None]     # String(50), nullable
operator_name: Mapped[str | None] # String(50), nullable
created_at: Mapped[datetime]      # DateTime, NOT NULL
# ⚠ 缺少 owner_id — 待添加
```

### DailyRecord (daily_records)

```python
id: Mapped[int]                   # PK, autoincrement
uuid: Mapped[str]                 # String(36), UNIQUE, NOT NULL, index
type: Mapped[str]                 # String(3), NOT NULL, index  → "in" | "out"
person_id: Mapped[int | None]     # Integer, nullable, index
person_name: Mapped[str]          # String(50), NOT NULL
phone: Mapped[str | None]         # String(20), nullable
amount: Mapped[int]               # Integer, NOT NULL  → 单位：分
event_type: Mapped[str]           # String(30), NOT NULL
payment_method: Mapped[str | None] # String(10), nullable
account_id: Mapped[int | None]    # Integer, nullable
event_date: Mapped[datetime]      # Date (mapped as datetime), NOT NULL, index
note: Mapped[str | None]          # Text, nullable
source: Mapped[str]               # String(10), NOT NULL, default="daily"
source_id: Mapped[int | None]     # Integer, nullable
created_by: Mapped[str | None]    # String(50), nullable
created_at: Mapped[datetime]      # DateTime, NOT NULL
updated_at: Mapped[datetime]      # DateTime, NOT NULL, onupdate=datetime.utcnow
# ⚠ 缺少 owner_id — 待添加
```

### OperationLog (operation_logs)

```python
id: Mapped[int]                   # PK, autoincrement
guestbook_id: Mapped[int]         # Integer, NOT NULL, index  → 注意：无 FK 约束
gb_record_id: Mapped[int | None]  # Integer, nullable  → 注意：字段名是 gb_record_id 而非 record_id
action_type: Mapped[str]          # String(20), NOT NULL  → 注意：字段名是 action_type 而非 action
operator_name: Mapped[str | None] # String(50), nullable
client_id: Mapped[str | None]     # String(50), nullable
before_data: Mapped[str | None]   # Text, nullable  → JSON 字符串，注意：字段名是 before_data 而非 before_snapshot
after_data: Mapped[str | None]    # Text, nullable  → JSON 字符串，注意：字段名是 after_data 而非 after_snapshot
created_at: Mapped[datetime]      # DateTime, NOT NULL, index
# ⚠ 缺少 owner_id — 待添加
```

### TerminalSettings (terminal_settings)

```python
# __table_args__ = (UniqueConstraint("guestbook_id", "client_id"),)
id: Mapped[int]                        # PK, autoincrement
guestbook_id: Mapped[int]              # Integer, NOT NULL, index
client_id: Mapped[str]                 # String(50), NOT NULL, index
operator_name: Mapped[str]             # String(50), NOT NULL
default_cash_account: Mapped[int | None]    # Integer, nullable  → 默认现金账户 ID
default_wechat_account: Mapped[int | None]  # Integer, nullable  → 默认微信账户 ID
updated_at: Mapped[datetime]           # DateTime, NOT NULL, onupdate=datetime.utcnow
# ⚠ 缺少 owner_id — 待添加
```

### SystemSetting (system_settings)

```python
key: Mapped[str]       # String(50), PRIMARY KEY  → 注意：主键是 key，无自增 id
value: Mapped[str | None]  # Text, nullable
```

### ResetCode (reset_codes)

```python
id: Mapped[int]           # PK, autoincrement
email: Mapped[str]        # String(100), NOT NULL, index
code: Mapped[str]         # String(10), NOT NULL
expires_at: Mapped[datetime]  # DateTime, NOT NULL
used: Mapped[bool]        # Boolean, NOT NULL, default=False
```

## 列约定

### 外键模式

```python
# 带 CASCADE 的外键
guestbook_id: Mapped[int] = mapped_column(Integer, ForeignKey("guestbooks.id", ondelete="CASCADE"), nullable=False, index=True)

# 可空外键 SET NULL
person_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("persons.id", ondelete="SET NULL"), nullable=True, index=True)
```

### 金额字段

始终使用 `Integer`，单位为分：

```python
amount: Mapped[int] = mapped_column(Integer, nullable=False)           # 100 = ¥1.00
daily_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=2000000000)  # 微信限额
```

### JSON 文本字段（Person 别名）

```python
_aliases: Mapped[str] = mapped_column("aliases", Text, nullable=False, default="[]")

@property
def aliases(self) -> list[str]:
    return json.loads(self._aliases) if self._aliases else []

@aliases.setter
def aliases(self, value: list[str]) -> None:
    self._aliases = json.dumps(value, ensure_ascii=False)
```

### 枚举样式的字符串字段

使用 `String` + 应用层校验（不使用数据库 ENUM）：

```python
# PaymentAccount.type: "cash" | "wechat"
# Guestbook.status: "收礼中" | "已完成"（注意：中文默认值）
# GbRecord.check_status: "unchecked" | "checked"
# GbRecord.payment_method: "cash" | "wechat" | "other"
# DailyRecord.type: "in" | "out"（String(3)）
# User.role: "editor"（当前），目标: "super_admin" | "sub_admin" | "user" | "family_member" | "collaborator"
```

## 索引策略

- 所有 `ForeignKey` 列：`index=True`
- 所有 `owner_id` 列（添加后）：`index=True`
- 高频过滤列：`name`, `guest_name`, `phone`, `username`, `uuid`
- 状态/枚举列：`check_status`, `status`, `type`
- 组合唯一：`TerminalSettings.__table_args__ = (UniqueConstraint("guestbook_id", "client_id"),)`

## owner_id 数据隔离（待实施）

根据需求文档，所有业务模型需添加 `owner_id` 字段。当前代码尚未实现。添加时的标准写法：

```python
owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
```

需要添加 `owner_id` 的模型：Person, PaymentAccount, Guestbook, GbRecord, DailyRecord, OperationLog, TerminalSettings。

添加后，所有业务查询必须过滤 `owner_id`：

```python
items = db.query(Person).filter(Person.owner_id == current_user.id).all()
```

## PostgreSQL 迁移注意

| SQLite | PostgreSQL |
|--------|-----------|
| `DateTime` | `TIMESTAMP`（建议使用 `DateTime(timezone=True)`） |
| `Text`（JSON） | `JSONB`（推荐）或保留 `Text` |
| `Integer` autoincrement | `SERIAL` / `BIGSERIAL`（SQLAlchemy 自动处理） |
| `Boolean` | `BOOLEAN`（原生支持） |
| `Date` | `DATE`（原生支持） |
