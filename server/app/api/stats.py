from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.core.dependencies import CurrentUser, DbSession
from app.models.daily_record import DailyRecord
from app.models.gb_record import GbRecord
from app.models.guestbook import Guestbook
from app.models.person import Person
from app.schemas.stats import (
    EventDistributionItem,
    GuestbookStatsItem,
    MonthlyTrendItem,
    PersonRankingItem,
    TransactionSummaryByName,
)

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/person-ranking", response_model=list[PersonRankingItem])
async def person_ranking(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(20, ge=1, le=100),
):
    daily_out_q = (
        select(
            DailyRecord.person_id,
            func.coalesce(func.sum(DailyRecord.amount), 0).label("total_out"),
        )
        .where(
            DailyRecord.owner_id == current_user.id,
            DailyRecord.type == "out",
            DailyRecord.is_deleted == False,
            DailyRecord.person_id.isnot(None),
        )
        .group_by(DailyRecord.person_id)
        .subquery()
    )

    daily_in_q = (
        select(
            DailyRecord.person_id,
            func.coalesce(func.sum(DailyRecord.amount), 0).label("daily_in"),
        )
        .where(
            DailyRecord.owner_id == current_user.id,
            DailyRecord.type == "in",
            DailyRecord.is_deleted == False,
            DailyRecord.person_id.isnot(None),
        )
        .group_by(DailyRecord.person_id)
        .subquery()
    )

    gb_q = (
        select(
            GbRecord.person_id,
            func.coalesce(func.sum(GbRecord.amount), 0).label("gb_total"),
        )
        .where(
            GbRecord.owner_id == current_user.id,
            GbRecord.is_deleted == False,
            GbRecord.person_id.isnot(None),
        )
        .group_by(GbRecord.person_id)
        .subquery()
    )

    result = await db.execute(
        select(
            Person.id.label("person_id"),
            Person.name.label("person_name"),
            func.coalesce(daily_out_q.c.total_out, 0).label("total_out"),
            (func.coalesce(daily_in_q.c.daily_in, 0) + func.coalesce(gb_q.c.gb_total, 0)).label("total_in"),
        )
        .outerjoin(daily_out_q, Person.id == daily_out_q.c.person_id)
        .outerjoin(daily_in_q, Person.id == daily_in_q.c.person_id)
        .outerjoin(gb_q, Person.id == gb_q.c.person_id)
        .where(Person.owner_id == current_user.id, Person.is_deleted == False)
        .order_by(
            func.abs(
                func.coalesce(daily_in_q.c.daily_in, 0)
                + func.coalesce(gb_q.c.gb_total, 0)
                - func.coalesce(daily_out_q.c.total_out, 0)
            ).desc()
        )
        .limit(limit)
    )

    return [
        PersonRankingItem(
            person_id=row.person_id,
            person_name=row.person_name,
            total_out=row.total_out,
            total_in=row.total_in,
            net=row.total_in - row.total_out,
        )
        for row in result.all()
    ]


@router.get("/transaction-by-name", response_model=TransactionSummaryByName)
async def transaction_by_name(
    current_user: CurrentUser,
    db: DbSession,
    name: str = Query(...),
):
    daily_out = (await db.execute(
        select(func.coalesce(func.sum(DailyRecord.amount), 0))
        .where(DailyRecord.owner_id == current_user.id, DailyRecord.person_name == name,
               DailyRecord.type == "out", DailyRecord.is_deleted == False)
    )).scalar_one()
    daily_in = (await db.execute(
        select(func.coalesce(func.sum(DailyRecord.amount), 0))
        .where(DailyRecord.owner_id == current_user.id, DailyRecord.person_name == name,
               DailyRecord.type == "in", DailyRecord.is_deleted == False)
    )).scalar_one()
    gb_total = (await db.execute(
        select(func.coalesce(func.sum(GbRecord.amount), 0))
        .where(GbRecord.owner_id == current_user.id, GbRecord.guest_name == name,
               GbRecord.is_deleted == False)
    )).scalar_one()
    total_in = daily_in + gb_total
    return TransactionSummaryByName(total_out=daily_out, total_in=total_in, net=total_in - daily_out)


@router.get("/monthly-trend", response_model=list[MonthlyTrendItem])
async def monthly_trend(
    current_user: CurrentUser,
    db: DbSession,
    months: int = Query(12, ge=1, le=36),
):
    daily_sent_q = (
        select(
            func.to_char(func.date_trunc("month", DailyRecord.event_date), "YYYY-MM").label("month"),
            func.coalesce(func.sum(DailyRecord.amount), 0).label("total"),
        )
        .where(
            DailyRecord.owner_id == current_user.id,
            DailyRecord.type == "out",
            DailyRecord.is_deleted == False,
        )
        .group_by(func.date_trunc("month", DailyRecord.event_date))
        .subquery()
    )

    daily_recv_q = (
        select(
            func.to_char(func.date_trunc("month", DailyRecord.event_date), "YYYY-MM").label("month"),
            func.coalesce(func.sum(DailyRecord.amount), 0).label("total"),
        )
        .where(
            DailyRecord.owner_id == current_user.id,
            DailyRecord.type == "in",
            DailyRecord.is_deleted == False,
        )
        .group_by(func.date_trunc("month", DailyRecord.event_date))
        .subquery()
    )

    gb_recv_q = (
        select(
            func.to_char(func.date_trunc("month", GbRecord.record_time), "YYYY-MM").label("month"),
            func.coalesce(func.sum(GbRecord.amount), 0).label("total"),
        )
        .where(
            GbRecord.owner_id == current_user.id,
            GbRecord.is_deleted == False,
        )
        .group_by(func.date_trunc("month", GbRecord.record_time))
        .subquery()
    )

    all_months = (
        select(daily_sent_q.c.month.label("month")).subquery()
    )

    result = await db.execute(
        select(
            all_months.c.month,
            func.coalesce(gb_recv_q.c.total, 0) + func.coalesce(daily_recv_q.c.total, 0),
            func.coalesce(daily_sent_q.c.total, 0),
        )
        .outerjoin(daily_sent_q, all_months.c.month == daily_sent_q.c.month)
        .outerjoin(daily_recv_q, all_months.c.month == daily_recv_q.c.month)
        .outerjoin(gb_recv_q, all_months.c.month == gb_recv_q.c.month)
        .order_by(all_months.c.month.desc())
        .limit(months)
    )

    return [
        MonthlyTrendItem(month=row[0], received=row[1], sent=row[2])
        for row in result.all()
    ]


@router.get("/event-distribution", response_model=list[EventDistributionItem])
async def event_distribution(
    current_user: CurrentUser,
    db: DbSession,
):
    daily_q = (
        select(
            DailyRecord.event_type,
            func.sum(DailyRecord.amount).label("total_amount"),
            func.count(DailyRecord.id).label("record_count"),
        )
        .where(
            DailyRecord.owner_id == current_user.id,
            DailyRecord.type == "out",
            DailyRecord.is_deleted == False,
        )
        .group_by(DailyRecord.event_type)
    )
    result = await db.execute(daily_q)
    return [
        EventDistributionItem(
            event_type=row.event_type,
            total_amount=row.total_amount,
            record_count=row.record_count,
        )
        for row in result.all()
    ]


@router.get("/guestbook-summary", response_model=list[GuestbookStatsItem])
async def guestbook_summary_stats(
    current_user: CurrentUser,
    db: DbSession,
):
    stats_q = (
        select(
            GbRecord.guestbook_id,
            func.count(GbRecord.id).label("total_records"),
            func.coalesce(func.sum(GbRecord.amount), 0).label("total_amount"),
            func.count(GbRecord.id).filter(GbRecord.check_status == "checked").label("checked_count"),
        )
        .where(
            GbRecord.owner_id == current_user.id,
            GbRecord.is_deleted == False,
        )
        .group_by(GbRecord.guestbook_id)
        .subquery()
    )

    result = await db.execute(
        select(
            Guestbook.id,
            Guestbook.name,
            Guestbook.event_type,
            func.to_char(Guestbook.event_date, "YYYY-MM-DD"),
            func.coalesce(stats_q.c.total_records, 0),
            func.coalesce(stats_q.c.total_amount, 0),
            func.coalesce(stats_q.c.checked_count, 0),
        )
        .outerjoin(stats_q, Guestbook.id == stats_q.c.guestbook_id)
        .where(Guestbook.owner_id == current_user.id, Guestbook.is_deleted == False)
        .order_by(Guestbook.event_date.desc())
    )

    return [
        GuestbookStatsItem(
            guestbook_id=row[0],
            guestbook_name=row[1],
            event_type=row[2],
            event_date=row[3],
            total_records=row[4],
            total_amount=row[5],
            checked_count=row[6],
        )
        for row in result.all()
    ]
