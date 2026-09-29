from pydantic import BaseModel


class MigrationPayload(BaseModel):
    owner_id: int | None = None
    persons: list[dict] = []
    payment_accounts: list[dict] = []
    guestbooks: list[dict] = []
    gb_records: list[dict] = []
    daily_records: list[dict] = []
    operation_logs: list[dict] = []
    terminal_settings: list[dict] = []
    admin: dict | None = None
    global_settings: dict | None = None


class MigrationResult(BaseModel):
    persons: int
    payment_accounts: int
    guestbooks: int
    gb_records: int
    daily_records: int
    operation_logs: int
    terminal_settings: int
