from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from app.core.dependencies import CurrentUser, DbSession, require_role
from app.core.helpers import paginate_query, write_audit_log
from app.models.person import Person
from app.models.person_balance_adjustment import PersonBalanceAdjustment
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.person_balance_adjustment import PersonBalanceAdjustmentCreate, PersonBalanceAdjustmentResponse

router = APIRouter(prefix="/balance-adjustments", tags=["balance-adjustments"])

EditorUser = Annotated[User, Depends(require_role("super_admin", "admin", "user", "collaborator"))]


@router.get("/", response_model=PaginatedResponse[PersonBalanceAdjustmentResponse])
async def list_adjustments(
    current_user: CurrentUser,
    db: DbSession,
    person_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    stmt = (
        select(PersonBalanceAdjustment)
        .where(PersonBalanceAdjustment.owner_id == current_user.id)
    )
    if person_id is not None:
        stmt = stmt.where(PersonBalanceAdjustment.person_id == person_id)
    stmt = stmt.order_by(PersonBalanceAdjustment.created_at.desc())
    items, pagination = await paginate_query(db, stmt, page, page_size)
    return PaginatedResponse(items=items, pagination=pagination)


@router.post("/", response_model=int)
async def create_adjustment(
    body: PersonBalanceAdjustmentCreate,
    db: DbSession,
    current_user: EditorUser,
):
    result = await db.execute(
        select(Person).where(
            Person.id == body.person_id,
            Person.owner_id == current_user.id,
            Person.is_deleted == False,
        )
    )
    person = result.scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="人员不存在")

    adj = PersonBalanceAdjustment(
        owner_id=current_user.id,
        person_id=body.person_id,
        amount=body.amount,
        reason=body.reason,
        created_by=current_user.username,
    )
    db.add(adj)
    await db.flush()
    write_audit_log(
        db, current_user.id, "person_balance_adjustments", adj.id, "CREATE",
        operator_name=current_user.username,
        after=body.model_dump(),
    )
    await db.commit()
    return adj.id
