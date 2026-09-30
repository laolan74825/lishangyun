def _create_guestbook(client, headers, name="测试礼簿"):
    return client.post("/api/guestbooks/", json={
        "name": name,
        "event_type": "wedding",
        "event_date": "2026-09-20",
    }, headers=headers)


def _create_record(client, headers, gb_id, guest_name="张三", amount=50000):
    return client.post(f"/api/guestbooks/{gb_id}/records", json={
        "guest_name": guest_name,
        "amount": amount,
        "payment_method": "cash",
    }, headers=headers)


class TestOperationLogsList:
    async def test_logs_empty(self, client, admin_headers):
        resp = client.get("/api/operation-logs/", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pagination"]["total_count"] == 0
        assert data["items"] == []

    async def test_logs_after_create(self, client, admin_headers, db_session):
        _create_guestbook(client, admin_headers)

        resp = client.get("/api/operation-logs/", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pagination"]["total_count"] >= 1
        assert any(log["target_table"] == "guestbooks" for log in data["items"])

    async def test_logs_after_record_create(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        _create_record(client, admin_headers, gb_id)

        resp = client.get("/api/operation-logs/", headers=admin_headers)
        data = resp.json()
        assert any(log["target_table"] == "gb_records" for log in data["items"])

    async def test_filter_by_guestbook_id(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        _create_record(client, admin_headers, gb_id)

        resp = client.get(f"/api/operation-logs/?guestbook_id={gb_id}", headers=admin_headers)
        data = resp.json()
        assert all(log["guestbook_id"] == gb_id for log in data["items"])

    async def test_filter_by_target_table(self, client, admin_headers, db_session):
        _create_guestbook(client, admin_headers)

        resp = client.get("/api/operation-logs/?target_table=guestbooks", headers=admin_headers)
        data = resp.json()
        assert all(log["target_table"] == "guestbooks" for log in data["items"])
        assert len(data["items"]) >= 1

    async def test_pagination(self, client, admin_headers, db_session):
        for i in range(3):
            _create_guestbook(client, admin_headers, name=f"礼簿{i}")

        resp = client.get("/api/operation-logs/?page=1&page_size=2", headers=admin_headers)
        data = resp.json()
        assert len(data["items"]) == 2
        assert data["pagination"]["total_count"] >= 3
        assert data["pagination"]["page"] == 1
        assert data["pagination"]["page_size"] == 2


class TestOperationLogsIsolation:
    async def test_user_cannot_see_other_logs(self, client, admin_headers, user_headers, db_session):
        _create_guestbook(client, admin_headers)

        resp = client.get("/api/operation-logs/", headers=user_headers)
        data = resp.json()
        assert data["pagination"]["total_count"] == 0
