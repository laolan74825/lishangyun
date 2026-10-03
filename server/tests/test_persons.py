from sqlalchemy import select

from app.models.operation_log import OperationLog


class TestPersonCRUD:
    async def test_create_person(self, client, admin_headers, db_session):
        resp = client.post("/api/persons/", json={
            "name": "张三",
            "nickname": "小张",
            "phone": "13800138000",
            "relationship_tag": "friend",
        }, headers=admin_headers)
        assert resp.status_code == 200
        person_id = resp.json()
        assert isinstance(person_id, int)
        assert person_id > 0

    async def test_create_person_minimal(self, client, admin_headers, db_session):
        resp = client.post("/api/persons/", json={"name": "李四"}, headers=admin_headers)
        assert resp.status_code == 200

    async def test_create_person_custom_relation_tag(self, client, admin_headers, db_session):
        """自定义关系类别：直接以中文文本存储，读取原样返回"""
        resp = client.post("/api/persons/", json={
            "name": "王五",
            "relationship_tag": "发小",
        }, headers=admin_headers)
        assert resp.status_code == 200
        person_id = resp.json()

        detail = client.get(f"/api/persons/{person_id}", headers=admin_headers)
        assert detail.status_code == 200
        assert detail.json()["relationship_tag"] == "发小"

    async def test_update_person_custom_relation_tag(self, client, admin_headers, db_session):
        person_id = client.post("/api/persons/", json={
            "name": "王五", "relationship_tag": "friend",
        }, headers=admin_headers).json()

        resp = client.put(f"/api/persons/{person_id}", json={
            "relationship_tag": "牌友",
        }, headers=admin_headers)
        assert resp.status_code == 200

        detail = client.get(f"/api/persons/{person_id}", headers=admin_headers)
        assert detail.json()["relationship_tag"] == "牌友"

    async def test_relation_tag_too_long_rejected(self, client, admin_headers, db_session):
        resp = client.post("/api/persons/", json={
            "name": "王五",
            "relationship_tag": "很" * 21,
        }, headers=admin_headers)
        assert resp.status_code == 422

    async def test_list_persons(self, client, admin_headers, db_session):
        client.post("/api/persons/", json={"name": "张三"}, headers=admin_headers)
        client.post("/api/persons/", json={"name": "李四"}, headers=admin_headers)

        resp = client.get("/api/persons/", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pagination"]["total_count"] == 2
        assert len(data["items"]) == 2

    async def test_list_persons_pagination(self, client, admin_headers, db_session):
        for i in range(5):
            client.post("/api/persons/", json={"name": f"人员{i}"}, headers=admin_headers)

        resp = client.get("/api/persons/?page=1&page_size=2", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 2
        assert data["pagination"]["total_count"] == 5
        assert data["pagination"]["total_pages"] == 3

    async def test_get_person(self, client, admin_headers, db_session):
        resp_create = client.post("/api/persons/", json={"name": "张三"}, headers=admin_headers)
        person_id = resp_create.json()

        resp = client.get(f"/api/persons/{person_id}", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "张三"

    async def test_get_person_not_found(self, client, admin_headers):
        resp = client.get("/api/persons/9999", headers=admin_headers)
        assert resp.status_code == 404

    async def test_update_person(self, client, admin_headers, db_session):
        resp_create = client.post("/api/persons/", json={"name": "张三"}, headers=admin_headers)
        person_id = resp_create.json()

        resp = client.put(f"/api/persons/{person_id}", json={
            "name": "张三丰",
            "phone": "13900139000",
        }, headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/persons/{person_id}", headers=admin_headers)
        assert resp_get.json()["name"] == "张三丰"
        assert resp_get.json()["phone"] == "13900139000"

    async def test_delete_person_soft(self, client, admin_headers, db_session):
        resp_create = client.post("/api/persons/", json={"name": "张三"}, headers=admin_headers)
        person_id = resp_create.json()

        resp = client.delete(f"/api/persons/{person_id}", headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/persons/{person_id}", headers=admin_headers)
        assert resp_get.status_code == 404

        resp_list = client.get("/api/persons/", headers=admin_headers)
        assert resp_list.json()["pagination"]["total_count"] == 0


class TestPersonSearch:
    async def test_search_by_name(self, client, admin_headers, db_session):
        client.post("/api/persons/", json={"name": "张三"}, headers=admin_headers)
        client.post("/api/persons/", json={"name": "李四"}, headers=admin_headers)

        resp = client.get("/api/persons/search?q=张", headers=admin_headers)
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) == 1
        assert results[0]["name"] == "张三"

    async def test_search_by_phone(self, client, admin_headers, db_session):
        client.post("/api/persons/", json={"name": "张三", "phone": "13800138000"}, headers=admin_headers)

        resp = client.get("/api/persons/search?q=138", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_search_no_results(self, client, admin_headers, db_session):
        resp = client.get("/api/persons/search?q=不存在", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 0


class TestPersonSummary:
    async def test_summary_empty(self, client, admin_headers, db_session):
        resp_create = client.post("/api/persons/", json={"name": "张三"}, headers=admin_headers)
        person_id = resp_create.json()

        resp = client.get(f"/api/persons/{person_id}/summary", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_in"] == 0
        assert data["total_out"] == 0
        assert data["net"] == 0
        assert data["daily_records"] == []
        assert data["gb_records"] == []

    async def test_summary_includes_daily_and_gb_records(self, client, admin_headers, db_session):
        """来往明细：summary 返回日常往来与礼簿收礼明细，礼簿记录附礼簿名称/事由"""
        resp_create = client.post("/api/persons/", json={"name": "张三"}, headers=admin_headers)
        person_id = resp_create.json()

        # 礼簿 + 礼簿收礼记录（关联该人员）
        resp_gb = client.post("/api/guestbooks/", json={
            "name": "张三家婚宴",
            "event_type": "wedding",
            "event_date": "2026-10-01",
        }, headers=admin_headers)
        gb_id = resp_gb.json()["id"]
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
            "person_id": person_id,
        }, headers=admin_headers)

        # 日常往来记录（送出去）
        client.post("/api/daily-records/", json={
            "type": "out",
            "person_id": person_id,
            "person_name": "张三",
            "amount": 20000,
            "event_type": "婚礼",
            "event_date": "2026-09-01",
        }, headers=admin_headers)

        resp = client.get(f"/api/persons/{person_id}/summary", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_in"] == 50000
        assert data["total_out"] == 20000

        assert len(data["daily_records"]) == 1
        assert data["daily_records"][0]["event_type"] == "婚礼"

        assert len(data["gb_records"]) == 1
        gb = data["gb_records"][0]
        assert gb["guestbook_id"] == gb_id
        assert gb["guestbook_name"] == "张三家婚宴"
        assert gb["guestbook_event_type"] == "wedding"
        assert gb["amount"] == 50000


class TestBackfillLinks:
    async def test_backfill_links_records(self, client, admin_headers, db_session):
        """补关联维护：未关联的礼簿/日常记录按姓名匹配回填 person_id，已关联的不受影响"""
        resp_create = client.post("/api/persons/", json={"name": "王五"}, headers=admin_headers)
        person_id = resp_create.json()

        resp_gb = client.post("/api/guestbooks/", json={
            "name": "测试宴",
            "event_type": "wedding",
            "event_date": "2026-10-01",
        }, headers=admin_headers)
        gb_id = resp_gb.json()["id"]
        # 一条未关联（guest_name 可匹配王五），一条同名多人场景外的不匹配记录
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "王五",
            "amount": 10000,
            "payment_method": "cash",
        }, headers=admin_headers)
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "不存在的人",
            "amount": 20000,
            "payment_method": "cash",
        }, headers=admin_headers)
        # 日常记录：一条可匹配，一条无匹配
        client.post("/api/daily-records/", json={
            "type": "out",
            "person_name": "王五",
            "amount": 30000,
            "event_type": "婚礼",
            "event_date": "2026-09-01",
        }, headers=admin_headers)
        client.post("/api/daily-records/", json={
            "type": "out",
            "person_name": "路人甲",
            "amount": 40000,
            "event_type": "婚礼",
            "event_date": "2026-09-01",
        }, headers=admin_headers)

        resp = client.post("/api/persons/backfill-links", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["gb_linked"] == 1
        assert data["gb_unmatched"] == 1
        assert data["daily_linked"] == 1
        assert data["daily_unmatched"] == 1

        # 幂等：再次执行全部已关联，无新增
        resp2 = client.post("/api/persons/backfill-links", headers=admin_headers)
        assert resp2.json()["gb_linked"] == 0
        assert resp2.json()["daily_linked"] == 0

        # 王五的来往明细应能看到刚关联的两条
        resp3 = client.get(f"/api/persons/{person_id}/summary", headers=admin_headers)
        summary = resp3.json()
        assert len(summary["gb_records"]) == 1
        assert len(summary["daily_records"]) == 1


class TestPersonAuditLog:
    async def test_create_writes_audit_log(self, client, admin_headers, db_session):
        resp = client.post("/api/persons/", json={"name": "张三"}, headers=admin_headers)
        person_id = resp.json()

        result = await db_session.execute(
            select(OperationLog).where(
                OperationLog.target_table == "persons",
                OperationLog.target_id == person_id,
                OperationLog.action_type == "CREATE",
            )
        )
        logs = result.scalars().all()
        assert len(logs) == 1

    async def test_delete_writes_audit_log(self, client, admin_headers, db_session):
        resp = client.post("/api/persons/", json={"name": "张三"}, headers=admin_headers)
        person_id = resp.json()

        client.delete(f"/api/persons/{person_id}", headers=admin_headers)

        result = await db_session.execute(
            select(OperationLog).where(
                OperationLog.target_table == "persons",
                OperationLog.target_id == person_id,
                OperationLog.action_type == "DELETE",
            )
        )
        logs = result.scalars().all()
        assert len(logs) == 1


class TestDataIsolation:
    async def test_user_cannot_see_other_users_persons(self, client, admin_headers, user_headers, db_session):
        client.post("/api/persons/", json={"name": "管理员的人"}, headers=admin_headers)

        resp = client.get("/api/persons/", headers=user_headers)
        assert resp.status_code == 200
        assert resp.json()["pagination"]["total_count"] == 0

    async def test_user_cannot_access_other_users_person(self, client, admin_headers, user_headers, db_session):
        resp = client.post("/api/persons/", json={"name": "管理员的人"}, headers=admin_headers)
        person_id = resp.json()

        resp = client.get(f"/api/persons/{person_id}", headers=user_headers)
        assert resp.status_code == 404


class TestRolePermissions:
    async def test_collaborator_can_create(self, client, collab_headers, db_session):
        resp = client.post("/api/persons/", json={"name": "张三"}, headers=collab_headers)
        assert resp.status_code == 200

    async def test_collaborator_cannot_delete(self, client, collab_headers, db_session):
        resp = client.post("/api/persons/", json={"name": "张三"}, headers=collab_headers)
        person_id = resp.json()

        resp = client.delete(f"/api/persons/{person_id}", headers=collab_headers)
        assert resp.status_code == 403
