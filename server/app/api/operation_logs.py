from fastapi import APIRouter, Query
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession
from app.core.helpers import paginate_query
from app.models.operation_log import OperationLog
from app.schemas.common import PaginatedResponse
from app.schemas.operation_log import OperationLogResponse

router = APIRouter(prefix="/operation-logs", tags=["operation-logs"])


@router.get("/", response_model=PaginatedResponse[OperationLogResponse])
async def list_logs(
    current_user: CurrentUser,
    db: DbSession,
    guestbook_id: int | None = None,
    target_table: str | None = None,
    target_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    stmt = select(OperationLog).where(OperationLog.owner_id == current_user.id)
    if guestbook_id is not None:
        stmt = stmt.where(OperationLog.guestbook_id == guestbook_id)
    if target_table is not None:
        stmt = stmt.where(OperationLog.target_table == target_table)
    if target_id is not None:
        stmt = stmt.where(OperationLog.target_id == target_id)
    stmt = stmt.order_by(OperationLog.created_at.desc())
    items, pagination = await paginate_query(db, stmt, page, page_size)
    return PaginatedResponse(items=items, pagination=pagination)
