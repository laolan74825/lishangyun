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
