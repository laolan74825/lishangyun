from datetime import date

from sqlalchemy import select

from app.models.operation_log import OperationLog


def _create_guestbook(client, headers, name="测试礼簿", event_type="wedding", event_date="2026-10-01"):
    return client.post("/api/guestbooks/", json={
        "name": name,
        "event_type": event_type,
        "event_date": event_date,
    }, headers=headers)


class TestGuestbookCRUD:
    async def test_create_guestbook(self, client, admin_headers, db_session):
        resp = _create_guestbook(client, admin_headers)
        assert resp.status_code == 200
        gb_id = resp.json()["id"]
        assert isinstance(gb_id, int)

    async def test_list_guestbooks(self, client, admin_headers, db_session):
        _create_guestbook(client, admin_headers, name="礼簿1")
        _create_guestbook(client, admin_headers, name="礼簿2")

        resp = client.get("/api/guestbooks/", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pagination"]["total_count"] == 2

    async def test_get_guestbook(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        resp = client.get(f"/api/guestbooks/{gb_id}", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "测试礼簿"
        assert resp.json()["status"] == "active"

    async def test_update_guestbook(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        resp = client.put(f"/api/guestbooks/{gb_id}", json={
            "name": "更新后的礼簿",
        }, headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/guestbooks/{gb_id}", headers=admin_headers)
        assert resp_get.json()["name"] == "更新后的礼簿"

    async def test_delete_guestbook_empty(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        resp = client.delete(f"/api/guestbooks/{gb_id}", headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/guestbooks/{gb_id}", headers=admin_headers)
        assert resp_get.status_code == 404

    async def test_list_with_status_filter(self, client, admin_headers, db_session):
        _create_guestbook(client, admin_headers, name="礼簿1")
        gb_id2 = _create_guestbook(client, admin_headers, name="礼簿2").json()["id"]
        client.post(f"/api/guestbooks/{gb_id2}/close", headers=admin_headers)

        resp = client.get("/api/guestbooks/?status=closing", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["pagination"]["total_count"] == 1


class TestGuestbookLifecycle:
    async def test_close_guestbook(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        resp = client.post(f"/api/guestbooks/{gb_id}/close", headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/guestbooks/{gb_id}", headers=admin_headers)
        assert resp_get.json()["status"] == "closing"
        assert resp_get.json()["closing_at"] is not None

    async def test_close_already_closing_fails(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        client.post(f"/api/guestbooks/{gb_id}/close", headers=admin_headers)

        resp = client.post(f"/api/guestbooks/{gb_id}/close", headers=admin_headers)
        assert resp.status_code == 400

    async def test_archive_from_active(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        resp = client.post(f"/api/guestbooks/{gb_id}/archive", headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/guestbooks/{gb_id}", headers=admin_headers)
        assert resp_get.json()["status"] == "archived"

    async def test_archive_from_closing(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        client.post(f"/api/guestbooks/{gb_id}/close", headers=admin_headers)

        resp = client.post(f"/api/guestbooks/{gb_id}/archive", headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/guestbooks/{gb_id}", headers=admin_headers)
        assert resp_get.json()["status"] == "archived"

    async def test_archive_already_archived_fails(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        client.post(f"/api/guestbooks/{gb_id}/archive", headers=admin_headers)

        resp = client.post(f"/api/guestbooks/{gb_id}/archive", headers=admin_headers)
        assert resp.status_code == 400


class TestGuestbookDeleteWithRecords:
    async def test_delete_guestbook_with_records_blocked(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
        }, headers=admin_headers)

        resp = client.delete(f"/api/guestbooks/{gb_id}", headers=admin_headers)
        assert resp.status_code == 400
        assert "收礼记录" in resp.json()["detail"]


class TestGuestbookSummary:
    async def test_summary_empty_guestbook(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        resp = client.get(f"/api/guestbooks/{gb_id}/summary", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_records"] == 0
        assert data["total_amount"] == 0

    async def test_summaries_list(self, client, admin_headers, db_session):
        _create_guestbook(client, admin_headers, name="礼簿1")
        _create_guestbook(client, admin_headers, name="礼簿2")

        resp = client.get("/api/guestbooks/summaries", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2


class TestGuestbookAuditLog:
    async def test_create_writes_audit_log(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        result = await db_session.execute(
            select(OperationLog).where(
                OperationLog.target_table == "guestbooks",
                OperationLog.target_id == gb_id,
                OperationLog.action_type == "CREATE",
            )
        )
        logs = result.scalars().all()
        assert len(logs) == 1


class TestDataIsolation:
    async def test_user_cannot_see_other_guestbooks(self, client, admin_headers, user_headers, db_session):
        _create_guestbook(client, admin_headers)

        resp = client.get("/api/guestbooks/", headers=user_headers)
        assert resp.status_code == 200
        assert resp.json()["pagination"]["total_count"] == 0

    async def test_user_cannot_access_other_guestbook(self, client, admin_headers, user_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        resp = client.get(f"/api/guestbooks/{gb_id}", headers=user_headers)
        assert resp.status_code == 403
