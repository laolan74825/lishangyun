from sqlalchemy import select

from app.models.daily_record import DailyRecord
from app.models.operation_log import OperationLog


def _create_record(client, headers, person_name="张三", amount=50000, record_type="in",
                   event_type="wedding", event_date="2026-09-20"):
    return client.post("/api/daily-records/", json={
        "type": record_type,
        "person_name": person_name,
        "amount": amount,
        "event_type": event_type,
        "event_date": event_date,
    }, headers=headers)


class TestDailyRecordCRUD:
    async def test_create_record(self, client, admin_headers, db_session):
        resp = _create_record(client, admin_headers)
        assert resp.status_code == 200
        record_id = resp.json()["id"]
        assert isinstance(record_id, int)

    async def test_list_records(self, client, admin_headers, db_session):
        _create_record(client, admin_headers, person_name="张三")
        _create_record(client, admin_headers, person_name="李四")

        resp = client.get("/api/daily-records/", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pagination"]["total_count"] == 2

    async def test_update_record(self, client, admin_headers, db_session):
        record_id = _create_record(client, admin_headers).json()["id"]

        resp = client.put(f"/api/daily-records/{record_id}", json={
            "amount": 60000,
            "person_name": "张三丰",
        }, headers=admin_headers)
        assert resp.status_code == 200

    async def test_delete_record_soft(self, client, admin_headers, db_session):
        record_id = _create_record(client, admin_headers).json()["id"]

        resp = client.delete(f"/api/daily-records/{record_id}", headers=admin_headers)
        assert resp.status_code == 200

        resp_list = client.get("/api/daily-records/", headers=admin_headers)
        assert resp_list.json()["pagination"]["total_count"] == 0

    async def test_get_nonexistent_record(self, client, admin_headers):
        resp = client.put("/api/daily-records/9999", json={"amount": 100}, headers=admin_headers)
        assert resp.status_code == 404


class TestDailyRecordFilters:
    async def test_filter_by_type(self, client, admin_headers, db_session):
        _create_record(client, admin_headers, person_name="张三", record_type="in")
        _create_record(client, admin_headers, person_name="李四", record_type="out")

        resp = client.get("/api/daily-records/?type=in", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pagination"]["total_count"] == 1
        assert data["items"][0]["type"] == "in"

    async def test_filter_by_date_range(self, client, admin_headers, db_session):
        _create_record(client, admin_headers, person_name="张三", event_date="2026-09-01")
        _create_record(client, admin_headers, person_name="李四", event_date="2026-09-20")

        resp = client.get("/api/daily-records/?start_date=2026-09-15&end_date=2026-09-25", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pagination"]["total_count"] == 1

    async def test_filter_by_keyword(self, client, admin_headers, db_session):
        _create_record(client, admin_headers, person_name="张三")
        _create_record(client, admin_headers, person_name="李四")

        resp = client.get("/api/daily-records/?keyword=张", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["pagination"]["total_count"] == 1


class TestDailyRecordSummary:
    async def test_summary_empty(self, client, admin_headers):
        resp = client.get("/api/daily-records/summary", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_records"] == 0
        assert data["total_in"] == 0
        assert data["total_out"] == 0
        assert data["net"] == 0

    async def test_summary_with_records(self, client, admin_headers, db_session):
        _create_record(client, admin_headers, person_name="张三", amount=50000, record_type="in")
        _create_record(client, admin_headers, person_name="李四", amount=30000, record_type="out")

        resp = client.get("/api/daily-records/summary", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_records"] == 2
        assert data["total_in"] == 50000
        assert data["total_out"] == 30000
        assert data["net"] == 20000

    async def test_summary_with_type_filter(self, client, admin_headers, db_session):
        _create_record(client, admin_headers, amount=50000, record_type="in")
        _create_record(client, admin_headers, amount=30000, record_type="out")

        resp = client.get("/api/daily-records/summary?type=in", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_in"] == 50000
        assert data["total_out"] == 0


class TestDailyRecordAuditLog:
    async def test_create_writes_audit_log(self, client, admin_headers, db_session):
        record_id = _create_record(client, admin_headers).json()["id"]

        result = await db_session.execute(
            select(OperationLog).where(
                OperationLog.target_table == "daily_records",
                OperationLog.target_id == record_id,
                OperationLog.action_type == "CREATE",
            )
        )
        logs = result.scalars().all()
        assert len(logs) == 1


class TestDataIsolation:
    async def test_user_cannot_see_other_records(self, client, admin_headers, user_headers, db_session):
        _create_record(client, admin_headers)

        resp = client.get("/api/daily-records/", headers=user_headers)
        assert resp.status_code == 200
        assert resp.json()["pagination"]["total_count"] == 0

    async def test_user_cannot_update_other_record(self, client, admin_headers, user_headers, db_session):
        record_id = _create_record(client, admin_headers).json()["id"]

        resp = client.put(f"/api/daily-records/{record_id}", json={
            "amount": 99999,
        }, headers=user_headers)
        assert resp.status_code == 404


class TestAmountValidation:
    async def test_amount_below_minimum_rejected(self, client, admin_headers):
        resp = _create_record(client, admin_headers, amount=50)
        assert resp.status_code == 422

    async def test_amount_above_maximum_rejected(self, client, admin_headers):
        resp = _create_record(client, admin_headers, amount=50000001)
        assert resp.status_code == 422
