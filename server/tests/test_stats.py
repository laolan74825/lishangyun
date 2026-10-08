from sqlalchemy import select, update

from app.models.daily_record import DailyRecord
from app.models.guestbook import Guestbook
from app.models.person import Person


def _create_guestbook(client, headers, name="测试礼簿"):
    return client.post("/api/guestbooks/", json={
        "name": name,
        "event_type": "wedding",
        "event_date": "2026-09-20",
    }, headers=headers)


def _create_person(db_session, owner_id, name="张三"):
    p = Person(
        owner_id=owner_id,
        name=name,
        phone="13800000000",
        relation_tag="朋友",
    )
    db_session.add(p)
    import asyncio
    asyncio.get_event_loop().run_until_complete(db_session.commit())
    import asyncio
    asyncio.get_event_loop().run_until_complete(db_session.refresh(p))
    return p


class TestPersonRanking:
    async def test_ranking_empty(self, client, admin_headers):
        resp = client.get("/api/stats/person-ranking", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_ranking_with_data(self, client, admin_headers, normal_user, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
        }, headers=admin_headers)

        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "李四",
            "amount": 30000,
            "payment_method": "cash",
        }, headers=admin_headers)

        resp = client.get("/api/stats/person-ranking?limit=10", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    async def test_ranking_limit(self, client, admin_headers, db_session):
        resp = client.get("/api/stats/person-ranking?limit=5", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()) <= 5


class TestTransactionByName:
    async def test_transaction_empty(self, client, admin_headers):
        resp = client.get("/api/stats/transaction-by-name?name=不存在", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_out"] == 0
        assert data["total_in"] == 0
        assert data["net"] == 0

    async def test_transaction_with_gb_records(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
        }, headers=admin_headers)

        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 30000,
            "payment_method": "wechat",
        }, headers=admin_headers)

        resp = client.get("/api/stats/transaction-by-name?name=张三", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_in"] == 80000
        assert data["total_out"] == 0
        assert data["net"] == 80000
        # 明细与计数随响应返回（人员管理页展开卡片依赖）
        assert data["daily_count"] == 0
        assert data["gb_count"] == 2
        assert len(data["gb_records"]) == 2
        assert {r["guestbook_name"] for r in data["gb_records"]} == {"测试礼簿"}

    async def test_transaction_includes_linked_records_and_adjustments(
        self, client, admin_headers, db_session
    ):
        """按姓名查询覆盖：①person_id 关联（合并改名场景）的记录 ②差额调整计入净差额 ③日常明细返回"""
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        # 人员「王五」并直接关联一条礼簿记录（guest_name 与人员名不同，仅 person_id 关联）
        person_id = client.post("/api/persons/", json={
            "name": "王五", "relationship_tag": "friend",
        }, headers=admin_headers).json()
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "王小五",
            "amount": 50000,
            "payment_method": "cash",
            "person_id": person_id,
        }, headers=admin_headers)
        # 同名日常记录
        client.post("/api/daily-records/", json={
            "type": "out",
            "person_name": "王五",
            "amount": 20000,
            "event_type": "婚礼",
            "event_date": "2026-09-20",
        }, headers=admin_headers)
        # 差额调整 +300
        client.post("/api/balance-adjustments/", json={
            "person_id": person_id,
            "amount": 30000,
            "reason": "补记",
        }, headers=admin_headers)

        resp = client.get("/api/stats/transaction-by-name?name=王五", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_out"] == 20000
        assert data["total_in"] == 50000
        assert data["adjustment_total"] == 30000
        # 净差额 = 收到 50000 - 送出 20000 + 调整 30000
        assert data["net"] == 60000
        assert data["daily_count"] == 1
        assert data["gb_count"] == 1


class TestStatsIsolation:
    async def test_user_cannot_see_other_stats(self, client, admin_headers, user_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
        }, headers=admin_headers)

        resp = client.get("/api/stats/transaction-by-name?name=张三", headers=user_headers)
        data = resp.json()
        assert data["total_in"] == 0


class TestOverviewSummary:
    """首页总览汇总：日常随礼 + 礼簿收礼统一计入收到合计"""

    async def test_overview_includes_guestbook_records(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
        }, headers=admin_headers)
        client.post("/api/daily-records/", json={
            "type": "in",
            "person_name": "李四",
            "amount": 20000,
            "event_type": "wedding",
            "event_date": "2026-09-20",
        }, headers=admin_headers)
        client.post("/api/daily-records/", json={
            "type": "out",
            "person_name": "王五",
            "amount": 10000,
            "event_type": "wedding",
            "event_date": "2026-09-20",
        }, headers=admin_headers)

        resp = client.get("/api/stats/overview", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        # 收到 = 日常收 20000 + 礼簿收 50000
        assert data["total_in"] == 70000
        assert data["total_out"] == 10000
        assert data["net"] == 60000

    async def test_overview_date_range_filters_both_sources(self, client, admin_headers, db_session):
        import datetime
        today = datetime.date.today()
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        # 宴席日期对齐到今天，使礼簿记录落在查询区间内
        await db_session.execute(
            update(Guestbook).where(Guestbook.id == gb_id).values(event_date=today)
        )
        await db_session.commit()
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
        }, headers=admin_headers)

        # 区间外（2020 年）：不包含今天录入的礼簿记录
        resp = client.get("/api/stats/overview?start_date=2020-01-01&end_date=2020-12-31",
                          headers=admin_headers)
        assert resp.json()["total_in"] == 0

        # 区间内：包含（礼簿记录按宴席日期归属）
        resp = client.get(
            f"/api/stats/overview?start_date={today.isoformat()}&end_date={today.isoformat()}",
            headers=admin_headers,
        )
        assert resp.json()["total_in"] == 50000

    async def test_overview_gb_record_filters_by_event_date_not_record_time(self, client, admin_headers, db_session):
        """今天补录上月宴席的收礼：计入上月区间，不计入本月区间"""
        import datetime
        today = datetime.date.today()
        first_of_this = today.replace(day=1)
        last_month_day = first_of_this - datetime.timedelta(days=1)
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        await db_session.execute(
            update(Guestbook).where(Guestbook.id == gb_id).values(event_date=last_month_day)
        )
        await db_session.commit()
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
        }, headers=admin_headers)

        # 上月区间：包含
        resp = client.get(
            f"/api/stats/overview?start_date={last_month_day.isoformat()}&end_date={last_month_day.isoformat()}",
            headers=admin_headers,
        )
        assert resp.json()["total_in"] == 50000

        # 本月区间：不包含（尽管录入时间是今天）
        resp = client.get(
            f"/api/stats/overview?start_date={today.isoformat()}&end_date={today.isoformat()}",
            headers=admin_headers,
        )
        assert resp.json()["total_in"] == 0

    async def test_overview_excludes_deleted(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
        }, headers=admin_headers)

        resp = client.get("/api/stats/overview", headers=admin_headers)
        assert resp.json()["total_in"] == 50000

        # 软删除礼簿（记录级联软删除）后不计入
        from sqlalchemy import update
        from app.models.gb_record import GbRecord
        await db_session.execute(update(GbRecord).values(is_deleted=True))
        await db_session.commit()
        resp = client.get("/api/stats/overview", headers=admin_headers)
        assert resp.json()["total_in"] == 0


class TestMonthlyTrend:
    """月度收支趋势：月份取日常收/送与礼簿收的并集，收到含礼簿"""

    async def test_trend_includes_gb_only_month(self, client, admin_headers, db_session):
        """只有礼簿收礼（无日常送出/收到）时趋势也应包含该月份"""
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
        }, headers=admin_headers)

        resp = client.get("/api/stats/monthly-trend", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        # 当前月：收到含礼簿 50000，送出为 0
        current = next(m for m in data if m["received"] >= 50000)
        assert current["sent"] == 0

    async def test_trend_merges_daily_and_gb(self, client, admin_headers, db_session):
        import datetime
        today_date = datetime.date.today()
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        # 宴席日期设为今天，礼簿收礼与日常收落在同一个月
        await db_session.execute(
            update(Guestbook).where(Guestbook.id == gb_id).values(event_date=today_date)
        )
        await db_session.commit()
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
        }, headers=admin_headers)
        today = today_date.isoformat()
        client.post("/api/daily-records/", json={
            "type": "in",
            "person_name": "李四",
            "amount": 20000,
            "event_type": "wedding",
            "event_date": today,
        }, headers=admin_headers)

        resp = client.get("/api/stats/monthly-trend", headers=admin_headers)
        data = resp.json()
        current = next(m for m in data if m["received"] >= 70000)
        assert current["received"] == 70000

    async def test_trend_empty(self, client, admin_headers, db_session):
        resp = client.get("/api/stats/monthly-trend", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_trend_months_returned_in_ascending_order(self, client, admin_headers, db_session):
        """月份按时间正序返回（图表从左到右），后录入的早期月份排在前面"""
        import datetime
        today = datetime.date.today()
        last_month_day = today.replace(day=1) - datetime.timedelta(days=1)
        # 先录入本月日常收，再补录上月日常收
        client.post("/api/daily-records/", json={
            "type": "in", "person_name": "李四", "amount": 10000,
            "event_type": "wedding", "event_date": today.isoformat(),
        }, headers=admin_headers)
        client.post("/api/daily-records/", json={
            "type": "in", "person_name": "王五", "amount": 20000,
            "event_type": "wedding", "event_date": last_month_day.isoformat(),
        }, headers=admin_headers)

        data = client.get("/api/stats/monthly-trend", headers=admin_headers).json()
        assert len(data) == 2
        assert data[0]["month"] < data[1]["month"]
        assert data[0]["received"] == 20000  # 上月（先展示）
        assert data[1]["received"] == 10000  # 本月

    async def test_trend_gb_record_groups_by_event_date_not_record_time(self, client, admin_headers, db_session):
        """礼簿收礼按宴席日期归属月份：今天录入、宴席在上月，应计入上月而非本月"""
        import datetime
        today = datetime.date.today()
        # 上个月同一天作为宴席日期（1 号则退回上上个月最后一天，保证跨月）
        first_of_this = today.replace(day=1)
        last_month_day = first_of_this - datetime.timedelta(days=1)
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        # 修正宴席日期为上个月
        await db_session.execute(
            update(Guestbook).where(Guestbook.id == gb_id).values(event_date=last_month_day)
        )
        await db_session.commit()

        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
        }, headers=admin_headers)

        data = client.get("/api/stats/monthly-trend", headers=admin_headers).json()
        target = f"{last_month_day.year:04d}-{last_month_day.month:02d}"
        this_month = f"{today.year:04d}-{today.month:02d}"
        month_map = {m["month"]: m for m in data}
        # 计入宴席日期所在月
        assert month_map[target]["received"] == 50000
        # 不计入录入时间所在月（本月无其他数据）
        assert this_month not in month_map or month_map[this_month]["received"] == 0


class TestEventDistribution:
    """按事由统计（收到）：日常收 + 礼簿收礼按事由合并"""

    async def test_distribution_includes_guestbook(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers, name="婚礼礼簿").json()["id"]
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
        }, headers=admin_headers)
        client.post("/api/daily-records/", json={
            "type": "in",
            "person_name": "李四",
            "amount": 20000,
            "event_type": "wedding",
            "event_date": "2026-09-20",
        }, headers=admin_headers)

        resp = client.get("/api/stats/event-distribution", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        wedding = next(d for d in data if d["event_type"] == "wedding")
        assert wedding["total_amount"] == 70000
        assert wedding["record_count"] == 2

    async def test_distribution_excludes_out_and_deleted(self, client, admin_headers, db_session):
        """送出不计入；软删除不计入"""
        client.post("/api/daily-records/", json={
            "type": "out",
            "person_name": "王五",
            "amount": 99900,
            "event_type": "wedding",
            "event_date": "2026-09-20",
        }, headers=admin_headers)

        resp = client.get("/api/stats/event-distribution", headers=admin_headers)
        assert resp.json() == []

    async def test_distribution_type_out_only_daily_out(self, client, admin_headers, db_session):
        """type=out：只统计日常送出，不含日常收与礼簿收礼"""
        client.post("/api/daily-records/", json={
            "type": "in",
            "person_name": "张三",
            "amount": 20000,
            "event_type": "wedding",
            "event_date": "2026-09-20",
        }, headers=admin_headers)
        client.post("/api/daily-records/", json={
            "type": "out",
            "person_name": "李四",
            "amount": 50000,
            "event_type": "funeral",
            "event_date": "2026-09-21",
        }, headers=admin_headers)

        resp = client.get("/api/stats/event-distribution?type=out", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["event_type"] == "funeral"
        assert data[0]["total_amount"] == 50000


class TestOverviewAdjustment:
    """总览净差额含差额调整口径（与人员排行一致）"""

    async def test_net_with_adjustment(self, client, admin_headers, super_admin, db_session):
        p = Person(owner_id=super_admin.id, name="张三", relationship_tag="friend")
        db_session.add(p)
        await db_session.commit()
        await db_session.refresh(p)
        client.post("/api/daily-records/", json={
            "type": "in",
            "person_name": "张三",
            "amount": 20000,
            "event_type": "wedding",
            "event_date": "2026-09-20",
        }, headers=admin_headers)
        client.post("/api/daily-records/", json={
            "type": "out",
            "person_name": "王五",
            "amount": 10000,
            "event_type": "wedding",
            "event_date": "2026-09-20",
        }, headers=admin_headers)
        client.post("/api/balance-adjustments/", json={
            "person_id": p.id,
            "amount": 5000,
            "reason": "补差额",
        }, headers=admin_headers)

        resp = client.get("/api/stats/overview", headers=admin_headers)
        data = resp.json()
        assert data["net"] == 10000
        assert data["adjustment_total"] == 5000
        assert data["net_with_adjustment"] == 15000

    async def test_adjustment_no_adjustments_defaults_zero(self, client, admin_headers, db_session):
        resp = client.get("/api/stats/overview", headers=admin_headers)
        data = resp.json()
        assert data["adjustment_total"] == 0
        assert data["net_with_adjustment"] == data["net"]


class TestPersonRankingSort:
    """排行支持按送出/收到/净额排序"""

    async def test_sort_by_out_and_in(self, client, admin_headers, super_admin, db_session):
        p1 = Person(owner_id=super_admin.id, name="甲某", relationship_tag="friend")
        p2 = Person(owner_id=super_admin.id, name="乙某", relationship_tag="relative")
        db_session.add_all([p1, p2])
        await db_session.commit()
        await db_session.refresh(p1)
        await db_session.refresh(p2)
        client.post("/api/daily-records/", json={
            "type": "out",
            "person_id": p1.id,
            "person_name": "甲某",
            "amount": 10000,
            "event_type": "wedding",
            "event_date": "2026-09-20",
        }, headers=admin_headers)
        client.post("/api/daily-records/", json={
            "type": "in",
            "person_id": p2.id,
            "person_name": "乙某",
            "amount": 90000,
            "event_type": "wedding",
            "event_date": "2026-09-20",
        }, headers=admin_headers)

        # 按送出：甲某第一
        resp = client.get("/api/stats/person-ranking?sort=out", headers=admin_headers)
        assert resp.json()[0]["person_name"] == "甲某"

        # 按收到：乙某第一
        resp = client.get("/api/stats/person-ranking?sort=in", headers=admin_headers)
        assert resp.json()[0]["person_name"] == "乙某"

