from sqlalchemy import select

from app.models.daily_record import DailyRecord
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
        gb_id = _create_guestbook(client, admin_headers).json()

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
        gb_id = _create_guestbook(client, admin_headers).json()

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


class TestStatsIsolation:
    async def test_user_cannot_see_other_stats(self, client, admin_headers, user_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
        }, headers=admin_headers)

        resp = client.get("/api/stats/transaction-by-name?name=张三", headers=user_headers)
        data = resp.json()
        assert data["total_in"] == 0
