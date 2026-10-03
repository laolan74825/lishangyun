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

    async def test_reopen_guestbook(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        client.post(f"/api/guestbooks/{gb_id}/close", headers=admin_headers)

        resp = client.post(f"/api/guestbooks/{gb_id}/reopen", headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/guestbooks/{gb_id}", headers=admin_headers)
        assert resp_get.json()["status"] == "active"
        assert resp_get.json()["closing_at"] is None

    async def test_reopen_active_fails(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        resp = client.post(f"/api/guestbooks/{gb_id}/reopen", headers=admin_headers)
        assert resp.status_code == 400

    async def test_close_with_unchecked_records_fails(
        self, client, admin_headers, super_admin, db_session
    ):
        from app.models.gb_record import GbRecord

        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        db_session.add(GbRecord(
            uuid="11111111-1111-1111-1111-111111111111",
            owner_id=super_admin.id, guestbook_id=gb_id,
            guest_name="宾客甲", amount=20000, payment_method="cash",
            check_status="unchecked",
        ))
        await db_session.commit()

        resp = client.post(f"/api/guestbooks/{gb_id}/close", headers=admin_headers)
        assert resp.status_code == 400
        assert "未对账" in resp.json()["detail"]

        resp_get = client.get(f"/api/guestbooks/{gb_id}", headers=admin_headers)
        assert resp_get.json()["status"] == "active"

    async def test_close_with_summary_saves_it(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        resp = client.post(
            f"/api/guestbooks/{gb_id}/close",
            json={"summary": "  宴席顺利，现金已交接。  "},
            headers=admin_headers,
        )
        assert resp.status_code == 200

        resp_get = client.get(f"/api/guestbooks/{gb_id}", headers=admin_headers)
        assert resp_get.json()["status"] == "closing"
        assert resp_get.json()["closing_summary"] == "宴席顺利，现金已交接。"

    async def test_close_without_summary(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        resp = client.post(f"/api/guestbooks/{gb_id}/close", headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/guestbooks/{gb_id}", headers=admin_headers)
        assert resp_get.json()["closing_summary"] is None

    async def test_close_revokes_pending_and_accepted_invites(
        self, client, admin_headers, super_admin, normal_user, another_user, db_session
    ):
        from app.models.collaboration_invite import CollaborationInvite
        from app.core.time import utcnow
        from datetime import timedelta

        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        now = utcnow()
        db_session.add_all([
            CollaborationInvite(
                inviter_id=super_admin.id, invitee_id=normal_user.id, guestbook_id=gb_id,
                invite_code="AAAAAA", permissions="record", status="pending",
                signal_expires_at=now + timedelta(minutes=10),
                collaboration_start_at=now - timedelta(minutes=1),
                collaboration_end_at=now + timedelta(hours=1),
            ),
            CollaborationInvite(
                inviter_id=super_admin.id, invitee_id=another_user.id, guestbook_id=gb_id,
                invite_code="BBBBBB", permissions="both", status="accepted",
                signal_expires_at=now + timedelta(minutes=10),
                collaboration_start_at=now - timedelta(minutes=1),
                collaboration_end_at=now + timedelta(hours=1),
                accepted_at=now,
            ),
        ])
        await db_session.commit()

        resp = client.post(f"/api/guestbooks/{gb_id}/close", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["revoked_invites"] == 2

        result = await db_session.execute(
            select(CollaborationInvite).where(CollaborationInvite.guestbook_id == gb_id)
        )
        invites = result.scalars().all()
        assert len(invites) == 2
        assert all(i.status == "revoked" for i in invites)

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

    async def test_unarchive_guestbook(self, client, admin_headers, db_session):
        """已归档的礼簿可以恢复为收尾中，归档时间清空"""
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        client.post(f"/api/guestbooks/{gb_id}/archive", headers=admin_headers)

        resp = client.post(f"/api/guestbooks/{gb_id}/unarchive", headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/guestbooks/{gb_id}", headers=admin_headers)
        data = resp_get.json()
        assert data["status"] == "closing"
        assert data["archived_at"] is None

    async def test_unarchive_non_archived_fails(self, client, admin_headers, db_session):
        """非已归档状态的礼簿不能恢复"""
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        resp = client.post(f"/api/guestbooks/{gb_id}/unarchive", headers=admin_headers)
        assert resp.status_code == 400

        # 收尾中也不能直接恢复
        client.post(f"/api/guestbooks/{gb_id}/close", headers=admin_headers)
        resp = client.post(f"/api/guestbooks/{gb_id}/unarchive", headers=admin_headers)
        assert resp.status_code == 400


def _create_person(client, headers, name, phone=None):
    payload = {"name": name}
    if phone:
        payload["phone"] = phone
    return client.post("/api/persons/", json=payload, headers=headers).json()


class TestMergePersons:
    """礼簿合并到人员库：建立 person_id 关联并标记已合并"""

    async def _setup_closing_gb_with_record(self, client, headers, guest_name="张三"):
        gb_id = _create_guestbook(client, headers).json()["id"]
        client.post(f"/api/guestbooks/{gb_id}/close", headers=headers)
        # 收尾中补录的记录自动为已对账状态
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": guest_name,
            "amount": 50000,
            "payment_method": "cash",
        }, headers=headers)
        return gb_id

    async def test_merge_links_records_and_marks_guestbook(self, client, admin_headers, db_session):
        gb_id = await self._setup_closing_gb_with_record(client, admin_headers)
        person_id = _create_person(client, admin_headers, "张三")

        resp = client.post(f"/api/guestbooks/{gb_id}/merge-persons", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["linked"] == 1
        assert data["unmatched"] == 0
        assert data["already_linked"] == 0

        # 礼簿已标记合并时间
        resp_gb = client.get(f"/api/guestbooks/{gb_id}", headers=admin_headers)
        assert resp_gb.json()["person_merged_at"] is not None

        # 记录已建立人员关联
        resp_records = client.get(f"/api/guestbooks/{gb_id}/records", headers=admin_headers)
        assert resp_records.json()["items"][0]["person_id"] == person_id

    async def test_merge_unmatched_record(self, client, admin_headers, db_session):
        """人员库中不存在的宾客无法匹配"""
        gb_id = await self._setup_closing_gb_with_record(client, admin_headers, guest_name="不存在的人")

        resp = client.post(f"/api/guestbooks/{gb_id}/merge-persons", headers=admin_headers)
        assert resp.json()["linked"] == 0
        assert resp.json()["unmatched"] == 1

    async def test_merge_active_guestbook_fails(self, client, admin_headers, db_session):
        """收礼中的礼簿暂不能合并"""
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        resp = client.post(f"/api/guestbooks/{gb_id}/merge-persons", headers=admin_headers)
        assert resp.status_code == 400

    async def test_merge_is_idempotent(self, client, admin_headers, db_session):
        """重复合并不会重复计数，已关联记录跳过"""
        gb_id = await self._setup_closing_gb_with_record(client, admin_headers)
        _create_person(client, admin_headers, "张三")

        client.post(f"/api/guestbooks/{gb_id}/merge-persons", headers=admin_headers)
        resp = client.post(f"/api/guestbooks/{gb_id}/merge-persons", headers=admin_headers)
        data = resp.json()
        assert data["linked"] == 0
        assert data["already_linked"] == 1


class TestMergeCreatePersons:
    """合并向导「按礼簿数据新建人员」：勾选无法匹配的记录确认后新建人员并关联"""

    async def _setup_closing_gb_with_record(self, client, headers, guest_name="王五", phone=None):
        gb_id = _create_guestbook(client, headers).json()["id"]
        client.post(f"/api/guestbooks/{gb_id}/close", headers=headers)
        payload = {
            "guest_name": guest_name,
            "amount": 50000,
            "payment_method": "cash",
        }
        if phone:
            payload["phone"] = phone
        client.post(f"/api/guestbooks/{gb_id}/records", json=payload, headers=headers)
        return gb_id

    async def _get_record_id(self, client, headers, gb_id):
        resp = client.get(f"/api/guestbooks/{gb_id}/records", headers=headers)
        return resp.json()["items"][0]["id"]

    async def test_create_persons_links_records(self, client, admin_headers, db_session):
        """勾选记录后新建人员（含电话）并自动关联"""
        gb_id = await self._setup_closing_gb_with_record(client, admin_headers, guest_name="王五", phone="13800000001")
        record_id = await self._get_record_id(client, admin_headers, gb_id)

        resp = client.post(
            f"/api/guestbooks/{gb_id}/merge-persons/create-persons",
            json={"record_ids": [record_id]},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 1
        assert data["linked_existing"] == 0
        assert data["skipped"] == 0

        # 记录已关联到新人员
        resp_records = client.get(f"/api/guestbooks/{gb_id}/records", headers=admin_headers)
        person_id = resp_records.json()["items"][0]["person_id"]
        assert person_id is not None

        # 新人员姓名/电话来自礼簿数据
        resp_person = client.get(f"/api/persons/{person_id}", headers=admin_headers)
        assert resp_person.json()["name"] == "王五"
        assert resp_person.json()["phone"] == "13800000001"

        # 礼簿已标记合并时间
        resp_gb = client.get(f"/api/guestbooks/{gb_id}", headers=admin_headers)
        assert resp_gb.json()["person_merged_at"] is not None

    async def test_create_persons_is_idempotent(self, client, admin_headers, db_session):
        """重复执行不重复建人：已关联记录跳过"""
        gb_id = await self._setup_closing_gb_with_record(client, admin_headers, guest_name="王五")
        record_id = await self._get_record_id(client, admin_headers, gb_id)

        client.post(f"/api/guestbooks/{gb_id}/merge-persons/create-persons",
                    json={"record_ids": [record_id]}, headers=admin_headers)
        resp = client.post(f"/api/guestbooks/{gb_id}/merge-persons/create-persons",
                           json={"record_ids": [record_id]}, headers=admin_headers)
        data = resp.json()
        assert data["created"] == 0
        assert data["linked_existing"] == 0
        assert data["skipped"] == 1

    async def test_create_persons_links_existing_match(self, client, admin_headers, db_session):
        """勾选时人员已被他人创建（已可匹配）则直接关联，不重复建人"""
        gb_id = await self._setup_closing_gb_with_record(client, admin_headers, guest_name="王五")
        record_id = await self._get_record_id(client, admin_headers, gb_id)
        existing_id = _create_person(client, admin_headers, "王五")

        resp = client.post(f"/api/guestbooks/{gb_id}/merge-persons/create-persons",
                           json={"record_ids": [record_id]}, headers=admin_headers)
        data = resp.json()
        assert data["created"] == 0
        assert data["linked_existing"] == 1

        resp_records = client.get(f"/api/guestbooks/{gb_id}/records", headers=admin_headers)
        assert resp_records.json()["items"][0]["person_id"] == existing_id

    async def test_create_persons_active_guestbook_fails(self, client, admin_headers, db_session):
        """收礼中的礼簿禁止新建人员"""
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "王五",
            "amount": 50000,
            "payment_method": "cash",
        }, headers=admin_headers)
        record_id = await self._get_record_id(client, admin_headers, gb_id)

        resp = client.post(f"/api/guestbooks/{gb_id}/merge-persons/create-persons",
                           json={"record_ids": [record_id]}, headers=admin_headers)
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
