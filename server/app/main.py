import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.config import settings, validate_security_settings
from app.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_security_settings()

    # Import all models to register them with Base.metadata
    from app.models import (  # noqa: F401
        authorization_action_log,
        authorization_code,
        daily_record,
        family_group,
        family_member,
        gb_record,
        guestbook,
        guestbook_host,
        notification,
        operation_log,
        payment_account,
        pending_approval,
        person,
        person_balance_adjustment,
        reset_code,
        security_email,
        system_setting,
        terminal_settings,
        user,
        user_key_config,
    )
    yield


app = FastAPI(title="随礼记账本 API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

static_dir = Path(__file__).parent.parent.parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
