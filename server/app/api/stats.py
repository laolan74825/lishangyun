from datetime import date, datetime, timezone

from fastapi import APIRouter, Query
from sqlalchemy import func, select, union

from app.core.dependencies import CurrentUser, DbSession
from app.models.daily_record import DailyRecord
from app.models.gb_record import GbRecord
from app.models.guestbook import Guestbook
from app.models.person import Person
from app.models.person_balance_adjustment import PersonBalanceAdjustment
from app.schemas.person import PersonSummaryGbRecord
from app.schemas.stats import (
    EventDistributionItem,
    GuestbookStatsItem,
    MonthlyTrendItem,
    OverviewSummary,
    PersonRankingItem,
    TransactionSummaryByName,
)

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/overview", response_model=OverviewSummary)
async def overview_summary(
    current_user: CurrentUser,
    db: DbSession,
    start_date: date | None = None,
    end_date: date | None = None,
):
    """首页总览汇总：日常随礼 + 礼簿现场收礼。

    - 日常记录按 event_date 过滤；礼簿记录按 record_time 过滤
    - 礼簿收礼全部计入"收到"（total_in），与人员/统计模块口径一致
    """
    daily_base = [DailyRecord.owner_id == current_user.id, DailyRecord.is_deleted == False]
    if start_date:
        daily_base.append(DailyRecord.event_date >= start_date)
    if end_date:
        daily_base.append(DailyRecord.event_date <= end_date)

    daily_out = (await db.execute(
        select(func.coalesce(func.sum(DailyRecord.amount), 0)).where(*daily_base, DailyRecord.type == "out")
    )).scalar_one()
    daily_in = (await db.execute(
        select(func.coalesce(func.sum(DailyRecord.amount), 0)).where(*daily_base, DailyRecord.type == "in")
    )).scalar_one()

    gb_base = [GbRecord.owner_id == current_user.id, GbRecord.is_deleted == False]
    # record_time 以无时区 UTC 存储，"某天"按本地日期理解，需换算为 UTC 时间范围避免时区错位漏数
    if start_date:
        start_dt = datetime.combine(start_date, datetime.min.time()).astimezone(timezone.utc).replace(tzinfo=None)
        gb_base.append(GbRecord.record_time >= start_dt)
    if end_date:
        end_dt = datetime.combine(end_date, datetime.max.time()).astimezone(timezone.utc).replace(tzinfo=None)
        gb_base.append(GbRecord.record_time <= end_dt)
    gb_in = (await db.execute(
        select(func.coalesce(func.sum(GbRecord.amount), 0)).where(*gb_base)
    )).scalar_one()

    total_in = daily_in + gb_in
    return OverviewSummary(total_out=daily_out, total_in=total_in, net=total_in - daily_out)


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

    adj_q = (
        select(
            PersonBalanceAdjustment.person_id,
            func.coalesce(func.sum(PersonBalanceAdjustment.amount), 0).label("adj_total"),
        )
        .where(PersonBalanceAdjustment.owner_id == current_user.id)
        .group_by(PersonBalanceAdjustment.person_id)
        .subquery()
    )

    result = await db.execute(
        select(
            Person.id.label("person_id"),
            Person.name.label("person_name"),
            func.coalesce(daily_out_q.c.total_out, 0).label("total_out"),
            (func.coalesce(daily_in_q.c.daily_in, 0) + func.coalesce(gb_q.c.gb_total, 0)).label("total_in"),
            func.coalesce(adj_q.c.adj_total, 0).label("adjustment_total"),
        )
        .outerjoin(daily_out_q, Person.id == daily_out_q.c.person_id)
        .outerjoin(daily_in_q, Person.id == daily_in_q.c.person_id)
        .outerjoin(gb_q, Person.id == gb_q.c.person_id)
        .outerjoin(adj_q, Person.id == adj_q.c.person_id)
        .where(Person.owner_id == current_user.id, Person.is_deleted == False)
        .order_by(
            func.abs(
                func.coalesce(daily_in_q.c.daily_in, 0)
                + func.coalesce(gb_q.c.gb_total, 0)
                + func.coalesce(adj_q.c.adj_total, 0)
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
            net=row.total_in - row.total_out + row.adjustment_total,
        )
        for row in result.all()
    ]


@router.get("/transaction-by-name", response_model=TransactionSummaryByName)
async def transaction_by_name(
    current_user: CurrentUser,
    db: DbSession,
    name: str = Query(...),
):
    """按姓名汇总往来：净差额含差额调整；明细含按姓名或人员关联的记录。

    记录匹配口径：person_name/guest_name 等于该姓名，或记录已关联到同名人
    员（person_id），覆盖「人员合并」后记录改挂到目标人员的场景。
    """
    person_ids = (await db.execute(
        select(Person.id)
        .where(Person.owner_id == current_user.id, Person.name == name,
               Person.is_deleted == False)
    )).scalars().all()

    daily_match = DailyRecord.person_name == name
    gb_match = GbRecord.guest_name == name
    if person_ids:
        daily_match = daily_match | DailyRecord.person_id.in_(person_ids)
        gb_match = gb_match | GbRecord.person_id.in_(person_ids)

    daily_records = (await db.execute(
        select(DailyRecord)
        .where(DailyRecord.owner_id == current_user.id, daily_match,
               DailyRecord.is_deleted == False)
        .order_by(DailyRecord.event_date.desc())
    )).scalars().all()

    gb_rows = (await db.execute(
        select(GbRecord, Guestbook.name, Guestbook.event_type)
        .join(Guestbook, GbRecord.guestbook_id == Guestbook.id)
        .where(GbRecord.owner_id == current_user.id, gb_match,
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

    adjustment_total = 0
    if person_ids:
        adjustment_total = (await db.execute(
            select(func.coalesce(func.sum(PersonBalanceAdjustment.amount), 0))
            .where(PersonBalanceAdjustment.owner_id == current_user.id,
                   PersonBalanceAdjustment.person_id.in_(person_ids))
        )).scalar_one()

    daily_out = sum(r.amount for r in daily_records if r.type == "out")
    daily_in = sum(r.amount for r in daily_records if r.type == "in")
    gb_total = sum(r.amount for r in gb_records)
    total_in = daily_in + gb_total
    return TransactionSummaryByName(
        total_out=daily_out, total_in=total_in, adjustment_total=adjustment_total,
        net=total_in - daily_out + adjustment_total,
        daily_count=len(daily_records), gb_count=len(gb_records),
        daily_records=daily_records, gb_records=gb_records,
    )


@router.get("/monthly-trend", response_model=list[MonthlyTrendItem])
async def monthly_trend(
    current_user: CurrentUser,
    db: DbSession,
    months: int = Query(12, ge=1, le=36),
):
    """最近 N 个月收支趋势：收到 = 日常收 + 礼簿收礼，送出 = 日常送。

    月份集合取三种来源的并集，避免只有单边数据的月份整条缺失。
    """
    daily_month = func.date_trunc("month", DailyRecord.event_date)
    gb_month = func.date_trunc("month", GbRecord.record_time)

    daily_sent_q = (
        select(
            daily_month.label("m"),
            func.coalesce(func.sum(DailyRecord.amount), 0).label("total"),
        )
        .where(
            DailyRecord.owner_id == current_user.id,
            DailyRecord.type == "out",
            DailyRecord.is_deleted == False,
        )
        .group_by(daily_month)
        .subquery()
    )

    daily_recv_q = (
        select(
            daily_month.label("m"),
            func.coalesce(func.sum(DailyRecord.amount), 0).label("total"),
        )
        .where(
            DailyRecord.owner_id == current_user.id,
            DailyRecord.type == "in",
            DailyRecord.is_deleted == False,
        )
        .group_by(daily_month)
        .subquery()
    )

    gb_recv_q = (
        select(
            gb_month.label("m"),
            func.coalesce(func.sum(GbRecord.amount), 0).label("total"),
        )
        .where(
            GbRecord.owner_id == current_user.id,
            GbRecord.is_deleted == False,
        )
        .group_by(gb_month)
        .subquery()
    )

    all_months = union(
        select(daily_sent_q.c.m),
        select(daily_recv_q.c.m),
        select(gb_recv_q.c.m),
    ).subquery()

    result = await db.execute(
        select(
            func.to_char(all_months.c.m, "YYYY-MM").label("month"),
            (func.coalesce(gb_recv_q.c.total, 0) + func.coalesce(daily_recv_q.c.total, 0)).label("received"),
            func.coalesce(daily_sent_q.c.total, 0).label("sent"),
        )
        .outerjoin(daily_sent_q, all_months.c.m == daily_sent_q.c.m)
        .outerjoin(daily_recv_q, all_months.c.m == daily_recv_q.c.m)
        .outerjoin(gb_recv_q, all_months.c.m == gb_recv_q.c.m)
        .order_by(all_months.c.m.desc())
        .limit(months)
    )

    return [
        MonthlyTrendItem(month=row.month, received=row.received, sent=row.sent)
        for row in result.all()
    ]


@router.get("/event-distribution", response_model=list[EventDistributionItem])
async def event_distribution(
    current_user: CurrentUser,
    db: DbSession,
):
    """按事由统计收到的礼金：日常（收）+ 礼簿收礼（按所属礼簿的事由）。"""
    daily_result = await db.execute(
        select(
            DailyRecord.event_type,
            func.coalesce(func.sum(DailyRecord.amount), 0).label("total_amount"),
            func.count(DailyRecord.id).label("record_count"),
        )
        .where(
            DailyRecord.owner_id == current_user.id,
            DailyRecord.type == "in",
            DailyRecord.is_deleted == False,
        )
        .group_by(DailyRecord.event_type)
    )

    gb_result = await db.execute(
        select(
            Guestbook.event_type,
            func.coalesce(func.sum(GbRecord.amount), 0).label("total_amount"),
            func.count(GbRecord.id).label("record_count"),
        )
        .join(Guestbook, GbRecord.guestbook_id == Guestbook.id)
        .where(
            GbRecord.owner_id == current_user.id,
            GbRecord.is_deleted == False,
        )
        .group_by(Guestbook.event_type)
    )

    merged: dict[str, EventDistributionItem] = {}
    for row in daily_result.all():
        merged[row.event_type] = EventDistributionItem(
            event_type=row.event_type,
            total_amount=row.total_amount,
            record_count=row.record_count,
        )
    for row in gb_result.all():
        if row.event_type in merged:
            merged[row.event_type].total_amount += row.total_amount
            merged[row.event_type].record_count += row.record_count
        else:
            merged[row.event_type] = EventDistributionItem(
                event_type=row.event_type,
                total_amount=row.total_amount,
                record_count=row.record_count,
            )
    return sorted(merged.values(), key=lambda x: x.total_amount, reverse=True)


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
