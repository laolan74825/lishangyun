import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.config import settings, validate_security_settings
from app.core.errors import register_exception_handlers
from app.database import Base, engine

# 应用自身的 logger.info（如 Mock 短信验证码）默认被根 logger 的 WARNING 级别吞掉，
# 这里统一放开到 INFO，让运维信息（验证码、告警）能在 docker logs 里看到
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_security_settings()

    # Import all models to register them with Base.metadata
    from app.models import (  # noqa: F401
        authorization_action_log,
        collaboration_invite,
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


app = FastAPI(title="礼尚云 API", version="1.0.0", lifespan=lifespan)
register_exception_handlers(app)


@app.middleware("http")
async def relative_redirect_middleware(request, call_next):
    """把重定向的绝对 Location 改为相对路径。

    前端经 vite/nginx 代理以相对路径调用 /api，而后端路由若以尾部斜线
    为规范路径（如 /operation-logs/），Starlette 会 307 到绝对地址。
    浏览器跨源跟随重定向时会剥掉 Authorization 头，导致本来合法的请求
    变成 401、前端登出。相对 Location 会让浏览器沿用当前源，问题消失。
    """
    response = await call_next(request)
    if response.status_code in (301, 302, 303, 307, 308):
        location = response.headers.get("location")
        if location and location.startswith(("http://", "https://")):
            parts = urlsplit(location)
            response.headers["location"] = parts.path + (f"?{parts.query}" if parts.query else "")
    return response


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
