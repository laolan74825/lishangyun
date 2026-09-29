from sqlalchemy import select

from app.models.family_group import FamilyGroup
from app.models.family_member import FamilyMember


def _create_group(client, headers, name="张家"):
    return client.post("/api/family/groups", json={
        "name": name,
        "description": "测试家庭组",
    }, headers=headers)


class TestFamilyGroupCRUD:
    async def test_create_group(self, client, admin_headers, db_session):
        resp = _create_group(client, admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "张家"
        assert data["owner_id"] is not None

    async def test_list_groups(self, client, admin_headers, db_session):
        _create_group(client, admin_headers, "张家")
        _create_group(client, admin_headers, "李家")

        resp = client.get("/api/family/groups", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2

    async def test_get_group(self, client, admin_headers, db_session):
        group_id = _create_group(client, admin_headers).json()["id"]

        resp = client.get(f"/api/family/groups/{group_id}", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "张家"

    async def test_get_group_not_found(self, client, admin_headers):
        resp = client.get("/api/family/groups/9999", headers=admin_headers)
        assert resp.status_code == 404

    async def test_update_group(self, client, admin_headers, db_session):
        group_id = _create_group(client, admin_headers).json()["id"]

        resp = client.put(f"/api/family/groups/{group_id}", json={
            "name": "新张家",
            "description": "更新描述",
        }, headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/family/groups/{group_id}", headers=admin_headers)
        assert resp_get.json()["name"] == "新张家"

    async def test_dissolve_group(self, client, admin_headers, db_session):
        group_id = _create_group(client, admin_headers).json()["id"]

        resp = client.delete(f"/api/family/groups/{group_id}", headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/family/groups/{group_id}", headers=admin_headers)
        assert resp_get.status_code == 404


class TestInviteCode:
    async def test_group_has_invite_code(self, client, admin_headers, db_session):
        data = _create_group(client, admin_headers).json()
        assert data["invite_code"] is not None
        assert len(data["invite_code"]) > 0

    async def test_refresh_invite_code(self, client, admin_headers, db_session):
        data = _create_group(client, admin_headers).json()
        old_code = data["invite_code"]

        resp = client.post(f"/api/family/groups/{data['id']}/refresh-invite", headers=admin_headers)
        assert resp.status_code == 200
        new_data = resp.json()
        assert new_data["invite_code"] != old_code


class TestJoinAndLeave:
    async def test_join_group(self, client, admin_headers, user_headers, db_session):
        data = _create_group(client, admin_headers).json()
        invite_code = data["invite_code"]

        resp = client.post("/api/family/join", json={
            "invite_code": invite_code,
        }, headers=user_headers)
        assert resp.status_code == 200

        resp_members = client.get(f"/api/family/groups/{data['id']}/members", headers=admin_headers)
        assert resp.status_code == 200
        members = resp_members.json()
        assert len(members) == 2

    async def test_join_invalid_code(self, client, user_headers):
        resp = client.post("/api/family/join", json={
            "invite_code": "INVALID_CODE_XYZ",
        }, headers=user_headers)
        assert resp.status_code == 404

    async def test_leave_group(self, client, admin_headers, user_headers, db_session):
        data = _create_group(client, admin_headers).json()
        invite_code = data["invite_code"]

        client.post("/api/family/join", json={"invite_code": invite_code}, headers=user_headers)

        resp = client.post(f"/api/family/groups/{data['id']}/leave", headers=user_headers)
        assert resp.status_code == 200

        resp_members = client.get(f"/api/family/groups/{data['id']}/members", headers=admin_headers)
        members = resp_members.json()
        assert len(members) == 1


class TestMemberManagement:
    async def test_list_members(self, client, admin_headers, db_session):
        group_id = _create_group(client, admin_headers).json()["id"]

        resp = client.get(f"/api/family/groups/{group_id}/members", headers=admin_headers)
        assert resp.status_code == 200
        members = resp.json()
        assert len(members) == 1
        assert members[0]["role"] == "owner"

    async def test_update_member_role(self, client, admin_headers, user_headers, db_session):
        data = _create_group(client, admin_headers).json()
        client.post("/api/family/join", json={"invite_code": data["invite_code"]}, headers=user_headers)

        members = client.get(f"/api/family/groups/{data['id']}/members", headers=admin_headers).json()
        non_owner = next(m for m in members if m["role"] != "owner")

        resp = client.put(
            f"/api/family/groups/{data['id']}/members/{non_owner['id']}/role",
            json={"role": "admin"},
            headers=admin_headers,
        )
        assert resp.status_code == 200

    async def test_toggle_member_active(self, client, admin_headers, user_headers, db_session):
        data = _create_group(client, admin_headers).json()
        client.post("/api/family/join", json={"invite_code": data["invite_code"]}, headers=user_headers)

        members = client.get(f"/api/family/groups/{data['id']}/members", headers=admin_headers).json()
        non_owner = next(m for m in members if m["role"] != "owner")

        resp = client.put(
            f"/api/family/groups/{data['id']}/members/{non_owner['id']}/active",
            json={"is_active": False},
            headers=admin_headers,
        )
        assert resp.status_code == 200

    async def test_remove_member(self, client, admin_headers, user_headers, db_session):
        data = _create_group(client, admin_headers).json()
        client.post("/api/family/join", json={"invite_code": data["invite_code"]}, headers=user_headers)

        members = client.get(f"/api/family/groups/{data['id']}/members", headers=admin_headers).json()
        non_owner = next(m for m in members if m["role"] != "owner")

        resp = client.delete(
            f"/api/family/groups/{data['id']}/members/{non_owner['id']}",
            headers=admin_headers,
        )
        assert resp.status_code == 200


class TestSharedViews:
    async def test_shared_persons(self, client, admin_headers, user_headers, db_session):
        data = _create_group(client, admin_headers).json()
        client.post("/api/family/join", json={"invite_code": data["invite_code"]}, headers=user_headers)

        client.post("/api/persons/", json={
            "name": "共享人员",
            "phone": "13800000001",
        }, headers=admin_headers)

        resp = client.get(f"/api/family/groups/{data['id']}/shared/persons", headers=admin_headers)
        assert resp.status_code == 200
        persons = resp.json()
        assert len(persons) >= 1

    async def test_shared_stats(self, client, admin_headers, db_session):
        data = _create_group(client, admin_headers).json()

        resp = client.get(f"/api/family/groups/{data['id']}/shared/stats", headers=admin_headers)
        assert resp.status_code == 200
        stats = resp.json()
        assert "person_count" in stats
        assert "total_received" in stats
        assert "total_sent" in stats
        assert "member_count" in stats


class TestDataIsolation:
    async def test_user_cannot_access_other_group(self, client, admin_headers, user_headers, db_session):
        group_id = _create_group(client, admin_headers).json()["id"]

        resp = client.get(f"/api/family/groups/{group_id}", headers=user_headers)
        assert resp.status_code == 404

    async def test_user_cannot_manage_other_members(self, client, admin_headers, user_headers, db_session):
        data = _create_group(client, admin_headers).json()
        members = client.get(f"/api/family/groups/{data['id']}/members", headers=admin_headers).json()
        owner_member = members[0]

        resp = client.put(
            f"/api/family/groups/{data['id']}/members/{owner_member['id']}/role",
            json={"role": "member"},
            headers=user_headers,
        )
        assert resp.status_code in (403, 404)
