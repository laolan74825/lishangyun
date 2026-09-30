import json
from datetime import timedelta

from app.core.time import utcnow
from app.models.family_group import FamilyGroup
from app.models.notification import Notification
from app.models.pending_approval import PendingApproval
from sqlalchemy import select


def _create_group(client, headers, name="张家"):
    return client.post("/api/family/groups", json={
        "name": name, "description": "测试家庭组",
    }, headers=headers)


def _join_group(client, headers, invite_code):
    return client.post("/api/family/join", json={
        "invite_code": invite_code,
    }, headers=headers)


def _setup_group_with_member(client, admin_headers, user_headers):
    group_data = _create_group(client, admin_headers).json()
    _join_group(client, user_headers, group_data["invite_code"])
    return group_data


class TestSubmitApproval:
    async def test_submit_approval_as_member(self, client, admin_headers, user_headers, db_session):
        group_data = _setup_group_with_member(client, admin_headers, user_headers)

        resp = client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "CREATE",
            "target_table": "person",
            "data_snapshot": {"target_table": "person", "data": {"name": "测试人员"}},
        }, headers=user_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] is not None
        assert data["message"] == "审批请求已提交"

    async def test_owner_cannot_submit_approval(self, client, admin_headers, db_session):
        group_data = _create_group(client, admin_headers).json()

        resp = client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "CREATE",
            "target_table": "person",
        }, headers=admin_headers)
        assert resp.status_code == 400
        assert "主账户" in resp.json()["detail"]

    async def test_missing_fields_returns_422(self, client, user_headers):
        resp = client.post("/api/approvals/", json={
            "family_group_id": 1,
        }, headers=user_headers)
        assert resp.status_code == 422

    async def test_invalid_action_type_returns_422(self, client, admin_headers, user_headers, db_session):
        group_data = _setup_group_with_member(client, admin_headers, user_headers)

        resp = client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "INVALID",
            "target_table": "person",
        }, headers=user_headers)
        assert resp.status_code == 422

    async def test_non_member_cannot_submit(self, client, admin_headers, user_headers, db_session):
        group_data = _create_group(client, admin_headers).json()

        resp = client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "CREATE",
            "target_table": "person",
        }, headers=user_headers)
        assert resp.status_code == 403

    async def test_submit_creates_notification_for_owner(self, client, admin_headers, user_headers, db_session):
        group_data = _setup_group_with_member(client, admin_headers, user_headers)

        client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "CREATE",
            "target_table": "person",
            "data_snapshot": {"target_table": "person", "data": {"name": "测试"}},
        }, headers=user_headers)

        result = await db_session.execute(
            select(Notification).where(
                Notification.type == "approval_submitted",
            )
        )
        notifications = result.scalars().all()
        assert len(notifications) >= 1


class TestListApprovals:
    async def test_list_approvals_as_owner(self, client, admin_headers, user_headers, db_session):
        group_data = _setup_group_with_member(client, admin_headers, user_headers)

        client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "CREATE",
            "target_table": "person",
            "data_snapshot": {"target_table": "person", "data": {"name": "测试"}},
        }, headers=user_headers)

        resp = client.get(f"/api/approvals/?group_id={group_data['id']}", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["action_type"] == "CREATE"
        assert data[0]["status"] == "pending"

    async def test_list_approvals_with_status_filter(self, client, admin_headers, user_headers, db_session):
        group_data = _setup_group_with_member(client, admin_headers, user_headers)

        client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "CREATE",
            "target_table": "person",
            "data_snapshot": {"target_table": "person", "data": {"name": "测试"}},
        }, headers=user_headers)

        resp = client.get(f"/api/approvals/?group_id={group_data['id']}&status=pending", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

        resp_rejected = client.get(f"/api/approvals/?group_id={group_data['id']}&status=rejected", headers=admin_headers)
        assert resp_rejected.status_code == 200
        assert len(resp_rejected.json()) == 0

    async def test_member_can_see_own_group_approvals(self, client, admin_headers, user_headers, db_session):
        group_data = _setup_group_with_member(client, admin_headers, user_headers)

        client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "CREATE",
            "target_table": "person",
            "data_snapshot": {"target_table": "person", "data": {"name": "测试"}},
        }, headers=user_headers)

        resp = client.get(f"/api/approvals/?group_id={group_data['id']}", headers=user_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_no_groups_returns_empty(self, client, collab_headers, db_session):
        resp = client.get("/api/approvals/", headers=collab_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_cannot_access_other_group_approvals(self, client, admin_headers, user_headers, collab_headers, db_session):
        group_data = _setup_group_with_member(client, admin_headers, user_headers)

        resp = client.get(f"/api/approvals/?group_id={group_data['id']}", headers=collab_headers)
        assert resp.status_code == 200
        assert resp.json() == []


class TestGetApproval:
    async def test_get_single_approval(self, client, admin_headers, user_headers, db_session):
        group_data = _setup_group_with_member(client, admin_headers, user_headers)

        submit_resp = client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "CREATE",
            "target_table": "person",
            "data_snapshot": {"target_table": "person", "data": {"name": "测试"}},
        }, headers=user_headers)
        approval_id = submit_resp.json()["id"]

        resp = client.get(f"/api/approvals/{approval_id}", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == approval_id
        assert data["submitter_name"] is not None

    async def test_get_nonexistent_approval(self, client, admin_headers):
        resp = client.get("/api/approvals/99999", headers=admin_headers)
        assert resp.status_code == 404


class TestReviewApproval:
    async def test_approve_create(self, client, admin_headers, user_headers, db_session):
        group_data = _setup_group_with_member(client, admin_headers, user_headers)

        submit_resp = client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "CREATE",
            "target_table": "person",
            "data_snapshot": {"target_table": "person", "data": {"name": "审批创建的人员"}},
        }, headers=user_headers)
        approval_id = submit_resp.json()["id"]

        resp = client.put(f"/api/approvals/{approval_id}/review", json={
            "approved": True, "note": "同意",
        }, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["message"] == "已通过"

        get_resp = client.get(f"/api/approvals/{approval_id}", headers=admin_headers)
        assert get_resp.json()["status"] == "approved"

    async def test_reject_approval(self, client, admin_headers, user_headers, db_session):
        group_data = _setup_group_with_member(client, admin_headers, user_headers)

        submit_resp = client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "CREATE",
            "target_table": "person",
            "data_snapshot": {"target_table": "person", "data": {"name": "测试"}},
        }, headers=user_headers)
        approval_id = submit_resp.json()["id"]

        resp = client.put(f"/api/approvals/{approval_id}/review", json={
            "approved": False, "note": "信息不完整",
        }, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["message"] == "已拒绝"

        get_resp = client.get(f"/api/approvals/{approval_id}", headers=admin_headers)
        data = get_resp.json()
        assert data["status"] == "rejected"
        assert data["review_note"] == "信息不完整"

    async def test_member_cannot_review(self, client, admin_headers, user_headers, db_session):
        group_data = _setup_group_with_member(client, admin_headers, user_headers)

        submit_resp = client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "CREATE",
            "target_table": "person",
            "data_snapshot": {"target_table": "person", "data": {"name": "测试"}},
        }, headers=user_headers)
        approval_id = submit_resp.json()["id"]

        resp = client.put(f"/api/approvals/{approval_id}/review", json={
            "approved": True,
        }, headers=user_headers)
        assert resp.status_code == 403

    async def test_cannot_review_already_reviewed(self, client, admin_headers, user_headers, db_session):
        group_data = _setup_group_with_member(client, admin_headers, user_headers)

        submit_resp = client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "CREATE",
            "target_table": "person",
            "data_snapshot": {"target_table": "person", "data": {"name": "测试"}},
        }, headers=user_headers)
        approval_id = submit_resp.json()["id"]

        client.put(f"/api/approvals/{approval_id}/review", json={
            "approved": True,
        }, headers=admin_headers)

        resp = client.put(f"/api/approvals/{approval_id}/review", json={
            "approved": False,
        }, headers=admin_headers)
        assert resp.status_code == 400

    async def test_review_nonexistent_approval(self, client, admin_headers):
        resp = client.put("/api/approvals/99999/review", json={
            "approved": True,
        }, headers=admin_headers)
        assert resp.status_code == 404

    async def test_approve_creates_notification(self, client, admin_headers, user_headers, db_session):
        group_data = _setup_group_with_member(client, admin_headers, user_headers)

        submit_resp = client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "CREATE",
            "target_table": "person",
            "data_snapshot": {"target_table": "person", "data": {"name": "测试"}},
        }, headers=user_headers)
        approval_id = submit_resp.json()["id"]

        client.put(f"/api/approvals/{approval_id}/review", json={
            "approved": True,
        }, headers=admin_headers)

        result = await db_session.execute(
            select(Notification).where(
                Notification.type == "approval_approved",
                Notification.related_id == approval_id,
            )
        )
        assert result.scalar_one_or_none() is not None


class TestExpireApprovals:
    async def test_expire_overdue_approvals(self, client, admin_headers, user_headers, db_session):
        group_data = _setup_group_with_member(client, admin_headers, user_headers)

        submit_resp = client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "CREATE",
            "target_table": "person",
            "data_snapshot": {"target_table": "person", "data": {"name": "测试"}},
        }, headers=user_headers)
        approval_id = submit_resp.json()["id"]

        result = await db_session.execute(
            select(PendingApproval).where(PendingApproval.id == approval_id)
        )
        approval = result.scalar_one()
        approval.expires_at = utcnow() - timedelta(days=1)
        await db_session.commit()

        resp = client.post("/api/approvals/expire", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["expired_count"] >= 1

        get_resp = client.get(f"/api/approvals/{approval_id}", headers=admin_headers)
        assert get_resp.json()["status"] == "expired"

    async def test_expire_does_not_affect_pending(self, client, admin_headers, user_headers, db_session):
        group_data = _setup_group_with_member(client, admin_headers, user_headers)

        submit_resp = client.post("/api/approvals/", json={
            "family_group_id": group_data["id"],
            "action_type": "CREATE",
            "target_table": "person",
            "data_snapshot": {"target_table": "person", "data": {"name": "测试"}},
        }, headers=user_headers)
        approval_id = submit_resp.json()["id"]

        resp = client.post("/api/approvals/expire", headers=admin_headers)
        assert resp.status_code == 200

        get_resp = client.get(f"/api/approvals/{approval_id}", headers=admin_headers)
        assert get_resp.json()["status"] == "pending"
