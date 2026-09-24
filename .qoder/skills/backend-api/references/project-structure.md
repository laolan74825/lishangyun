# Project Structure Reference

## Directory Tree

```
server/
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI app entry, CORS, lifespan, static mount
│   ├── config.py                # Pydantic Settings (env-based config)
│   ├── database.py              # SQLAlchemy engine, SessionLocal, Base, get_db
│   │
│   ├── api/                     # Route layer (one file per module)
│   │   ├── __init__.py
│   │   ├── router.py            # Central router: registers all sub-routers under /api
│   │   ├── auth.py              # POST /register, /login, /password-reset/*; GET /me; PUT /password
│   │   ├── admin.py             # Admin-only: user CRUD, system settings（含内联 schema: CreateUserRequest, UpdateUserRequest, UpdateSettingsRequest）
│   │   ├── persons.py           # Person CRUD (人员管理)
│   │   ├── guestbooks.py        # Guestbook CRUD + lifecycle (礼簿管理)
│   │   ├── gb_records.py        # GbRecord CRUD + batch (收礼记录)
│   │   ├── daily_records.py     # DailyRecord CRUD (日常记账)
│   │   ├── payment_accounts.py  # PaymentAccount CRUD (收款账户)
│   │   ├── terminal_settings.py # TerminalSettings per guestbook+client (终端设置)
│   │   ├── operation_logs.py    # Read-only log query (操作日志)
│   │   ├── stats.py             # Aggregation queries (统计报表)
│   │   └── migration.py         # Data migration helpers (数据迁移辅助)
│   │
│   ├── models/                  # SQLAlchemy ORM models
│   │   ├── __init__.py          # Re-exports all models for Base.metadata registration
│   │   ├── user.py              # User (users)
│   │   ├── person.py            # Person (persons) — aliases stored as JSON text
│   │   ├── payment_account.py   # PaymentAccount (payment_accounts) — cash/wechat
│   │   ├── guestbook.py         # Guestbook (guestbooks) — status: 收礼中/已完成
│   │   ├── gb_record.py         # GbRecord (gb_records) — UUID, amount in cents
│   │   ├── daily_record.py      # DailyRecord (daily_records)
│   │   ├── operation_log.py     # OperationLog (operation_logs) — immutable audit trail
│   │   ├── terminal_settings.py # TerminalSettings (terminal_settings) — UNIQUE(guestbook_id, client_id)
│   │   ├── system_setting.py    # SystemSetting (system_settings) — key-value config
│   │   └── reset_code.py        # ResetCode (reset_codes) — password reset tokens
│   │
│   ├── schemas/                 # Pydantic request/response models
│   │   ├── __init__.py
│   │   ├── auth.py              # RegisterRequest, LoginRequest, TokenResponse, UserInfo, ChangePasswordRequest, PasswordResetRequest/Confirm
│   │   ├── person.py            # PersonCreate/Update/Response, PersonTransactionSummary
│   │   ├── guestbook.py         # GuestbookCreate/Update/Response, GuestbookSummary
│   │   ├── gb_record.py         # GbRecordCreate/Update/Response, GbRecordBatchCreate, BatchCheckRequest, AccountSummaryItem
│   │   ├── daily_record.py      # DailyRecordCreate/Update/Response, DailyRecordsSummary
│   │   ├── payment_account.py   # PaymentAccountCreate/Update/Response
│   │   ├── migration.py         # Migration-related schemas
│   │   └── stats.py             # Stats response schemas
│   │
│   ├── core/                    # Core infrastructure
│   │   ├── __init__.py
│   │   ├── security.py          # JWT create/decode, bcrypt hash/verify
│   │   ├── dependencies.py      # get_current_user, require_role, oauth2_scheme
│   │   ├── crypto.py            # AES-256 encrypt/decrypt for sensitive config values
│   │   └── email_service.py     # SMTP email sending (password reset)
│   │
│   └── utils/                   # Utility functions
│       ├── __init__.py
│       └── idempotency.py       # UUID generator (new_uuid) for record uniqueness
│
├── alembic/                     # Database migrations
│   ├── env.py
│   ├── script.py.mako
│   └── versions/                # Migration scripts（首次 alembic revision 后自动创建）
├── alembic.ini                  # Alembic configuration
│
├── requirements.txt             # Python dependencies
├── .env                         # Environment config (not committed)
├── .env.example                 # Environment template
└── Dockerfile                   # Python 3.12-slim container
```

## Key Entry Points

| File | Purpose |
|------|---------|
| `main.py` | App creation, CORS, lifespan (model registration + SQLite auto-create), static mount |
| `database.py` | Engine creation (SQLite or PostgreSQL), `SessionLocal`, `Base` class, `get_db` generator |
| `config.py` | `Settings` class via pydantic-settings, reads `.env` |
| `api/router.py` | Aggregates all sub-routers under `/api` prefix |

## Dependency Injection Pattern

```python
# Current pattern (all existing code uses this):
def list_items(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

# Preferred Annotated pattern (new code should use this, but尚未在代码库中使用):
DB = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

def list_items(db: DB, current_user: CurrentUser):
```

现有代码全部使用旧式 `= Depends(...)` 模式。新代码应优先使用 `Annotated` 模式。

## Config (config.py)

```python
class Settings(BaseSettings):
    database_url: str = "sqlite:///./giftregistry.db"
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 1440
    app_encryption_key: str = "0" * 64
    allowed_origins: str = "http://localhost:5173"
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}
```
