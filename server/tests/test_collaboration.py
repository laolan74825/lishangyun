"""协作邀请全流程 + 统一访问依赖权限矩阵测试。

对应 docs/协作邀请功能方案.md 第 3、4 节。
"""
from datetime import timedelta

import pytest

from app.core.security import create_access_token, hash_password
from app.core.time import utcnow
from app.models.collaboration_invite import CollaborationInvite
from app.models.family_group import FamilyGroup
from app.models.family_member import FamilyMember
from app.models.gb_record import GbRecord
from app.models.user import User


def _auth_headers(u: User) -> dict[str, str]:
    token = create_access_token({"sub": str(u.id), "role": u.role})
    return {"Authorization": f"Bearer {token}"}


async def _make_user(db_session, username: str) -> User:
    u = User(username=username, password_hash=hash_password("password123"),
             role="user", nickname=username, email=f"{username}@test.com")
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


def _create_guestbook(client, headers, name="婚礼礼金"):
    resp = client.post("/api/guestbooks/", headers=headers, json={
        "name": name, "event_type": "wedding", "event_date": "2026-10-01",
    })
    assert resp.status_code == 200
    return resp.json()["id"]


def _invite_payload(gb_id, keyword="user2@test.com", permissions="record",
                    start=None, end=None):
    now = utcnow()
    return {
        "invitee_keyword": keyword,
        "guestbook_id": gb_id,
        "permissions": permissions,
        "collaboration_start_at": (start or now + timedelta(hours=1)).isoformat(),
        "collaboration_end_at": (end or now + timedelta(days=7)).isoformat(),
    }


def _send_invite(client, user_headers, gb_id, **kwargs):
    resp = client.post("/api/collaboration/invites", headers=user_headers,
                       json=_invite_payload(gb_id, **kwargs))
    assert resp.status_code == 200
    return resp.json()


@pytest.fixture()
def guestbook_id(client, user_headers):
    return _create_guestbook(client, user_headers)


@pytest.fixture()
def collab_factory(db_session, normal_user, guestbook_id):
    """直接向数据库写入已接受的协作邀请，便于构造权限矩阵场景。"""
    async def _make(invitee, permissions="record", start_offset=timedelta(hours=-1),
                    end_offset=timedelta(days=7)):
        now = utcnow()
        invite = CollaborationInvite(
            inviter_id=normal_user.id,
            invitee_id=invitee.id,
            guestbook_id=guestbook_id,
            invite_code="385721",
            permissions=permissions,
            status="accepted",
            signal_expires_at=now + timedelta(minutes=10),
            collaboration_start_at=now + start_offset,
            collaboration_end_at=now + end_offset,
            accepted_at=now,
        )
        db_session.add(invite)
        await db_session.commit()
        return invite
    return _make


@pytest.fixture()
async def sample_record(db_session, normal_user, guestbook_id):
    record = GbRecord(
        uuid="test-uuid-0001",
        owner_id=normal_user.id,
        guestbook_id=guestbook_id,
        guest_name="张三",
        amount=50000,
        payment_method="cash",
        check_status="unchecked",
    )
    db_session.add(record)
    await db_session.commit()
    return record


# ------------------------- 账户查找 -------------------------

class TestSearchUser:
    async def test_search_by_email(self, client, user_headers, another_user):
        resp = client.get("/api/collaboration/search?keyword=user2@test.com",
                          headers=user_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == another_user.id

    async def test_search_by_username(self, client, user_headers, another_user):
        resp = client.get("/api/collaboration/search?keyword=USER2", headers=user_headers)
        assert resp.status_code == 200
        assert resp.json()["username"] == "user2"

    async def test_search_not_found_hidden(self, client, user_headers):
        resp = client.get("/api/collaboration/search?keyword=nobody@test.com",
                          headers=user_headers)
        assert resp.status_code == 404

    async def test_search_self_excluded(self, client, user_headers):
        resp = client.get("/api/collaboration/search?keyword=user1@test.com",
                          headers=user_headers)
        assert resp.status_code == 404


# ------------------------- 发送邀请 -------------------------

class TestCreateInvite:
    async def test_create_success(self, client, user_headers, guestbook_id, another_user):
        data = _send_invite(client, user_headers, guestbook_id)
        assert len(data["invite_code"]) == 6
        assert data["invite_code"].isdigit()
        assert data["invitee_email"] == another_user.email

    async def test_duplicate_pending_rejected(self, client, user_headers, guestbook_id,
                                              another_user):
        _send_invite(client, user_headers, guestbook_id)
        resp = client.post("/api/collaboration/invites", headers=user_headers,
                           json=_invite_payload(guestbook_id))
        assert resp.status_code == 409

    async def test_duplicate_active_collaboration_rejected(self, client, user_headers,
                                                           guestbook_id, db_session,
                                                           another_user, normal_user):
        now = utcnow()
        db_session.add(CollaborationInvite(
            inviter_id=normal_user.id, invitee_id=another_user.id,
            guestbook_id=guestbook_id, invite_code="111111", permissions="record",
            status="accepted", signal_expires_at=now + timedelta(minutes=10),
            collaboration_start_at=now - timedelta(hours=1),
            collaboration_end_at=now + timedelta(days=7), accepted_at=now,
        ))
        await db_session.commit()
        resp = client.post("/api/collaboration/invites", headers=user_headers,
                           json=_invite_payload(guestbook_id))
        assert resp.status_code == 409

    async def test_end_before_start_rejected(self, client, user_headers, guestbook_id,
                                             another_user):
        now = utcnow()
        resp = client.post("/api/collaboration/invites", headers=user_headers,
                           json=_invite_payload(guestbook_id,
                                                start=now + timedelta(days=2),
                                                end=now + timedelta(days=1)))
        assert resp.status_code == 400

    async def test_start_in_past_rejected(self, client, user_headers, guestbook_id,
                                          another_user):
        now = utcnow()
        resp = client.post("/api/collaboration/invites", headers=user_headers,
                           json=_invite_payload(guestbook_id,
                                                start=now - timedelta(hours=1),
                                                end=now + timedelta(days=1)))
        assert resp.status_code == 400

    async def test_guestbook_not_owned(self, client, another_user_headers, guestbook_id):
        resp = client.post("/api/collaboration/invites", headers=another_user_headers,
                           json=_invite_payload(guestbook_id))
        assert resp.status_code == 404

    async def test_invitee_not_found(self, client, user_headers, guestbook_id):
        resp = client.post("/api/collaboration/invites", headers=user_headers,
                           json=_invite_payload(guestbook_id, keyword="ghost@test.com"))
        assert resp.status_code == 404


# ------------------------- 待处理 / 接受 / 拒绝 -------------------------

class TestPendingAndAccept:
    async def test_pending_list_as_invitee(self, client, user_headers, another_user_headers,
                                           guestbook_id):
        _send_invite(client, user_headers, guestbook_id)
        resp = client.get("/api/collaboration/invites/pending", headers=another_user_headers)
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 1
        assert items[0]["guestbook_id"] == guestbook_id
        assert items[0]["inviter_username"] == "user1"

    async def test_pending_list_empty_for_inviter(self, client, user_headers, guestbook_id,
                                                  another_user):
        _send_invite(client, user_headers, guestbook_id)
        resp = client.get("/api/collaboration/invites/pending", headers=user_headers)
        assert resp.json() == []

    async def test_accept_wrong_code(self, client, user_headers, another_user_headers,
                                     guestbook_id):
        invite = _send_invite(client, user_headers, guestbook_id)
        resp = client.post("/api/collaboration/invites/accept", headers=another_user_headers,
                           json={"invite_id": invite["id"], "invite_code": "000000"})
        assert resp.status_code == 400

    async def test_accept_success(self, client, user_headers, another_user_headers,
                                  guestbook_id):
        invite = _send_invite(client, user_headers, guestbook_id)
        resp = client.post("/api/collaboration/invites/accept", headers=another_user_headers,
                           json={"invite_id": invite["id"],
                                 "invite_code": invite["invite_code"]})
        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "已接受协作邀请"
        assert "collaboration_start_at" in data
        assert "collaboration_end_at" in data

    async def test_accept_by_wrong_user(self, client, user_headers, guestbook_id,
                                        another_user):
        invite = _send_invite(client, user_headers, guestbook_id)
        resp = client.post("/api/collaboration/invites/accept", headers=user_headers,
                           json={"invite_id": invite["id"],
                                 "invite_code": invite["invite_code"]})
        assert resp.status_code == 404

    async def test_accept_twice_rejected(self, client, user_headers, another_user_headers,
                                         guestbook_id):
        invite = _send_invite(client, user_headers, guestbook_id)
        payload = {"invite_id": invite["id"], "invite_code": invite["invite_code"]}
        client.post("/api/collaboration/invites/accept", headers=another_user_headers,
                    json=payload)
        resp = client.post("/api/collaboration/invites/accept", headers=another_user_headers,
                           json=payload)
        assert resp.status_code == 400

    async def test_signal_expiry_lazy_marking(self, client, user_headers, another_user_headers,
                                              guestbook_id, db_session):
        invite = _send_invite(client, user_headers, guestbook_id)
        row = await db_session.get(CollaborationInvite, invite["id"])
        row.signal_expires_at = utcnow() - timedelta(minutes=1)
        await db_session.commit()

        resp = client.get("/api/collaboration/invites/pending", headers=another_user_headers)
        assert resp.json() == []
        resp = client.post("/api/collaboration/invites/accept", headers=another_user_headers,
                           json={"invite_id": invite["id"],
                                 "invite_code": invite["invite_code"]})
        assert resp.status_code == 400

    async def test_reject(self, client, user_headers, another_user_headers, guestbook_id):
        invite = _send_invite(client, user_headers, guestbook_id)
        resp = client.post(f"/api/collaboration/invites/{invite['id']}/reject",
                           headers=another_user_headers)
        assert resp.status_code == 200

        pending = client.get("/api/collaboration/invites/pending", headers=another_user_headers)
        assert pending.json() == []
        logs = client.get(f"/api/collaboration/invites/{invite['id']}/logs",
                          headers=user_headers)
        assert any(l["action_type"] == "REJECT" for l in logs.json())


# ------------------------- 撤销 -------------------------

class TestRevoke:
    async def test_revoke_pending(self, client, user_headers, another_user_headers,
                                  guestbook_id):
        invite = _send_invite(client, user_headers, guestbook_id)
        resp = client.post(f"/api/collaboration/invites/{invite['id']}/revoke",
                           headers=user_headers)
        assert resp.json()["message"] == "邀请已撤销"
        pending = client.get("/api/collaboration/invites/pending", headers=another_user_headers)
        assert pending.json() == []

    async def test_revoke_accepted(self, client, user_headers, another_user_headers,
                                   guestbook_id):
        invite = _send_invite(client, user_headers, guestbook_id)
        client.post("/api/collaboration/invites/accept", headers=another_user_headers,
                    json={"invite_id": invite["id"], "invite_code": invite["invite_code"]})
        resp = client.post(f"/api/collaboration/invites/{invite['id']}/revoke",
                           headers=user_headers)
        assert resp.json()["message"] == "授权已撤销"

    async def test_revoke_by_invitee_forbidden(self, client, user_headers, another_user_headers,
                                               guestbook_id):
        invite = _send_invite(client, user_headers, guestbook_id)
        resp = client.post(f"/api/collaboration/invites/{invite['id']}/revoke",
                           headers=another_user_headers)
        assert resp.status_code == 404

    async def test_revoke_twice_rejected(self, client, user_headers, guestbook_id,
                                         another_user):
        invite = _send_invite(client, user_headers, guestbook_id)
        client.post(f"/api/collaboration/invites/{invite['id']}/revoke", headers=user_headers)
        resp = client.post(f"/api/collaboration/invites/{invite['id']}/revoke",
                           headers=user_headers)
        assert resp.status_code == 400


# ------------------------- 邀请列表与脱敏 -------------------------

class TestListInvites:
    async def test_pending_shows_code(self, client, user_headers, guestbook_id, another_user):
        invite = _send_invite(client, user_headers, guestbook_id)
        resp = client.get("/api/collaboration/invites", headers=user_headers)
        item = next(i for i in resp.json() if i["id"] == invite["id"])
        assert item["invite_code"] == invite["invite_code"]

    async def test_accepted_masks_code(self, client, user_headers, another_user_headers,
                                       guestbook_id):
        invite = _send_invite(client, user_headers, guestbook_id)
        client.post("/api/collaboration/invites/accept", headers=another_user_headers,
                    json={"invite_id": invite["id"], "invite_code": invite["invite_code"]})
        resp = client.get("/api/collaboration/invites", headers=user_headers)
        item = next(i for i in resp.json() if i["id"] == invite["id"])
        assert item["invite_code"] is None
        assert item["status"] == "accepted"

    async def test_active_filter(self, client, user_headers, another_user_headers, guestbook_id):
        invite = _send_invite(client, user_headers, guestbook_id)
        client.post(f"/api/collaboration/invites/{invite['id']}/reject",
                    headers=another_user_headers)
        resp = client.get("/api/collaboration/invites?status=active", headers=user_headers)
        assert all(i["status"] in ("pending", "accepted") for i in resp.json())

    async def test_logs_record_send(self, client, user_headers, guestbook_id, another_user):
        invite = _send_invite(client, user_headers, guestbook_id)
        logs = client.get(f"/api/collaboration/invites/{invite['id']}/logs",
                          headers=user_headers)
        assert logs.status_code == 200
        assert logs.json()[0]["action_type"] == "SEND"


# ------------------------- 访问依赖权限矩阵 -------------------------

class TestAccessMatrix:
    async def test_owner_read_guestbook(self, client, user_headers, guestbook_id):
        resp = client.get(f"/api/guestbooks/{guestbook_id}", headers=user_headers)
        assert resp.status_code == 200

    async def test_reconcile_collaborator_read(self, client, another_user_headers, guestbook_id,
                                               another_user, collab_factory):
        await collab_factory(another_user, permissions="reconcile")
        resp = client.get(f"/api/guestbooks/{guestbook_id}", headers=another_user_headers)
        assert resp.status_code == 200

    async def test_record_collaborator_cannot_read(self, client, another_user_headers,
                                                   guestbook_id, another_user, collab_factory):
        await collab_factory(another_user, permissions="record")
        resp = client.get(f"/api/guestbooks/{guestbook_id}", headers=another_user_headers)
        assert resp.status_code == 403

    async def test_stranger_forbidden(self, client, guestbook_id, db_session):
        stranger = await _make_user(db_session, "stranger")
        resp = client.get(f"/api/guestbooks/{guestbook_id}",
                          headers=_auth_headers(stranger))
        assert resp.status_code == 403

    async def test_record_collaborator_can_write(self, client, another_user_headers,
                                                 guestbook_id, another_user, collab_factory):
        await collab_factory(another_user, permissions="record")
        resp = client.post(f"/api/guestbooks/{guestbook_id}/proxy-records",
                           headers=another_user_headers,
                           json={"records": [{"guest_name": "李四", "amount": 50000,
                                              "payment_method": "cash"}]})
        assert resp.status_code == 200

    async def test_reconcile_collaborator_cannot_write(self, client, another_user_headers,
                                                       guestbook_id, another_user,
                                                       collab_factory):
        await collab_factory(another_user, permissions="reconcile")
        resp = client.post(f"/api/guestbooks/{guestbook_id}/proxy-records",
                           headers=another_user_headers,
                           json={"records": [{"guest_name": "李四", "amount": 50000,
                                              "payment_method": "cash"}]})
        assert resp.status_code == 403

    async def test_both_collaborator_full(self, client, another_user_headers, guestbook_id,
                                          another_user, collab_factory, sample_record):
        await collab_factory(another_user, permissions="both")
        write = client.post(f"/api/guestbooks/{guestbook_id}/proxy-records",
                            headers=another_user_headers,
                            json={"records": [{"guest_name": "李四", "amount": 50000,
                                               "payment_method": "cash"}]})
        assert write.status_code == 200
        check = client.patch(f"/api/gb-records/{sample_record.id}/check?checked=true",
                             headers=another_user_headers)
        assert check.status_code == 200

    async def test_reconcile_collaborator_can_check(self, client, another_user_headers,
                                                    another_user, collab_factory,
                                                    sample_record):
        await collab_factory(another_user, permissions="reconcile")
        resp = client.patch(f"/api/gb-records/{sample_record.id}/check?checked=true",
                            headers=another_user_headers)
        assert resp.status_code == 200

    async def test_record_collaborator_cannot_check(self, client, another_user_headers,
                                                    another_user, collab_factory,
                                                    sample_record):
        await collab_factory(another_user, permissions="record")
        resp = client.patch(f"/api/gb-records/{sample_record.id}/check?checked=true",
                            headers=another_user_headers)
        assert resp.status_code == 403

    async def test_collaborator_records_list(self, client, another_user_headers, another_user,
                                             collab_factory, sample_record):
        await collab_factory(another_user, permissions="reconcile")
        resp = client.get(f"/api/guestbooks/{sample_record.guestbook_id}/records",
                          headers=another_user_headers)
        assert resp.status_code == 200
        assert resp.json()["pagination"]["total_count"] == 1

    async def test_expired_collaboration_blocked(self, client, another_user_headers,
                                                 another_user, collab_factory):
        invite = await collab_factory(another_user, end_offset=timedelta(hours=-1))
        resp = client.get(f"/api/guestbooks/{invite.guestbook_id}",
                          headers=another_user_headers)
        assert resp.status_code == 403

    async def test_not_started_collaboration_blocked(self, client, another_user_headers,
                                                     another_user, collab_factory):
        invite = await collab_factory(another_user, start_offset=timedelta(hours=1),
                                      end_offset=timedelta(days=7))
        resp = client.get(f"/api/guestbooks/{invite.guestbook_id}",
                          headers=another_user_headers)
        assert resp.status_code == 403
        assert "尚未开始" in resp.json()["detail"]

    async def test_revoked_collaboration_blocked(self, client, user_headers, another_user_headers,
                                                 another_user, collab_factory):
        invite = await collab_factory(another_user, permissions="reconcile")
        client.post(f"/api/collaboration/invites/{invite.id}/revoke", headers=user_headers)
        resp = client.get(f"/api/guestbooks/{invite.guestbook_id}",
                          headers=another_user_headers)
        assert resp.status_code == 403

    async def test_family_member_read(self, client, db_session, normal_user, guestbook_id):
        group = FamilyGroup(owner_id=normal_user.id, name="测试家庭", invite_code="FAM001")
        db_session.add(group)
        await db_session.flush()
        member_user = await _make_user(db_session, "family1")
        db_session.add(FamilyMember(family_group_id=group.id, user_id=member_user.id,
                                    status="active", is_active=True))
        await db_session.commit()
        resp = client.get(f"/api/guestbooks/{guestbook_id}",
                          headers=_auth_headers(member_user))
        assert resp.status_code == 200

    async def test_archived_guestbook_blocks_write(self, client, user_headers,
                                                   another_user_headers, another_user,
                                                   collab_factory):
        invite = await collab_factory(another_user, permissions="record")
        client.post(f"/api/guestbooks/{invite.guestbook_id}/archive", headers=user_headers)
        resp = client.post(f"/api/guestbooks/{invite.guestbook_id}/proxy-records",
                           headers=another_user_headers,
                           json={"records": [{"guest_name": "李四", "amount": 50000,
                                              "payment_method": "cash"}]})
        assert resp.status_code == 400
