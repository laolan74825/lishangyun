from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select, update

from app.core.dependencies import CurrentUser, DbSession
from app.core.helpers import paginate_query
from app.models.notification import Notification
from app.schemas.notification import NotificationCountResponse, NotificationResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/", response_model=list[NotificationResponse])
async def list_notifications(
    current_user: CurrentUser, db: DbSession,
    is_read: bool | None = None,
    type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    stmt = select(Notification).where(Notification.user_id == current_user.id)

    if is_read is not None:
        stmt = stmt.where(Notification.is_read == is_read)
    if type:
        stmt = stmt.where(Notification.type == type)

    stmt = stmt.order_by(Notification.created_at.desc())
    items, _ = await paginate_query(db, stmt, page, page_size)
    return items


@router.get("/unread-count", response_model=NotificationCountResponse)
async def unread_count(current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
    )
    return NotificationCountResponse(unread_count=result.scalar_one())


@router.put("/{notification_id}/read")
async def mark_read(notification_id: int, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(404, "通知不存在")

    notification.is_read = True
    await db.commit()
    return {"message": "已标记为已读"}


@router.put("/read-all")
async def mark_all_read(current_user: CurrentUser, db: DbSession):
    await db.execute(
        update(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        ).values(is_read=True)
    )
    await db.commit()
    return {"message": "全部已标记为已读"}


@router.delete("/{notification_id}")
async def delete_notification(notification_id: int, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(404, "通知不存在")

    await db.delete(notification)
    await db.commit()
    return {"message": "已删除"}
