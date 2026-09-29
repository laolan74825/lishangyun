# Project Structure Reference

## Directory Tree

```
server/
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI app entry, CORS, lifespan, static mount, WebSocket routes
│   ├── config.py                # Pydantic Settings (env-based config)
│   ├── database.py              # SQLAlchemy async engine, AsyncSessionLocal, Base, get_db
│   │
│   ├── api/                     # Route layer (one file per module)
│   │   ├── __init__.py
│   │   ├── router.py            # Central router: registers all sub-routers under /api
│   │   ├── auth.py              # POST /register, /login, /password-reset/*; GET /me; PUT /password
│   │   ├── admin.py             # Admin-only: user CRUD, system settings, dashboard, recycle bin, notices
│   │   ├── persons.py           # Person CRUD + balance adjustments (人员管理)
│   │   ├── guestbooks.py        # Guestbook CRUD + 3-state lifecycle + host associations (礼簿管理)
│   │   ├── gb_records.py        # GbRecord CRUD + batch + reconcile + account stats (收礼记录)
│   │   ├── daily_records.py     # DailyRecord CRUD + summary + privacy mark (日常记账)
│   │   ├── payment_accounts.py  # PaymentAccount CRUD + daily limit (收款账户)
│   │   ├── terminal_settings.py # TerminalSettings per guestbook+client (终端设置)
│   │   ├── operation_logs.py    # Generalized audit log query by target_table (操作日志)
│   │   ├── stats.py             # Aggregation queries (统计报表)
│   │   ├── migration.py         # Data migration helpers (数据迁移辅助)
│   │   ├── family.py            # Family group CRUD, invite, member mgmt, approval queue (家庭协作)
│   │   ├── notifications.py     # Notification list, read/unread, batch mark (站内通知)
│   │   ├── authorization.py     # Authorization code generate/bind/revoke (授权码管理)
│   │   ├── account.py           # Profile, security emails, data export, account deletion (个人账户)
│   │   ├── security.py          # Security mode switch, key config, mnemonic (安全模式)
│   │   └── ws.py                # WebSocket endpoints for real-time guestbook collaboration
│   │
│   ├── models/                  # SQLAlchemy ORM models
│   │   ├── __init__.py          # Re-exports all models for Base.metadata registration
│   │   ├── user.py              # User (users) — 5-level role, login lockout fields
│   │   ├── security_email.py    # SecurityEmail (security_emails) — 1~2 per user
│   │   ├── person.py            # Person (persons) — aliases JSON, soft delete, sync fields
│   │   ├── payment_account.py   # PaymentAccount (payment_accounts) — cash/wechat, soft delete
│   │   ├── guestbook.py         # Guestbook (guestbooks) — 3-state lifecycle, soft delete
│   │   ├── guestbook_host.py    # GuestbookHost (guestbook_host) — guestbook↔person M2M
│   │   ├── gb_record.py         # GbRecord (gb_records) — UUID, cents, soft delete, sync fields
│   │   ├── daily_record.py      # DailyRecord (daily_records) — soft delete, sync fields
│   │   ├── person_balance_adjustment.py  # PersonBalanceAdjustment (person_balance_adjustments)
│   │   ├── operation_log.py     # OperationLog (operation_logs) — generalized target_table+target_id
│   │   ├── terminal_settings.py # TerminalSettings (terminal_settings) — UNIQUE(guestbook_id, client_id)
│   │   ├── system_setting.py    # SystemSetting (system_settings) — key-value config
│   │   ├── reset_code.py        # ResetCode (reset_codes) — password reset tokens
│   │   ├── family_group.py      # FamilyGroup (family_groups) — invite code
│   │   ├── family_member.py     # FamilyMember (family_members) — UNIQUE(group_id, user_id)
│   │   ├── pending_approval.py  # PendingApproval (pending_approvals) — approval queue
│   │   ├── user_key_config.py   # UserKeyConfig (user_key_configs) — zero-knowledge encryption
│   │   ├── notification.py      # Notification (notifications) — 5 types
│   │   ├── authorization_code.py       # AuthorizationCode (authorization_codes) — GR-XXXXXX
│   │   └── authorization_action_log.py # AuthorizationActionLog (authorization_action_logs)
│   │
│   ├── schemas/                 # Pydantic request/response models
│   │   ├── __init__.py
│   │   ├── auth.py              # RegisterRequest, LoginRequest, TokenResponse, UserInfo, ChangePasswordRequest, PasswordResetRequest/Confirm
│   │   ├── person.py            # PersonCreate/Update/Response, PersonTransactionSummary, BalanceAdjustmentCreate/Response
│   │   ├── guestbook.py         # GuestbookCreate/Update/Response, GuestbookSummary, HostAssociateRequest
│   │   ├── gb_record.py         # GbRecordCreate/Update/Response, GbRecordBatchCreate, BatchCheckRequest, AccountSummaryItem
│   │   ├── daily_record.py      # DailyRecordCreate/Update/Response, DailyRecordsSummary, PrivacyMarkRequest
│   │   ├── payment_account.py   # PaymentAccountCreate/Update/Response
│   │   ├── migration.py         # Migration-related schemas
│   │   ├── stats.py             # Stats response schemas
│   │   ├── family.py            # FamilyGroupCreate/Response, InviteRequest, MemberResponse, ApprovalActionRequest
│   │   ├── notification.py      # NotificationResponse, NotificationBatchReadRequest
│   │   ├── authorization.py     # AuthCodeCreate/Response, AuthCodeBindRequest, AuthCodeRevokeRequest
│   │   ├── account.py           # ProfileUpdateRequest, SecurityEmailAdd/Verify/RemoveRequest, DataExportRequest
│   │   ├── security.py          # SecurityModeSwitchRequest, KeyConfigResponse, MnemonicVerifyRequest
│   │   ├── common.py            # PaginatedResponse[T] generic, PaginationMeta, ErrorResponse
│   │   └── ws.py                # WebSocket message schemas (JoinRequest, RecordPush, SyncBroadcast)
│   │
│   ├── core/                    # Core infrastructure
│   │   ├── __init__.py
│   │   ├── security.py          # JWT create/decode, Argon2 hash/verify, login lockout check
│   │   ├── dependencies.py      # get_current_user, require_role, has_permission, oauth2_scheme
│   │   ├── crypto.py            # AES-256 encrypt/decrypt for sensitive config values
│   │   ├── email_service.py     # SMTP email sending (password reset, security email verification)
│   │   └── websocket.py         # WebSocket connection manager (room-based guestbook collab)
│   │
│   ├── services/                # Business logic layer (shared across routes)
│   │   ├── __init__.py
│   │   ├── audit.py             # create_log() helper — generalized target_table+target_id pattern
│   │   ├── soft_delete.py       # mark_deleted() / purge_expired() — 30-day cleanup
│   │   ├── sync.py              # sync_version increment, is_private check helpers
│   │   ├── notification.py      # create_notification() helper — 5 types dispatch
│   │   └── import_validator.py  # Data import validation (amount range, date format, encoding, duplicate detection)
│   │
│   └── utils/                   # Utility functions
│       ├── __init__.py
│       ├── idempotency.py       # UUID generator (new_uuid) for record uniqueness
│       └── pagination.py        # paginate() helper — returns {items, pagination} envelope
│
├── alembic/                     # Database migrations
│   ├── env.py
│   ├── script.py.mako
│   └── versions/                # Migration scripts
├── alembic.ini                  # Alembic configuration
│
├── tests/                       # Test suite
│   ├── __init__.py
│   ├── conftest.py              # Fixtures: async client, db session, auth headers
│   ├── test_auth.py
│   ├── test_persons.py
│   ├── test_guestbooks.py
│   ├── test_gb_records.py
│   ├── test_daily_records.py
│   ├── test_payment_accounts.py
│   ├── test_family.py
│   ├── test_notifications.py
│   ├── test_authorization.py
│   ├── test_account.py
│   ├── test_security.py
│   └── test_stats.py
│
├── requirements.txt             # Python dependencies
├── .env                         # Environment config (not committed)
├── .env.example                 # Environment template
└── Dockerfile                   # Python 3.14-slim container
```

## Key Entry Points

| File | Purpose |
|------|---------|
| `main.py` | App creation, CORS, lifespan (model registration + DB init), static mount, WebSocket route registration |
| `database.py` | Async engine creation (PostgreSQL), `AsyncSessionLocal`, `Base` class, `get_db` async generator |
| `config.py` | `Settings` class via pydantic-settings, reads `.env` |
| `api/router.py` | Aggregates all 16 sub-routers under `/api` prefix |
| `core/websocket.py` | ConnectionManager — room-based WebSocket hub for multi-terminal guestbook collaboration |
| `services/audit.py` | `create_log()` — single entry point for all audit log writes (target_table + target_id) |
| `services/soft_delete.py` | `mark_deleted()` / `purge_expired()` — unified soft delete + 30-day physical cleanup |
| `utils/pagination.py` | `paginate()` — returns `{"items": [...], "pagination": {"page", "page_size", "total_count", "total_pages"}}` |

## Dependency Injection Pattern

```python
# Current pattern (existing code):
def list_items(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

# Preferred Annotated pattern (new code):
DB = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_role("super_admin", "sub_admin"))]

def list_items(db: DB, current_user: CurrentUser):
```

现有代码全部使用旧式 `= Depends(...)` 模式。新代码应优先使用 `Annotated` 模式。

## Config (config.py)

```python
class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/giftregistry"
    
    # Auth & Security
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 1440
    app_encryption_key: str = "0" * 64
    login_max_failures: int = 5           # 登录失败最大次数
    login_lockout_minutes: int = 30       # 锁定时间
    
    # CORS
    allowed_origins: str = "http://localhost:5173"
    
    # Email (SMTP)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    
    # Soft delete
    soft_delete_retention_days: int = 30  # 软删除记录保留天数
    
    # Family approval
    approval_expiry_days: int = 30        # 审批过期天数
    
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}
```

## Route Module Summary

| 路由文件 | 前缀 | 端点数 | 功能 | 状态 |
|----------|------|--------|------|------|
| `auth.py` | `/api/auth` | 6+ | 注册、登录（含锁定）、密码重置、当前用户、改密 | ✅ 已实现 |
| `admin.py` | `/api/admin` | 8+ | 用户 CRUD、系统设置、仪表盘、回收站、公告管理 | ⚠️ 部分 |
| `persons.py` | `/api/persons` | 9+ | 人员 CRUD + 差额调整 + 按宴请查看 | ⚠️ 部分 |
| `guestbooks.py` | `/api/guestbooks` | 10+ | 礼簿 CRUD + 三态生命周期 + 主人家关联 | ⚠️ 部分 |
| `gb_records.py` | `/api/gb-records` | 12+ | 收礼记录 CRUD + 批量 + 对账 + 账户统计 | ⚠️ 部分 |
| `daily_records.py` | `/api/daily-records` | 7+ | 日常记录 CRUD + 汇总 + 隐私标记 | ⚠️ 部分 |
| `payment_accounts.py` | `/api/payment-accounts` | 6+ | 收款账户 CRUD + 限额 | ✅ 已实现 |
| `terminal_settings.py` | `/api/terminal-settings` | 2 | 终端设置读写 | ✅ 已实现 |
| `operation_logs.py` | `/api/operation-logs` | 2+ | 通用审计日志查询（按 target_table 筛选） | ⚠️ 部分 |
| `stats.py` | `/api/stats` | 3+ | 统计聚合（年度/礼簿专项） | ⚠️ 基础 |
| `family.py` | `/api/family` | 8+ | 家庭组 CRUD、邀请码、成员管理、审批队列 | ❌ 待开发 |
| `notifications.py` | `/api/notifications` | 4+ | 通知列表、已读/未读标记、批量操作 | ❌ 待开发 |
| `authorization.py` | `/api/authz` | 5+ | 授权码生成、绑定、撤销、列表 | ❌ 待开发 |
| `account.py` | `/api/account` | 6+ | 个人资料、安全邮箱管理、数据导出、注销 | ❌ 待开发 |
| `security.py` | `/api/security` | 4+ | 安全模式切换、密钥配置、助记词验证 | ❌ 待开发 |
| `ws.py` | `/ws/guestbook/{id}` | 1 | WebSocket 实时协作收礼 | ❌ 待开发 |
| `migration.py` | `/api/migration` | 1+ | 数据迁移辅助（含导入校验） | ⚠️ 基础 |

## Model File → Table Mapping

| 模型文件 | Model | Table | 关键特征 |
|----------|-------|-------|----------|
| `user.py` | User | `users` | 5 级角色，登录锁定字段 |
| `security_email.py` | SecurityEmail | `security_emails` | UNIQUE(user_id, email) |
| `person.py` | Person | `persons` | 软删除 + 同步字段 + 别名 JSON |
| `payment_account.py` | PaymentAccount | `payment_accounts` | 软删除，cash/wechat |
| `guestbook.py` | Guestbook | `guestbooks` | 软删除，三态生命周期 |
| `guestbook_host.py` | GuestbookHost | `guestbook_host` | UNIQUE(guestbook_id, person_id) |
| `gb_record.py` | GbRecord | `gb_records` | 软删除 + 同步字段 + UUID |
| `daily_record.py` | DailyRecord | `daily_records` | 软删除 + 同步字段 |
| `person_balance_adjustment.py` | PersonBalanceAdjustment | `person_balance_adjustments` | 正负金额差额调整 |
| `operation_log.py` | OperationLog | `operation_logs` | 通用 target_table+target_id，不可变 |
| `terminal_settings.py` | TerminalSettings | `terminal_settings` | UNIQUE(guestbook_id, client_id) |
| `system_setting.py` | SystemSetting | `system_settings` | PK 为 key |
| `reset_code.py` | ResetCode | `reset_codes` | 10 分钟过期 |
| `family_group.py` | FamilyGroup | `family_groups` | 邀请码机制 |
| `family_member.py` | FamilyMember | `family_members` | UNIQUE(group_id, user_id) |
| `pending_approval.py` | PendingApproval | `pending_approvals` | 4 态审批，30 天过期 |
| `user_key_config.py` | UserKeyConfig | `user_key_configs` | UNIQUE(user_id)，零知识 |
| `notification.py` | Notification | `notifications` | 5 种通知类型 |
| `authorization_code.py` | AuthorizationCode | `authorization_codes` | GR-XXXXXX 格式 |
| `authorization_action_log.py` | AuthorizationActionLog | `authorization_action_logs` | 授权操作审计 |

## Schema File → Module Mapping

| Schema 文件 | 对应路由 | 主要 Schema 类 |
|-------------|----------|---------------|
| `auth.py` | auth.py | RegisterRequest, LoginRequest, TokenResponse, UserInfo, ChangePasswordRequest |
| `person.py` | persons.py | PersonCreate/Update/Response, BalanceAdjustmentCreate/Response |
| `guestbook.py` | guestbooks.py | GuestbookCreate/Update/Response, HostAssociateRequest |
| `gb_record.py` | gb_records.py | GbRecordCreate/Update/Response, BatchCreate, BatchCheckRequest |
| `daily_record.py` | daily_records.py | DailyRecordCreate/Update/Response, PrivacyMarkRequest |
| `payment_account.py` | payment_accounts.py | PaymentAccountCreate/Update/Response |
| `family.py` | family.py | FamilyGroupCreate/Response, InviteRequest, ApprovalActionRequest |
| `notification.py` | notifications.py | NotificationResponse, BatchReadRequest |
| `authorization.py` | authorization.py | AuthCodeCreate/Response, BindRequest, RevokeRequest |
| `account.py` | account.py | ProfileUpdateRequest, SecurityEmailAdd/Verify/RemoveRequest |
| `security.py` | security.py | SecurityModeSwitchRequest, KeyConfigResponse, MnemonicVerifyRequest |
| `common.py` | (shared) | PaginatedResponse[T], PaginationMeta, ErrorResponse |
| `ws.py` | ws.py | JoinRequest, RecordPush, SyncBroadcast, ConflictResolution |
| `stats.py` | stats.py | 统计响应 schemas |
| `migration.py` | migration.py | 导入相关 schemas |
