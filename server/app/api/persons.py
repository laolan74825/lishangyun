import json
from datetime import datetime
from app.core.time import utcnow
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.dependencies import CurrentUser, DbSession, require_role
from app.core.helpers import match_person_id, paginate_query, write_audit_log
from app.models.daily_record import DailyRecord
from app.models.gb_record import GbRecord
from app.models.guestbook import Guestbook
from app.models.person import Person
from app.models.person_balance_adjustment import PersonBalanceAdjustment
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.person import PersonCreate, PersonMergeRequest, PersonMergeResult, PersonResponse, PersonSummaryGbRecord, PersonTransactionSummary, PersonUpdate

router = APIRouter(prefix="/persons", tags=["persons"])

EditorUser = Annotated[User, Depends(require_role("super_admin", "admin", "user", "collaborator"))]
OwnerUser = Annotated[User, Depends(require_role("super_admin", "admin", "user"))]


@router.get("/", response_model=PaginatedResponse[PersonResponse])
async def list_persons(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    stmt = (
        select(Person)
        .where(Person.owner_id == current_user.id, Person.is_deleted == False)
        .order_by(Person.name)
    )
    items, pagination = await paginate_query(db, stmt, page, page_size)
    return PaginatedResponse(items=items, pagination=pagination)


@router.get("/search", response_model=list[PersonResponse])
async def search_persons(
    current_user: CurrentUser,
    db: DbSession,
    q: str = Query(..., min_length=1),
):
    keyword = f"%{q}%"
    result = await db.execute(
        select(Person)
        .where(
            Person.owner_id == current_user.id,
            Person.is_deleted == False,
            (Person.name.ilike(keyword))
            | (Person.nickname.ilike(keyword))
            | (Person.phone.ilike(keyword)),
        )
    )
    return result.scalars().all()


@router.get("/{person_id}", response_model=PersonResponse)
async def get_person(person_id: int, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Person)
        .where(Person.id == person_id, Person.owner_id == current_user.id, Person.is_deleted == False)
    )
    person = result.scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="人员不存在")
    return person


@router.post("/", response_model=int)
async def create_person(
    body: PersonCreate,
    db: DbSession,
    current_user: EditorUser,
):
    person = Person(
        owner_id=current_user.id,
        name=body.name,
        nickname=body.nickname,
        phone=body.phone,
        relationship_tag=body.relationship_tag,
        note=body.note,
    )
    person._aliases = json.dumps(body.aliases, ensure_ascii=False)
    db.add(person)
    await db.flush()
    write_audit_log(db, current_user.id, "persons", person.id, "CREATE",
                    operator_name=current_user.username, after=body.model_dump())
    await db.commit()
    return person.id


@router.put("/{person_id}")
async def update_person(
    person_id: int,
    body: PersonUpdate,
    db: DbSession,
    current_user: EditorUser,
):
    result = await db.execute(
        select(Person)
        .where(Person.id == person_id, Person.owner_id == current_user.id, Person.is_deleted == False)
    )
    person = result.scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="人员不存在")
    before = {c.name: getattr(person, c.name) for c in Person.__table__.columns}
    data = body.model_dump(exclude_unset=True)
    if "aliases" in data:
        person._aliases = json.dumps(data.pop("aliases"), ensure_ascii=False)
    for k, v in data.items():
        setattr(person, k, v)
    person.updated_at = utcnow()
    write_audit_log(db, current_user.id, "persons", person.id, "UPDATE",
                    operator_name=current_user.username, before=before, after=data)
    await db.commit()
    return {"message": "已更新"}


@router.delete("/{person_id}")
async def delete_person(
    person_id: int,
    db: DbSession,
    current_user: OwnerUser,
):
    result = await db.execute(
        select(Person)
        .where(Person.id == person_id, Person.owner_id == current_user.id, Person.is_deleted == False)
    )
    person = result.scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="人员不存在")
    before = {c.name: getattr(person, c.name) for c in Person.__table__.columns}
    person.is_deleted = True
    person.deleted_at = utcnow()
    write_audit_log(db, current_user.id, "persons", person.id, "DELETE",
                    operator_name=current_user.username, before=before)
    await db.commit()
    return {"message": "已删除"}


@router.get("/{person_id}/summary", response_model=PersonTransactionSummary)
async def person_summary(person_id: int, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Person)
        .where(Person.id == person_id, Person.owner_id == current_user.id, Person.is_deleted == False)
    )
    person = result.scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="人员不存在")

    daily_out = (await db.execute(
        select(func.coalesce(func.sum(DailyRecord.amount), 0))
        .where(DailyRecord.owner_id == current_user.id, DailyRecord.person_id == person_id,
               DailyRecord.type == "out", DailyRecord.is_deleted == False)
    )).scalar_one()
    daily_in = (await db.execute(
        select(func.coalesce(func.sum(DailyRecord.amount), 0))
        .where(DailyRecord.owner_id == current_user.id, DailyRecord.person_id == person_id,
               DailyRecord.type == "in", DailyRecord.is_deleted == False)
    )).scalar_one()
    gb_total = (await db.execute(
        select(func.coalesce(func.sum(GbRecord.amount), 0))
        .where(GbRecord.owner_id == current_user.id, GbRecord.person_id == person_id,
               GbRecord.is_deleted == False)
    )).scalar_one()
    total_in = daily_in + gb_total

    # 差额调整：手动修正的往来差额计入净差额
    adjustment_total = (await db.execute(
        select(func.coalesce(func.sum(PersonBalanceAdjustment.amount), 0))
        .where(PersonBalanceAdjustment.owner_id == current_user.id,
               PersonBalanceAdjustment.person_id == person_id)
    )).scalar_one()

    # 来往明细：日常往来 + 礼簿收礼（附礼簿名称/事由）
    daily_records = (await db.execute(
        select(DailyRecord)
        .where(DailyRecord.owner_id == current_user.id, DailyRecord.person_id == person_id,
               DailyRecord.is_deleted == False)
        .order_by(DailyRecord.event_date.desc())
    )).scalars().all()

    gb_rows = (await db.execute(
        select(GbRecord, Guestbook.name, Guestbook.event_type)
        .join(Guestbook, GbRecord.guestbook_id == Guestbook.id)
        .where(GbRecord.owner_id == current_user.id, GbRecord.person_id == person_id,
               GbRecord.is_deleted == False)
        .order_by(GbRecord.record_time.desc())
    )).all()
    gb_records = [
        PersonSummaryGbRecord(
            id=r.id,
            guestbook_id=r.guestbook_id,
            guestbook_name=gb_name,
            guestbook_event_type=gb_event_type or "",
            guest_name=r.guest_name,
            amount=r.amount,
            payment_method=r.payment_method,
            record_time=r.record_time,
            note=r.note,
            agent_name=r.agent_name,
        )
        for r, gb_name, gb_event_type in gb_rows
    ]

    return PersonTransactionSummary(
        total_out=daily_out, total_in=total_in, adjustment_total=adjustment_total,
        net=total_in - daily_out + adjustment_total,
        daily_records=daily_records, gb_records=gb_records,
    )


class BackfillLinksResult(BaseModel):
    """补关联维护：按「姓名+电话」把历史记录批量关联到人员库的统计结果"""
    gb_linked: int = 0        # 成功关联的礼簿收礼记录数
    gb_unmatched: int = 0     # 无法匹配（无此人员/同名多人）的礼簿记录数
    daily_linked: int = 0     # 成功关联的日常往来记录数
    daily_unmatched: int = 0  # 无法匹配的日常记录数


@router.post("/backfill-links", response_model=BackfillLinksResult)
async def backfill_person_links(
    db: DbSession,
    current_user: OwnerUser,
):
    """补关联维护：为所有未关联人员的历史记录（礼簿收礼 + 日常往来）按
    「姓名+电话」精确匹配（其次退化姓名精确匹配，同名多人不自动关联）回填 person_id。
    幂等，可重复执行；只处理未关联的记录，不覆盖已有关联。"""
    result = BackfillLinksResult()

    gb_records = (await db.execute(
        select(GbRecord)
        .where(GbRecord.owner_id == current_user.id, GbRecord.person_id.is_(None),
               GbRecord.is_deleted == False)
    )).scalars().all()
    for r in gb_records:
        pid = await match_person_id(db, current_user.id, r.guest_name, r.phone)
        if pid is not None:
            r.person_id = pid
            result.gb_linked += 1
        else:
            result.gb_unmatched += 1

    daily_records = (await db.execute(
        select(DailyRecord)
        .where(DailyRecord.owner_id == current_user.id, DailyRecord.person_id.is_(None),
               DailyRecord.is_deleted == False)
    )).scalars().all()
    for r in daily_records:
        pid = await match_person_id(db, current_user.id, r.person_name, r.phone)
        if pid is not None:
            r.person_id = pid
            result.daily_linked += 1
        else:
            result.daily_unmatched += 1

    write_audit_log(
        db, current_user.id, "persons", 0, "UPDATE",
        operator_name=current_user.username,
        note=(f"补关联维护：礼簿关联 {result.gb_linked} 条（未匹配 {result.gb_unmatched}），"
              f"日常关联 {result.daily_linked} 条（未匹配 {result.daily_unmatched}）"),
    )
    await db.commit()
    return result


@router.post("/merge", response_model=PersonMergeResult)
async def merge_persons(
    body: PersonMergeRequest,
    db: DbSession,
    current_user: OwnerUser,
):
    if body.source_person_id == body.target_person_id:
        raise HTTPException(status_code=400, detail="不能合并同一人员")

    src_result = await db.execute(
        select(Person).where(
            Person.id == body.source_person_id, Person.owner_id == current_user.id,
            Person.is_deleted == False
        )
    )
    src = src_result.scalar_one_or_none()
    if not src:
        raise HTTPException(status_code=404, detail="源人员不存在")

    tgt_result = await db.execute(
        select(Person).where(
            Person.id == body.target_person_id, Person.owner_id == current_user.id,
            Person.is_deleted == False
        )
    )
    tgt = tgt_result.scalar_one_or_none()
    if not tgt:
        raise HTTPException(status_code=404, detail="目标人员不存在")

    gb_result = await db.execute(
        select(func.count(GbRecord.id)).where(
            GbRecord.person_id == body.source_person_id,
            GbRecord.owner_id == current_user.id,
            GbRecord.is_deleted == False,
        )
    )
    gb_count = gb_result.scalar_one()

    daily_result = await db.execute(
        select(func.count(DailyRecord.id)).where(
            DailyRecord.person_id == body.source_person_id,
            DailyRecord.owner_id == current_user.id,
            DailyRecord.is_deleted == False,
        )
    )
    daily_count = daily_result.scalar_one()

    if gb_count > 0:
        gb_result = await db.execute(
            select(GbRecord).where(
                GbRecord.person_id == body.source_person_id,
                GbRecord.owner_id == current_user.id,
                GbRecord.is_deleted == False,
            )
        )
        for rec in gb_result.scalars().all():
            rec.person_id = body.target_person_id

    if daily_count > 0:
        dr_result = await db.execute(
            select(DailyRecord).where(
                DailyRecord.person_id == body.source_person_id,
                DailyRecord.owner_id == current_user.id,
                DailyRecord.is_deleted == False,
            )
        )
        for rec in dr_result.scalars().all():
            rec.person_id = body.target_person_id

    src_aliases = src.aliases
    tgt_aliases = tgt.aliases
    merged = list(dict.fromkeys(tgt_aliases + src_aliases))
    tgt.aliases = merged
    tgt.sync_version += 1
    tgt.updated_at = utcnow()

    src.is_deleted = True
    src.deleted_at = utcnow()

    write_audit_log(
        db, current_user.id, "persons", body.target_person_id, "MERGE",
        operator_name=current_user.username,
        note=f"合并人员: source_id={body.source_person_id} ({src.name}) → target_id={body.target_person_id} ({tgt.name})",
    )

    await db.commit()

    return PersonMergeResult(
        target_person_id=body.target_person_id,
        migrated_gb_records=gb_count,
        migrated_daily_records=daily_count,
        merged_aliases=merged,
    )
