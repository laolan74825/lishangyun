import uuid as uuid_mod


def _create_daily_record(client, headers, person_name="张三", amount=50000):
    return client.post("/api/daily-records/", json={
        "type": "in",
        "person_name": person_name,
        "amount": amount,
        "event_type": "wedding",
        "event_date": "2026-09-20",
    }, headers=headers)


class TestSyncPull:
    async def test_pull_empty(self, client, admin_headers):
        resp = client.post("/api/sync/pull", json={
            "client_id": "test-client",
            "tables": {
                "daily_records": {"since_version": 0},
            },
        }, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["changes"]["daily_records"]["created"] == []
        assert data["changes"]["daily_records"]["updated"] == []
        assert data["changes"]["daily_records"]["deleted"] == []

    async def test_pull_created_records(self, client, admin_headers, db_session):
        _create_daily_record(client, admin_headers, person_name="张三")

        resp = client.post("/api/sync/pull", json={
            "client_id": "test-client",
            "tables": {
                "daily_records": {"since_version": 0},
            },
        }, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        created = data["changes"]["daily_records"]["created"]
        assert len(created) >= 1
        assert any(r["person_name"] == "张三" for r in created)

    async def test_pull_incremental(self, client, admin_headers, db_session):
        _create_daily_record(client, admin_headers, person_name="张三")

        resp1 = client.post("/api/sync/pull", json={
            "client_id": "test-client",
            "tables": {"daily_records": {"since_version": 0}},
        }, headers=admin_headers)
        server_version = resp1.json()["server_version"]

        _create_daily_record(client, admin_headers, person_name="李四")

        resp2 = client.post("/api/sync/pull", json={
            "client_id": "test-client",
            "tables": {"daily_records": {"since_version": server_version}},
        }, headers=admin_headers)
        data = resp2.json()
        created = data["changes"]["daily_records"]["created"]
        assert all(r["person_name"] != "张三" for r in created)

    async def test_pull_multiple_tables(self, client, admin_headers, db_session):
        _create_daily_record(client, admin_headers, person_name="张三")

        resp = client.post("/api/sync/pull", json={
            "client_id": "test-client",
            "tables": {
                "daily_records": {"since_version": 0},
                "persons": {"since_version": 0},
                "gb_records": {"since_version": 0},
            },
        }, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "daily_records" in data["changes"]
        assert "persons" in data["changes"]
        assert "gb_records" in data["changes"]

    async def test_pull_unsupported_table(self, client, admin_headers):
        resp = client.post("/api/sync/pull", json={
            "client_id": "test-client",
            "tables": {"unknown_table": {"since_version": 0}},
        }, headers=admin_headers)
        assert resp.status_code == 400

    async def test_pull_with_limit(self, client, admin_headers, db_session):
        for i in range(5):
            _create_daily_record(client, admin_headers, person_name=f"用户{i}")

        resp = client.post("/api/sync/pull", json={
            "client_id": "test-client",
            "tables": {"daily_records": {"since_version": 0, "limit": 2}},
        }, headers=admin_headers)
        data = resp.json()
        total = (
            len(data["changes"]["daily_records"]["created"])
            + len(data["changes"]["daily_records"]["updated"])
        )
        assert total <= 2


class TestSyncPush:
    async def test_push_new_record(self, client, admin_headers, db_session):
        new_uuid = str(uuid_mod.uuid4())
        resp = client.post("/api/sync/push", json={
            "client_id": "test-client",
            "changes": {
                "daily_records": [{
                    "uuid": new_uuid,
                    "type": "in",
                    "person_name": "同步用户",
                    "amount": 20000,
                    "event_type": "wedding",
                    "event_date": "2026-09-20",
                    "source": "daily",
                    "sync_version": 1,
                    "is_deleted": False,
                    "is_private": False,
                }],
            },
        }, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["accepted"]) == 1
        assert data["accepted"][0]["uuid"] == new_uuid

    async def test_push_update_existing(self, client, admin_headers, db_session):
        record_resp = _create_daily_record(client, admin_headers, person_name="张三")
        record_id = record_resp.json()["id"]

        pull_resp = client.post("/api/sync/pull", json={
            "client_id": "test-client",
            "tables": {"daily_records": {"since_version": 0}},
        }, headers=admin_headers)
        records = pull_resp.json()["changes"]["daily_records"]["created"]
        record = next(r for r in records if r["id"] == record_id)

        resp = client.post("/api/sync/push", json={
            "client_id": "test-client",
            "changes": {
                "daily_records": [{
                    **record,
                    "person_name": "张三丰",
                    "sync_version": record["sync_version"] + 1,
                }],
            },
        }, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["accepted"]) == 1

    async def test_push_conflict_server_newer(self, client, admin_headers, db_session):
        record_resp = _create_daily_record(client, admin_headers, person_name="张三")
        record_id = record_resp.json()["id"]

        client.put(f"/api/daily-records/{record_id}", json={
            "amount": 60000,
            "person_name": "张三",
        }, headers=admin_headers)

        pull_resp = client.post("/api/sync/pull", json={
            "client_id": "test-client",
            "tables": {"daily_records": {"since_version": 0}},
        }, headers=admin_headers)
        records = pull_resp.json()["changes"]["daily_records"]["created"]
        record = next(r for r in records if r["id"] == record_id)

        resp = client.post("/api/sync/push", json={
            "client_id": "test-client",
            "changes": {
                "daily_records": [{
                    **record,
                    "sync_version": 0,
                }],
            },
        }, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["conflicts"]) >= 1

    async def test_push_invalid_amount_skipped(self, client, admin_headers, db_session):
        new_uuid = str(uuid_mod.uuid4())
        resp = client.post("/api/sync/push", json={
            "client_id": "test-client",
            "changes": {
                "daily_records": [{
                    "uuid": new_uuid,
                    "type": "in",
                    "person_name": "测试",
                    "amount": 10,
                    "event_type": "wedding",
                    "event_date": "2026-09-20",
                    "source": "daily",
                    "sync_version": 1,
                    "is_deleted": False,
                    "is_private": False,
                }],
            },
        }, headers=admin_headers)
        data = resp.json()
        assert len(data["accepted"]) == 0

    async def test_push_no_uuid_skipped(self, client, admin_headers, db_session):
        resp = client.post("/api/sync/push", json={
            "client_id": "test-client",
            "changes": {
                "daily_records": [{
                    "type": "in",
                    "person_name": "测试",
                    "amount": 50000,
                    "event_type": "wedding",
                    "event_date": "2026-09-20",
                    "source": "daily",
                    "sync_version": 1,
                }],
            },
        }, headers=admin_headers)
        data = resp.json()
        assert len(data["accepted"]) == 0

    async def test_push_unsupported_table(self, client, admin_headers):
        resp = client.post("/api/sync/push", json={
            "client_id": "test-client",
            "changes": {
                "unknown_table": [{
                    "uuid": str(uuid_mod.uuid4()),
                    "sync_version": 1,
                }],
            },
        }, headers=admin_headers)
        assert resp.status_code == 400


class TestSyncStatus:
    async def test_status_empty(self, client, admin_headers):
        resp = client.get("/api/sync/status", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["daily_records"] == 0
        assert data["gb_records"] == 0
        assert data["persons"] == 0

    async def test_status_after_create(self, client, admin_headers, db_session):
        _create_daily_record(client, admin_headers)

        resp = client.get("/api/sync/status", headers=admin_headers)
        data = resp.json()
        assert data["daily_records"] > 0


class TestSyncDataIsolation:
    async def test_pull_isolation(self, client, admin_headers, another_user_headers, db_session):
        _create_daily_record(client, admin_headers, person_name="张三")

        resp = client.post("/api/sync/pull", json={
            "client_id": "test-client",
            "tables": {"daily_records": {"since_version": 0}},
        }, headers=another_user_headers)
        data = resp.json()
        assert data["changes"]["daily_records"]["created"] == []

    async def test_push_isolation(self, client, admin_headers, another_user_headers, db_session):
        record_resp = _create_daily_record(client, admin_headers, person_name="张三")
        record_id = record_resp.json()["id"]

        pull_resp = client.post("/api/sync/pull", json={
            "client_id": "test-client",
            "tables": {"daily_records": {"since_version": 0}},
        }, headers=admin_headers)
        records = pull_resp.json()["changes"]["daily_records"]["created"]
        record = next(r for r in records if r["id"] == record_id)

        resp = client.post("/api/sync/push", json={
            "client_id": "test-client",
            "changes": {
                "daily_records": [{
                    **record,
                    "person_name": "被篡改",
                    "sync_version": record["sync_version"] + 1,
                }],
            },
        }, headers=another_user_headers)
        data = resp.json()
        assert len(data["accepted"]) == 0

    async def test_status_isolation(self, client, admin_headers, another_user_headers, db_session):
        _create_daily_record(client, admin_headers)

        resp = client.get("/api/sync/status", headers=another_user_headers)
        data = resp.json()
        assert data["daily_records"] == 0
