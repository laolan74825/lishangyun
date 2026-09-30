from importlib import import_module

from fastapi import APIRouter

from app.api.account import router as account_router
from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.collaboration import router as collaboration_router
from app.api.approvals import router as approvals_router
from app.api.balance_adjustments import router as balance_adjustments_router
from app.api.daily_records import router as daily_records_router
from app.api.export import router as export_router
from app.api.family import router as family_router
from app.api.gb_records import router as gb_records_router
from app.api.guestbooks import router as guestbooks_router
from app.api.migration import router as migration_router
from app.api.operation_logs import router as operation_logs_router
from app.api.notifications import router as notifications_router
from app.api.payment_accounts import router as payment_accounts_router
from app.api.persons import router as persons_router
from app.api.stats import router as stats_router
from app.api.security import router as security_router
from app.api.sync import router as sync_router
from app.api.terminal_settings import router as terminal_settings_router
from app.api.ws import router as ws_router

import_router = import_module("app.api.import").router

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
api_router.include_router(export_router)
api_router.include_router(import_router)
api_router.include_router(sync_router)
api_router.include_router(family_router)
api_router.include_router(collaboration_router)
api_router.include_router(approvals_router)
api_router.include_router(notifications_router)
api_router.include_router(security_router)
api_router.include_router(balance_adjustments_router)
api_router.include_router(account_router)
api_router.include_router(ws_router)
