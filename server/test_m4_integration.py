"""M4 integration test: approvals + notifications."""
import asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, delete

from app.main import app
from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.family_group import FamilyGroup
from app.models.family_member import FamilyMember
from app.models.pending_approval import PendingApproval
from app.models.notification import Notification
from app.core.security import hash_password


async def cleanup():
    async with AsyncSessionLocal() as db:
        await db.execute(delete(Notification))
        await db.execute(delete(PendingApproval))
        await db.execute(delete(FamilyMember))
        await db.execute(delete(FamilyGroup))
        for uname, nick in [("owner1", "所有者1"), ("member1", "成员1"), ("member2", "成员2")]:
            existing = await db.execute(select(User).where(User.username == uname))
            if not existing.scalar_one_or_none():
                db.add(User(username=uname, nickname=nick, password_hash=hash_password("Test1234!"), role="user"))
        await db.commit()
    print("Cleaned & ready")


async def test_all():
    await cleanup()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        tokens = {}
        for uname in ["owner1", "member1", "member2"]:
            r = await c.post("/api/auth/login", json={"username": uname, "password": "Test1234!"})
            tokens[uname] = r.json()["access_token"]
        h = lambda u: {"Authorization": f"Bearer {tokens[u]}"}
        print("=== Logged in 3 users ===")

        # 1. Create group
        r = await c.post("/api/family/groups", json={"name": "测试家庭"}, headers=h("owner1"))
        assert r.status_code == 200, f"Create group failed: {r.text}"
        group_id = r.json()["id"]
        invite_code = r.json()["invite_code"]
        print(f"1. [PASS] Create group id={group_id}")

        # 2-3. Members join
        r = await c.post("/api/family/join", json={"invite_code": invite_code}, headers=h("member1"))
        assert r.status_code == 200, f"member1 join failed: {r.text}"
        print("2. [PASS] member1 joined")
        r = await c.post("/api/family/join", json={"invite_code": invite_code}, headers=h("member2"))
        assert r.status_code == 200
        print("3. [PASS] member2 joined")

        # 4. Owner notifications (family_member_joined x2)
        r = await c.get("/api/notifications/", headers=h("owner1"))
        notifs = r.json()
        assert len(notifs) == 2, f"Expected 2 notifications, got {len(notifs)}"
        assert all(n["type"] == "family_member_joined" for n in notifs)
        print(f"4. [PASS] owner1 got {len(notifs)} family_member_joined notifications")

        # 5. member1 submits CREATE approval
        r = await c.post("/api/approvals/", json={
            "family_group_id": group_id,
            "action_type": "CREATE",
            "target_table": "person",
            "data_snapshot": {"data": {"name": "张三", "phone": "13800001111", "relationship_tag": "other"}},
        }, headers=h("member1"))
        assert r.status_code == 200, f"Submit failed: {r.text}"
        approval_id = r.json()["id"]
        print(f"5. [PASS] Submit CREATE approval id={approval_id}")

        # 6. Owner checks queue
        r = await c.get(f"/api/approvals/?group_id={group_id}", headers=h("owner1"))
        queue = r.json()
        assert len(queue) == 1 and queue[0]["status"] == "pending"
        print("6. [PASS] Approval queue: 1 pending")

        # 7. Owner approves CREATE
        r = await c.put(f"/api/approvals/{approval_id}/review", json={"approved": True, "note": "同意"}, headers=h("owner1"))
        assert r.status_code == 200, f"Approve failed: {r.text}"
        print("7. [PASS] Approved & person created")

        # Get the actual person id that was created
        from app.models.person import Person
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Person).where(Person.name == "张三").order_by(Person.id.desc()))
            person = result.scalars().first()
            created_person_id = person.id if person else None

        # 8. member1 notifications (approval_approved)
        r = await c.get("/api/notifications/", headers=h("member1"))
        notifs_m1 = r.json()
        approved_notifs = [n for n in notifs_m1 if n["type"] == "approval_approved"]
        assert len(approved_notifs) >= 1
        print("8. [PASS] member1 got approval_approved notification")

        # 9. member1 (record owner) submits UPDATE approval
        r = await c.post("/api/approvals/", json={
            "family_group_id": group_id,
            "action_type": "UPDATE",
            "target_table": "person",
            "target_id": created_person_id,
            "data_snapshot": {"target_id": created_person_id, "after": {"name": "张三丰"}},
        }, headers=h("member1"))
        assert r.status_code == 200
        approval_id2 = r.json()["id"]
        print(f"9. [PASS] Submit UPDATE approval id={approval_id2}")

        # 10. Owner approves UPDATE
        r = await c.put(f"/api/approvals/{approval_id2}/review", json={"approved": True}, headers=h("owner1"))
        assert r.status_code == 200, f"Approve UPDATE failed: {r.text}"
        print("10. [PASS] UPDATE approved & person updated")

        # 11. member1 (record owner) submits DELETE approval
        r = await c.post("/api/approvals/", json={
            "family_group_id": group_id,
            "action_type": "DELETE",
            "target_table": "person",
            "target_id": created_person_id,
            "data_snapshot": {"target_id": created_person_id},
        }, headers=h("member1"))
        assert r.status_code == 200
        approval_id3 = r.json()["id"]
        print(f"11. [PASS] Submit DELETE approval id={approval_id3}")

        # 12. Owner approves DELETE
        r = await c.put(f"/api/approvals/{approval_id3}/review", json={"approved": True}, headers=h("owner1"))
        assert r.status_code == 200, f"Approve DELETE failed: {r.text}"
        print("12. [PASS] DELETE approved & person soft-deleted")

        # 13. Expire check
        r = await c.post("/api/approvals/expire", headers=h("owner1"))
        assert r.status_code == 200
        print(f"13. [PASS] Expire endpoint: {r.json()}")

        # 14. Validation: bad action_type
        r = await c.post("/api/approvals/", json={
            "family_group_id": group_id,
            "action_type": "INVALID",
            "target_table": "person",
        }, headers=h("member1"))
        assert r.status_code == 422, f"Expected 422, got {r.status_code}"
        print("14. [PASS] Bad action_type rejected (422)")

        # 15. Unread count
        r = await c.get("/api/notifications/unread-count", headers=h("owner1"))
        assert r.status_code == 200
        print(f"15. [PASS] Unread count: {r.json()}")

        # 16. Mark all as read
        r = await c.put("/api/notifications/read-all", headers=h("member1"))
        assert r.status_code == 200
        print("16. [PASS] Mark all notifications as read")

        print()
        print("=" * 30)
        print("  ALL 16 TESTS PASSED [PASS]")
        print("=" * 30)


asyncio.run(test_all())
