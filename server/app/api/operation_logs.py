from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.operation_log import OperationLog
from app.models.user import User

router = APIRouter(tags=["operation-logs"])


@router.get("/guestbooks/{gb_id}/operation-logs")
def list_logs(
    gb_id: int,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    logs = (
        db.query(OperationLog)
        .filter(OperationLog.guestbook_id == gb_id)
        .order_by(OperationLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": log.id,
            "guestbook_id": log.guestbook_id,
            "gb_record_id": log.gb_record_id,
            "action_type": log.action_type,
            "operator_name": log.operator_name,
            "client_id": log.client_id,
            "before_data": log.before_data,
            "after_data": log.after_data,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]
