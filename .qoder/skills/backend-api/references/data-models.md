# Data Models Reference

All models inherit from `Base` (defined in `app/database.py`). Use SQLAlchemy 2.0+ mapped column syntax. Database: PostgreSQL 17 (开发与生产环境统一).

## Model Registry

| Model | Table | Soft Del | Sync Fields | Notes |
|-------|-------|----------|-------------|-------|
| User | `users` | — | — | 5 级角色: super_admin/sub_admin/user/family_member/collaborator。仅有 is_active，无软删除 |
| SecurityEmail | `security_emails` | — | — | 安全邮箱，1~2 个/用户，UNIQUE(user_id, email) |
| Person | `persons` | ✅ | ✅ is_private + sync_version | 别名 JSONB，关系标签 |
| PaymentAccount | `payment_accounts` | ✅ | — | cash/wechat 类型，微信含限额+二维码 |
| Guestbook | `guestbooks` | ✅ | — | 三态: active/closing/archived，host_person_id 关联主人家 |
| GuestbookHost | `guestbook_host` | — | — | 礼簿↔主人家多对多，UNIQUE(guestbook_id, person_id) |
| GbRecord | `gb_records` | ✅ | ✅ is_private + sync_version | UUID 防重，金额分，check_status 含 disputed |
| DailyRecord | `daily_records` | ✅ | ✅ is_private + sync_version | type: in/out，source 标记来源 |
| PersonBalanceAdjustment | `person_balance_adjustments` | — | — | 差额调整，正负数金额+原因 |
| OperationLog | `operation_logs` | — | — | 通用 target_table+target_id 模式，不可变审计 |
| TerminalSettings | `terminal_settings` | — | — | UNIQUE(guestbook_id, client_id) |
| SystemSetting | `system_settings` | — | — | PK 为 key（非自增 id） |
| ResetCode | `reset_codes` | — | — | 密码重置验证码，10 分钟过期 |
| FamilyGroup | `family_groups` | — | — | 家庭组，owner_id 为主账户 |
| FamilyMember | `family_members` | — | — | UNIQUE(group_id, user_id)，role: owner/member |
| PendingApproval | `pending_approvals` | — | — | 审批队列，status 含 expired，30 天过期 |
| UserKeyConfig | `user_key_configs` | — | — | 加密配置，UNIQUE(user_id)，零知识存储 |
| Notification | `notifications` | — | — | 5 种通知类型，复合索引优化未读查询 |
| AuthorizationCode | `authorization_codes` | — | — | 礼簿授权码，GR-XXXXXX 格式 |
| AuthorizationActionLog | `authorization_action_logs` | — | — | 授权操作日志 |

---

## 现有核心表列定义

### User (users)

```python
id: Mapped[int]                   # PK, autoincrement
username: Mapped[str]             # String(50), UNIQUE, NOT NULL
password_hash: Mapped[str]        # String(200), NOT NULL  → Argon2 哈希
role: Mapped[str]                 # String(20), NOT NULL, default="user"
                                  # → "super_admin" | "sub_admin" | "user" | "family_member" | "collaborator"
email: Mapped[str | None]         # String(100), nullable  → 旧字段，新代码使用 security_emails 表
is_active: Mapped[bool]           # Boolean, NOT NULL, default=True
created_at: Mapped[datetime]      # DateTime, NOT NULL
updated_at: Mapped[datetime]      # DateTime, NOT NULL, onupdate=datetime.utcnow
# 登录失败锁定（待实现）: failed_login_count: Mapped[int] default=0, locked_until: Mapped[datetime | None]
```

### Person (persons)

```python
id: Mapped[int]                   # PK, autoincrement
owner_id: Mapped[int]             # Integer, FK→users.id, NOT NULL, index
name: Mapped[str]                 # String(50), NOT NULL, index
nickname: Mapped[str | None]      # String(50), nullable
phone: Mapped[str | None]         # String(20), nullable, index
_aliases: Mapped[str]             # column "aliases", JSONB, NOT NULL, default="[]"
                                  # → @property 以 JSON 字符串存取
relation_tag: Mapped[str]         # String(20), NOT NULL, default="其他"
                                  # → "亲戚" | "朋友" | "同事" | "同学" | "邻居" | "其他"
note: Mapped[str | None]          # Text, nullable
is_private: Mapped[bool]          # Boolean, NOT NULL, default=False  → 隐私记录标记
sync_version: Mapped[int]         # Integer, NOT NULL, default=0  → 增量同步版本号
is_deleted: Mapped[bool]          # Boolean, NOT NULL, default=False  → 软删除
deleted_at: Mapped[datetime | None]  # DateTime, nullable  → 删除时间
created_at: Mapped[datetime]      # DateTime, NOT NULL
```

### PaymentAccount (payment_accounts)

```python
id: Mapped[int]                   # PK, autoincrement
owner_id: Mapped[int]             # Integer, FK→users.id, NOT NULL, index
name: Mapped[str]                 # String(50), NOT NULL
type: Mapped[str]                 # String(10), NOT NULL, index  → "cash" | "wechat"
identifier: Mapped[str | None]    # String(50), nullable  → 微信号（wechat 类型时）
daily_limit: Mapped[int]          # Integer, NOT NULL, default=20000000  → 单位：分（默认 ¥200,000）
qr_code: Mapped[str | None]       # Text, nullable  → 微信收款二维码 URL 或 Base64
is_active: Mapped[bool]           # Boolean, NOT NULL, default=True, index
is_deleted: Mapped[bool]          # Boolean, NOT NULL, default=False
deleted_at: Mapped[datetime | None]  # DateTime, nullable
created_at: Mapped[datetime]      # DateTime, NOT NULL
```

### Guestbook (guestbooks)

```python
id: Mapped[int]                   # PK, autoincrement
owner_id: Mapped[int]             # Integer, FK→users.id, NOT NULL, index
name: Mapped[str]                 # String(100), NOT NULL  → 字段名是 name 而非 title
event_type: Mapped[str]           # String(30), NOT NULL  → 7 种（不含 holiday）
event_date: Mapped[date]          # Date, NOT NULL, index
status: Mapped[str]               # String(20), NOT NULL, default="active", index
                                  # → "active"（收礼中）| "closing"（收尾中）| "archived"（已归档）
host_person_id: Mapped[int | None]  # Integer, FK→persons.id, nullable  → 主关联人（冗余，快速查询）
operator_note: Mapped[str | None] # Text, nullable
is_deleted: Mapped[bool]          # Boolean, NOT NULL, default=False
deleted_at: Mapped[datetime | None]  # DateTime, nullable
created_at: Mapped[datetime]      # DateTime, NOT NULL
closing_at: Mapped[datetime | None]   # DateTime, nullable  → 进入收尾时间
archived_at: Mapped[datetime | None]  # DateTime, nullable  → 归档时间（不可逆）
```

### GbRecord (gb_records)

```python
id: Mapped[int]                   # PK, autoincrement
owner_id: Mapped[int]             # Integer, FK→users.id, NOT NULL, index
guestbook_id: Mapped[int]         # Integer, FK→guestbooks.id ON DELETE CASCADE, NOT NULL, index
person_id: Mapped[int | None]     # Integer, FK→persons.id ON DELETE SET NULL, nullable, index
guest_name: Mapped[str]           # String(50), NOT NULL, index
phone: Mapped[str | None]         # String(20), nullable
amount: Mapped[int]               # Integer, NOT NULL  → 单位：分，范围 [100, 10000000]
payment_method: Mapped[str]       # String(10), NOT NULL  → "cash" | "wechat" | "other"
account_id: Mapped[int | None]    # Integer, FK→payment_accounts.id ON DELETE SET NULL, nullable, index
                                  # → cash/wechat 时必填，other 时为 null
note: Mapped[str | None]          # Text, nullable
agent_name: Mapped[str | None]    # String(50), nullable  → 经办人/代理人
check_status: Mapped[str]         # String(20), NOT NULL, default="unchecked", index
                                  # → "unchecked" | "checked" | "disputed"（待核实）
record_time: Mapped[datetime]     # DateTime, NOT NULL, default=datetime.utcnow, index
                                  # → 漏记补记时可手动设置
client_id: Mapped[str | None]     # String(50), nullable
operator_name: Mapped[str | None] # String(50), nullable
uuid: Mapped[str]                 # String(36), UNIQUE, NOT NULL, index  → uuid4() 服务端生成
is_private: Mapped[bool]          # Boolean, NOT NULL, default=False
sync_version: Mapped[int]         # Integer, NOT NULL, default=0
is_deleted: Mapped[bool]          # Boolean, NOT NULL, default=False
deleted_at: Mapped[datetime | None]  # DateTime, nullable
created_at: Mapped[datetime]      # DateTime, NOT NULL
```

### DailyRecord (daily_records)

```python
id: Mapped[int]                   # PK, autoincrement
owner_id: Mapped[int]             # Integer, FK→users.id, NOT NULL, index
person_id: Mapped[int | None]     # Integer, FK→persons.id ON DELETE SET NULL, nullable, index
type: Mapped[str]                 # String(10), NOT NULL, index  → "in" | "out"
amount: Mapped[int]               # Integer, NOT NULL  → 单位：分，范围 [100, 10000000]
event_type: Mapped[str]           # String(30), NOT NULL  → 8 种（含 holiday）
payment_method: Mapped[str | None] # String(10), nullable  → "cash" | "wechat" | "other"
account_id: Mapped[int | None]    # Integer, FK→payment_accounts.id ON DELETE SET NULL, nullable
event_date: Mapped[date]          # Date, NOT NULL, index
source: Mapped[str]               # String(20), NOT NULL, default="manual"
                                  # → "manual"（手动录入）| "guestbook_ref"（关联礼簿补录）
source_id: Mapped[int | None]     # Integer, nullable  → source=guestbook_ref 时关联礼簿 ID
note: Mapped[str | None]          # Text, nullable
created_by: Mapped[str | None]    # String(50), nullable
is_private: Mapped[bool]          # Boolean, NOT NULL, default=False
sync_version: Mapped[int]         # Integer, NOT NULL, default=0
is_deleted: Mapped[bool]          # Boolean, NOT NULL, default=False
deleted_at: Mapped[datetime | None]  # DateTime, nullable
created_at: Mapped[datetime]      # DateTime, NOT NULL
updated_at: Mapped[datetime]      # DateTime, NOT NULL, onupdate=datetime.utcnow
```

### OperationLog (operation_logs)

```python
id: Mapped[int]                   # PK, autoincrement
owner_id: Mapped[int]             # Integer, FK→users.id ON DELETE CASCADE, NOT NULL, index
target_table: Mapped[str]         # String(50), NOT NULL, index
                                  # → 目标表名: gb_record / daily_record / guestbook / person /
                                  #   payment_account / family_group / family_member /
                                  #   pending_approval / user_key_config / notification
target_id: Mapped[int | None]     # Integer, nullable  → 目标记录 ID（替代旧 gb_record_id）
guestbook_id: Mapped[int | None]  # Integer, FK→guestbooks.id ON DELETE CASCADE, nullable, index
                                  # → 可选，仅当 target_table=gb_record 时必填
action_type: Mapped[str]          # String(20), NOT NULL
                                  # → CREATE | UPDATE | DELETE | MERGE | ARCHIVE |
                                  #   APPROVE | REJECT | SECURITY_SWITCH | PRIVACY_MARK
operator_name: Mapped[str | None] # String(50), nullable
client_id: Mapped[str | None]     # String(50), nullable
before_data: Mapped[str | None]   # JSONB, nullable  → 操作前数据快照
after_data: Mapped[str | None]    # JSONB, nullable  → 操作后数据快照
note: Mapped[str | None]          # Text, nullable  → 操作备注（如审批拒绝原因）
created_at: Mapped[datetime]      # DateTime, NOT NULL, index
# ⚠ 不可变审计日志：禁止 UPDATE / DELETE
```

### TerminalSettings (terminal_settings)

```python
# __table_args__ = (UniqueConstraint("guestbook_id", "client_id"),)
id: Mapped[int]                        # PK, autoincrement
guestbook_id: Mapped[int]              # Integer, FK→guestbooks.id ON DELETE CASCADE, NOT NULL, index
client_id: Mapped[str]                 # String(50), NOT NULL, index
operator_name: Mapped[str]             # String(50), NOT NULL
default_cash_account: Mapped[int | None]    # Integer, FK→payment_accounts.id ON DELETE SET NULL, nullable
default_wechat_account: Mapped[int | None]  # Integer, FK→payment_accounts.id ON DELETE SET NULL, nullable
updated_at: Mapped[datetime]           # DateTime, NOT NULL, onupdate=datetime.utcnow
```

### SystemSetting (system_settings)

```python
key: Mapped[str]       # String(100), PRIMARY KEY  → 主键是 key，无自增 id
value: Mapped[str | None]  # Text, nullable
updated_at: Mapped[datetime]  # DateTime, NOT NULL, onupdate=datetime.utcnow
```

### ResetCode (reset_codes)

```python
id: Mapped[int]           # PK, autoincrement
email: Mapped[str]        # String(100), NOT NULL, index
code: Mapped[str]         # String(10), NOT NULL
expires_at: Mapped[datetime]  # DateTime, NOT NULL
used: Mapped[bool]        # Boolean, NOT NULL, default=False
```

---

## 待新增表列定义

### SecurityEmail (security_emails)

```python
id: Mapped[int]                   # PK, autoincrement
user_id: Mapped[int]              # Integer, FK→users.id, NOT NULL
email: Mapped[str]                # String(100), NOT NULL
is_verified: Mapped[bool]         # Boolean, NOT NULL, default=False
is_primary: Mapped[bool]          # Boolean, NOT NULL, default=False
created_at: Mapped[datetime]      # DateTime, NOT NULL, server_default=func.now()
# UNIQUE(user_id, email)  → 约束名: uq_security_email_user_email
# 每用户 1~2 个安全邮箱（应用层约束）
```

### GuestbookHost (guestbook_host)

```python
id: Mapped[int]                   # PK, autoincrement
guestbook_id: Mapped[int]         # Integer, FK→guestbooks.id ON DELETE CASCADE, NOT NULL, index
person_id: Mapped[int]            # Integer, FK→persons.id ON DELETE CASCADE, NOT NULL, index
is_primary: Mapped[bool]          # Boolean, NOT NULL, default=False
                                  # → 与 guestbook.host_person_id 保持一致
created_at: Mapped[datetime]      # DateTime, NOT NULL
# UNIQUE(guestbook_id, person_id)  → 同一礼簿不重复关联同一人员
```

### PersonBalanceAdjustment (person_balance_adjustments)

```python
id: Mapped[int]                   # PK, autoincrement
owner_id: Mapped[int]             # Integer, FK→users.id, NOT NULL, index
person_id: Mapped[int]            # Integer, FK→persons.id ON DELETE CASCADE, NOT NULL, index
amount: Mapped[int]               # Integer, NOT NULL  → 正负数，单位：分
reason: Mapped[str]               # Text, NOT NULL  → 调整原因
created_at: Mapped[datetime]      # DateTime, NOT NULL
```

### FamilyGroup (family_groups)

```python
id: Mapped[int]                   # PK, autoincrement
name: Mapped[str]                 # String(50), NOT NULL
owner_id: Mapped[int]             # Integer, FK→users.id, NOT NULL, index  → 主账户
invite_code: Mapped[str]          # String(20), UNIQUE, NOT NULL  → 邀请码
invite_expires_at: Mapped[datetime | None]  # DateTime, nullable
created_at: Mapped[datetime]      # DateTime, NOT NULL
```

### FamilyMember (family_members)

```python
id: Mapped[int]                   # PK, autoincrement
group_id: Mapped[int]             # Integer, FK→family_groups.id ON DELETE CASCADE, NOT NULL, index
user_id: Mapped[int]              # Integer, FK→users.id ON DELETE RESTRICT, NOT NULL
display_name: Mapped[str]         # String(50), NOT NULL
role: Mapped[str]                 # String(20), NOT NULL  → "owner" | "member"
joined_at: Mapped[datetime]       # DateTime, NOT NULL
is_active: Mapped[bool]           # Boolean, NOT NULL, default=True
# UNIQUE(group_id, user_id)  → 同一用户在同一家庭组只有一条记录
```

### PendingApproval (pending_approvals)

```python
id: Mapped[int]                   # PK, autoincrement
group_id: Mapped[int]             # Integer, FK→family_groups.id ON DELETE CASCADE, NOT NULL, index
submitter_id: Mapped[int]         # Integer, FK→users.id ON DELETE RESTRICT, NOT NULL, index
target_table: Mapped[str]         # String(50), NOT NULL  → daily_record / gb_record / person
target_id: Mapped[int | None]     # Integer, nullable  → 修改/删除时有值
action: Mapped[str]               # String(10), NOT NULL  → "CREATE" | "UPDATE" | "DELETE"
payload: Mapped[str]              # JSONB, NOT NULL  → 提交的数据内容
status: Mapped[str]               # String(20), NOT NULL, default="pending", index
                                  # → "pending" | "approved" | "rejected" | "expired"
reviewer_id: Mapped[int | None]   # Integer, FK→users.id ON DELETE SET NULL, nullable
review_note: Mapped[str | None]   # Text, nullable  → 审批备注（拒绝时必填原因）
submitted_at: Mapped[datetime]    # DateTime, NOT NULL
reviewed_at: Mapped[datetime | None]  # DateTime, nullable
# 超 30 天未处理自动标记为 expired
```

### UserKeyConfig (user_key_configs)

```python
id: Mapped[int]                   # PK, autoincrement
user_id: Mapped[int]              # Integer, FK→users.id ON DELETE CASCADE, UNIQUE, NOT NULL
security_mode: Mapped[str]        # String(20), NOT NULL, default="normal"
                                  # → "normal" | "enhanced"
encrypted_key: Mapped[str | None] # Text, nullable  → 增强模式下客户端加密的个人私钥密文
mnemonic_hash: Mapped[str | None] # String(200), nullable  → 助记词 Argon2 哈希（验证用）
encrypted_family_key: Mapped[str | None]  # Text, nullable  → 用个人密钥加密的家庭主密钥密文
created_at: Mapped[datetime]      # DateTime, NOT NULL
updated_at: Mapped[datetime]      # DateTime, NOT NULL, onupdate=datetime.utcnow
# 普通模式下记录可不存在或 security_mode=normal，加密字段为空
# 服务端存储的 encrypted_key/encrypted_family_key 均为客户端加密密文，零知识
```

### Notification (notifications)

```python
id: Mapped[int]                   # PK, autoincrement
recipient_id: Mapped[int]         # Integer, FK→users.id ON DELETE CASCADE, NOT NULL, index
type: Mapped[str]                 # String(30), NOT NULL
                                  # → "approval_approved" | "approval_rejected" |
                                  #   "approval_expired" | "family_member_joined" | "merge_suggested"
title: Mapped[str]                # String(100), NOT NULL
body: Mapped[str]                 # Text, NOT NULL
related_entity: Mapped[str | None]  # String(50), nullable  → pending_approval / family_group / person
related_id: Mapped[int | None]    # Integer, nullable  → 关联实体 ID
is_read: Mapped[bool]             # Boolean, NOT NULL, default=False
created_at: Mapped[datetime]      # DateTime, NOT NULL, index
# 复合索引: (recipient_id, is_read, created_at DESC)  → 优化未读通知查询
```

### AuthorizationCode (authorization_codes)

```python
id: Mapped[int]                   # PK, autoincrement
code: Mapped[str]                 # String(20), UNIQUE, NOT NULL  → 格式: "GR-XXXXXX"
guestbook_id: Mapped[int]         # Integer, FK→guestbooks.id, NOT NULL, index
owner_id: Mapped[int]             # Integer, FK→users.id, NOT NULL, index  → 授权码所有者
grantee_name: Mapped[str]         # String(50), NOT NULL  → 被授权者显示名
grantee_account_id: Mapped[int]   # Integer, NOT NULL  → 预设被授权者账户 ID
grantee_user_id: Mapped[int | None]  # Integer, FK→users.id, nullable  → 绑定后实际用户 ID
permissions: Mapped[str]          # String(50), NOT NULL, default="record,reconcile"
status: Mapped[str]               # String(20), NOT NULL, default="active"
                                  # → "active" | "bound" | "revoked" | "expired"
expires_at: Mapped[datetime | None]  # DateTime, nullable
created_at: Mapped[datetime]      # DateTime, NOT NULL, server_default=func.now()
bound_at: Mapped[datetime | None] # DateTime, nullable
```

### AuthorizationActionLog (authorization_action_logs)

```python
id: Mapped[int]                   # PK, autoincrement
auth_code_id: Mapped[int]         # Integer, FK→authorization_codes.id, NOT NULL, index
grantee_user_id: Mapped[int]      # Integer, FK→users.id, NOT NULL, index
action_type: Mapped[str]          # String(20), NOT NULL  → "CREATE" | "UPDATE" | "DELETE" | "RECONCILE"
record_id: Mapped[int | None]     # Integer, FK→gb_records.id, nullable
detail: Mapped[str | None]        # JSONB, nullable  → 操作详情
created_at: Mapped[datetime]      # DateTime, NOT NULL, server_default=func.now()
```

---

## 列约定

### 外键模式

```python
# 带 CASCADE 的外键
guestbook_id: Mapped[int] = mapped_column(Integer, ForeignKey("guestbooks.id", ondelete="CASCADE"), nullable=False, index=True)

# 可空外键 SET NULL
person_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("persons.id", ondelete="SET NULL"), nullable=True, index=True)

# RESTRICT 外键（禁止级联删除）
user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
```

### 金额字段

始终使用 `Integer`，单位为分，Pydantic 层验证范围：

```python
amount: Mapped[int] = mapped_column(Integer, nullable=False)  # 100 = ¥1.00
daily_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=20000000)  # 微信限额 ¥200,000
# Pydantic: Field(ge=100, le=10000000)  → ¥1 ~ ¥100,000
```

### 软删除模式

5 张表使用统一软删除模式（gb_records, daily_records, persons, payment_accounts, guestbooks）：

```python
is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
```

删除时设置 `is_deleted=True, deleted_at=datetime.utcnow()`。查询时默认过滤 `is_deleted == False`。30 天后定时任务物理清除。

### 同步字段模式

3 张表使用同步字段（gb_records, daily_records, persons）：

```python
is_private: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # 隐私记录标记
sync_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # 增量同步版本号
```

每次修改记录时递增 `sync_version`。`is_private=True` 的记录同步至云端但仅本人可查看。

### JSON 文本字段（Person 别名）

```python
# PostgreSQL JSONB 类型
_aliases: Mapped[str] = mapped_column("aliases", JSONB, nullable=False, default="[]")

@property
def aliases(self) -> list[str]:
    return json.loads(self._aliases) if self._aliases else []

@aliases.setter
def aliases(self, value: list[str]) -> None:
    self._aliases = json.dumps(value, ensure_ascii=False)
```

### 枚举样式的字符串字段

使用 `String` + 应用层校验（`Literal` 类型），不使用数据库 ENUM：

```python
# PaymentAccount.type: "cash" | "wechat"
# Guestbook.status: "active" | "closing" | "archived"
# GbRecord.check_status: "unchecked" | "checked" | "disputed"
# GbRecord.payment_method: "cash" | "wechat" | "other"
# DailyRecord.type: "in" | "out"
# DailyRecord.source: "manual" | "guestbook_ref"
# Person.relation_tag: "亲戚" | "朋友" | "同事" | "同学" | "邻居" | "其他"
# User.role: "super_admin" | "sub_admin" | "user" | "family_member" | "collaborator"
# FamilyMember.role: "owner" | "member"
# PendingApproval.status: "pending" | "approved" | "rejected" | "expired"
# PendingApproval.action: "CREATE" | "UPDATE" | "DELETE"
# UserKeyConfig.security_mode: "normal" | "enhanced"
# Notification.type: "approval_approved" | "approval_rejected" | "approval_expired" | "family_member_joined" | "merge_suggested"
# AuthorizationCode.status: "active" | "bound" | "revoked" | "expired"
# OperationLog.action_type: "CREATE" | "UPDATE" | "DELETE" | "MERGE" | "ARCHIVE" | "APPROVE" | "REJECT" | "SECURITY_SWITCH" | "PRIVACY_MARK"
# OperationLog.target_table: "gb_record" | "daily_record" | "guestbook" | "person" | "payment_account" | "family_group" | "family_member" | "pending_approval" | "user_key_config" | "notification"
```

### 事件类型枚举（event_type）

日常模式和礼簿模式共用同一枚举集，数据库统一存储英文值：

```python
# wedding / birthday / fullmoon / housewarming / graduation / funeral / holiday / other
# 日常模式：全部 8 种
# 礼簿模式：7 种（不含 holiday，节日红包为日常专用）
# "生日"和"寿宴"统一存 birthday，前端按上下文显示不同文案
```

---

## 外键级联规则

| 子表 | 外键字段 | 父表 | ON DELETE | 说明 |
|------|----------|------|-----------|------|
| gb_record | guestbook_id | guestbook | CASCADE | 删除礼簿级联删除收礼记录 |
| gb_record | person_id | person | SET NULL | 删除人员保留记录解除关联 |
| gb_record | account_id | payment_account | SET NULL | 删除账户保留记录解除关联 |
| operation_log | guestbook_id | guestbook | CASCADE | 删除礼簿级联删除操作日志 |
| operation_log | owner_id | users | CASCADE | 删除用户级联删除操作日志 |
| terminal_settings | guestbook_id | guestbook | CASCADE | 删除礼簿级联删除终端设置 |
| terminal_settings | default_cash_account | payment_account | SET NULL | 删除账户清空默认设置 |
| terminal_settings | default_wechat_account | payment_account | SET NULL | 删除账户清空默认设置 |
| daily_record | person_id | person | SET NULL | 删除人员保留记录解除关联 |
| daily_record | account_id | payment_account | SET NULL | 删除账户保留记录解除关联 |
| person_balance_adjustment | person_id | person | CASCADE | 删除人员级联删除差额调整 |
| family_member | group_id | family_group | CASCADE | 删除家庭组级联删除成员 |
| family_member | user_id | users | RESTRICT | 禁止删除有家庭成员的用户 |
| pending_approval | group_id | family_group | CASCADE | 删除家庭组级联删除待审批 |
| pending_approval | submitter_id | users | RESTRICT | 禁止删除有待审批提交的用户 |
| pending_approval | reviewer_id | users | SET NULL | 删除审批人保留记录 |
| user_key_config | user_id | users | CASCADE | 删除用户级联删除加密配置 |
| guestbook_host | guestbook_id | guestbook | CASCADE | 删除礼簿级联删除主人家关联 |
| guestbook_host | person_id | person | CASCADE | 删除人员级联删除主人家关联 |

> 设计原则：核心业务数据 CASCADE 确保完整性；人员/账户 SET NULL 保留历史；用户 RESTRICT 防止误删。

---

## 索引策略

### 复合索引

| 表 | 索引字段 | 类型 | 用途 |
|----|----------|------|------|
| guestbook | (owner_id, status, created_at DESC) | B-tree | 按用户和状态筛选礼簿 |
| gb_record | (guestbook_id, payment_method) | B-tree | 按礼簿和支付方式筛选 |
| gb_record | (guestbook_id, check_status) | B-tree | 按礼簿筛选对账状态 |
| gb_record | (guestbook_id, record_time) | B-tree | 按礼簿和时间排序 |
| gb_record | (guestbook_id, person_id) | B-tree | 按礼簿和人员查询 |
| daily_record | (owner_id, event_date DESC) | B-tree | 按用户和日期倒序 |
| daily_record | (owner_id, person_id) | B-tree | 按用户和人员查询 |
| daily_record | (owner_id, type, event_date) | B-tree | 按用户、类型、日期筛选 |
| person | (owner_id, name) | B-tree | 按用户和姓名搜索 |
| person | (owner_id, phone) | B-tree | 按用户和电话精确匹配 |
| operation_log | (owner_id, target_table, created_at DESC) | B-tree | 按用户、目标表、时间查日志 |
| operation_log | (guestbook_id, created_at DESC) | B-tree | 按礼簿查操作日志 |
| payment_account | (owner_id, type) | B-tree | 按用户和账户类型筛选 |
| pending_approval | (group_id, status, submitted_at) | B-tree | 按家庭组、状态、时间筛选 |
| guestbook_host | (person_id) | B-tree | 按人员查询关联礼簿 |
| notification | (recipient_id, is_read, created_at DESC) | B-tree | 未读通知查询 |

### 唯一约束

| 表 | 约束字段 | 说明 |
|----|----------|------|
| gb_record | (uuid) | 防重复写入 |
| terminal_settings | (guestbook_id, client_id) | 每礼簿每终端一条设置 |
| guestbook_host | (guestbook_id, person_id) | 礼簿主人家不重复关联 |
| family_member | (group_id, user_id) | 同用户同家庭组一条记录 |
| user_key_config | (user_id) | 每用户一条加密配置 |
| security_emails | (user_id, email) | 同用户同邮箱不重复 |
| authorization_codes | (code) | 授权码唯一 |

### 索引策略原则

- 独立业务表（daily_record、person、payment_account、operation_log）索引以 `(owner_id, ...)` 开头
- 关联表（gb_record、terminal_settings、guestbook_host）索引以 `(guestbook_id, ...)` 开头
- 时间字段降序索引优化"最新记录"查询
- 所有 ForeignKey 列 `index=True`
- 所有 owner_id 列 `index=True`
- UNIQUE 约束自动创建唯一索引

---

## owner_id 数据隔离（待实施）

所有业务模型需添加 `owner_id` 字段。当前代码尚未实现（P0 优先级）。

```python
owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
```

需要添加 `owner_id` 的模型：Person, PaymentAccount, Guestbook, GbRecord, DailyRecord, OperationLog, PersonBalanceAdjustment。

添加后所有业务查询必须过滤 `owner_id`：

```python
items = (
    db.query(Person)
    .filter(Person.owner_id == current_user.id, Person.is_deleted == False)
    .all()
)
```

---

## 审计日志覆盖范围

| 操作类型 | target_table | action_type | 说明 |
|----------|--------------|-------------|------|
| 收礼记录增删改 | gb_record | CREATE / UPDATE / DELETE | 原有功能 |
| 收礼记录合并 | gb_record | MERGE | 合并向导 |
| 日常记录增删改 | daily_record | CREATE / UPDATE / DELETE | |
| 礼簿创建 | guestbook | CREATE | |
| 礼簿状态变更 | guestbook | UPDATE | status 字段变化 |
| 礼簿删除 | guestbook | DELETE | |
| 人员合并 | person | MERGE | |
| 人员增删改 | person | CREATE / UPDATE / DELETE | |
| 收款账户增删改 | payment_account | CREATE / UPDATE / DELETE | |
| 家庭组创建 | family_group | CREATE | |
| 家庭成员加入/移除 | family_member | CREATE / DELETE | |
| 审批通过 | pending_approval | APPROVE | |
| 审批拒绝 | pending_approval | REJECT | |
| 安全模式切换 | user_key_config | SECURITY_SWITCH | normal↔enhanced |
| 隐私标记变更 | daily_record / gb_record / person | PRIVACY_MARK | is_private 字段变化 |

---

## PostgreSQL 数据类型

| SQLAlchemy 类型 | PostgreSQL 类型 | 说明 |
|----------------|----------------|------|
| `DateTime(timezone=True)` | `TIMESTAMP WITH TIME ZONE` | 推荐使用时区感知类型 |
| `JSONB` | `JSONB` | JSON 数据存取，支持索引 |
| `Integer` autoincrement | `SERIAL` / `BIGSERIAL` | SQLAlchemy 自动处理 |
| `Boolean` | `BOOLEAN` | 原生支持 |
| `Date` | `DATE` | 原生支持 |
| `server_default=func.now()` | `NOW()` / `CURRENT_TIMESTAMP` | 数据库生成时间戳 |
