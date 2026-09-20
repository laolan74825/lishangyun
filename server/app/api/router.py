from fastapi import APIRouter

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.daily_records import router as daily_records_router
from app.api.gb_records import router as gb_records_router
from app.api.guestbooks import router as guestbooks_router
from app.api.migration import router as migration_router
from app.api.operation_logs import router as operation_logs_router
from app.api.payment_accounts import router as payment_accounts_router
from app.api.persons import router as persons_router
from app.api.stats import router as stats_router
from app.api.terminal_settings import router as terminal_settings_router

api_router = APIRouter(prefix="/api")

api_router.include_router(auth_router)
api_router.include_router(persons_router)
api_router.include_router(payment_accounts_router)
api_router.include_router(guestbooks_router)
api_router.include_router(gb_records_router)
api_router.include_router(daily_records_router)
api_router.include_router(operation_logs_router)
api_router.include_router(terminal_settings_router)
api_router.include_router(stats_router)
api_router.include_router(admin_router)
api_router.include_router(migration_router)
