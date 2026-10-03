from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

ExportFormat = Literal["xlsx", "csv"]
ExportScope = Literal["daily_records", "guestbook"]
ImportType = Literal["daily_record", "gb_record", "guestbook"]
DuplicateStrategy = Literal["skip", "overwrite", "import_all"]


class ExportRequest(BaseModel):
    scope: ExportScope
    format: ExportFormat = "xlsx"
    guestbook_id: int | None = None
    include_private: bool = True
    start_date: date | None = None
    end_date: date | None = None


class GuestbookInfoPreview(BaseModel):
    """整本礼簿导入：礼簿信息（名称/事由/日期）的校验结果"""
    data: dict = {}
    is_valid: bool
    errors: list[str] = []


class ImportPreviewRow(BaseModel):
    row_number: int
    data: dict
    is_valid: bool
    errors: list[str] = []
    is_duplicate: bool = False
    duplicate_summary: str | None = None


class ImportPreviewResponse(BaseModel):
    import_type: ImportType
    total_rows: int
    valid_rows: int
    invalid_rows: int
    duplicate_rows: int
    rows: list[ImportPreviewRow]
    file_name: str
    guestbook_info: GuestbookInfoPreview | None = None


class ImportCommitRequest(BaseModel):
    import_type: ImportType
    file_name: str
    valid_row_indices: list[int]
    duplicate_strategy: DuplicateStrategy = "skip"
    guestbook_id: int | None = None


class ImportCommitResponse(BaseModel):
    imported_count: int
    skipped_count: int
    overwritten_count: int
    errors: list[dict] = []
    guestbook_id: int | None = None
    guestbook_name: str | None = None


class ImportErrorReport(BaseModel):
    row_number: int
    field: str | None = None
    error: str
