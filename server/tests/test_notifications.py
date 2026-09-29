from app.models.notification import Notification
from sqlalchemy import select


async def _create_notification(db_session, user_id: int, type: str = "approval_approved", title: str = "测试通知", content: str | None = None, is_read: bool = False):
    n = Notification(
        user_id=user_id, type=type, title=title,
        content=content, is_read=is_read,
    )
    db_session.add(n)
    await db_session.commit()
    await db_session.refresh(n)
    return n


class TestListNotifications:
    async def test_list_all(self, client, normal_user, db_session):
        await _create_notification(db_session, normal_user.id, title="通知1")
        await _create_notification(db_session, normal_user.id, title="通知2")

        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(normal_user.id), 'role': normal_user.role})}"}

        resp = client.get("/api/notifications/", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    async def test_filter_by_is_read(self, client, normal_user, db_session):
        await _create_notification(db_session, normal_user.id, title="未读", is_read=False)
        await _create_notification(db_session, normal_user.id, title="已读", is_read=True)

        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(normal_user.id), 'role': normal_user.role})}"}

        resp = client.get("/api/notifications/?is_read=false", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["title"] == "未读"

    async def test_filter_by_type(self, client, normal_user, db_session):
        await _create_notification(db_session, normal_user.id, type="approval_approved", title="通过")
        await _create_notification(db_session, normal_user.id, type="approval_rejected", title="拒绝")

        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(normal_user.id), 'role': normal_user.role})}"}

        resp = client.get("/api/notifications/?type=approval_approved", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["type"] == "approval_approved"

    async def test_pagination(self, client, normal_user, db_session):
        for i in range(5):
            await _create_notification(db_session, normal_user.id, title=f"通知{i}")

        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(normal_user.id), 'role': normal_user.role})}"}

        resp = client.get("/api/notifications/?page=1&page_size=2", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    async def test_data_isolation(self, client, normal_user, another_user, db_session):
        await _create_notification(db_session, normal_user.id, title="用户1的通知")
        await _create_notification(db_session, another_user.id, title="用户2的通知")

        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(normal_user.id), 'role': normal_user.role})}"}

        resp = client.get("/api/notifications/", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["title"] == "用户1的通知"


class TestUnreadCount:
    async def test_unread_count(self, client, normal_user, db_session):
        await _create_notification(db_session, normal_user.id, is_read=False)
        await _create_notification(db_session, normal_user.id, is_read=False)
        await _create_notification(db_session, normal_user.id, is_read=True)

        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(normal_user.id), 'role': normal_user.role})}"}

        resp = client.get("/api/notifications/unread-count", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["unread_count"] == 2

    async def test_unread_count_zero(self, client, normal_user, db_session):
        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(normal_user.id), 'role': normal_user.role})}"}

        resp = client.get("/api/notifications/unread-count", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["unread_count"] == 0


class TestMarkRead:
    async def test_mark_single_read(self, client, normal_user, db_session):
        n = await _create_notification(db_session, normal_user.id, is_read=False)

        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(normal_user.id), 'role': normal_user.role})}"}

        resp = client.put(f"/api/notifications/{n.id}/read", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["message"] == "已标记为已读"

        result = await db_session.execute(select(Notification).where(Notification.id == n.id))
        assert result.scalar_one().is_read is True

    async def test_mark_read_nonexistent(self, client, normal_user, db_session):
        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(normal_user.id), 'role': normal_user.role})}"}

        resp = client.put("/api/notifications/99999/read", headers=headers)
        assert resp.status_code == 404

    async def test_cannot_mark_others_notification(self, client, normal_user, another_user, db_session):
        n = await _create_notification(db_session, another_user.id, is_read=False)

        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(normal_user.id), 'role': normal_user.role})}"}

        resp = client.put(f"/api/notifications/{n.id}/read", headers=headers)
        assert resp.status_code == 404


class TestMarkAllRead:
    async def test_mark_all_read(self, client, normal_user, db_session):
        await _create_notification(db_session, normal_user.id, is_read=False)
        await _create_notification(db_session, normal_user.id, is_read=False)
        await _create_notification(db_session, normal_user.id, is_read=True)

        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(normal_user.id), 'role': normal_user.role})}"}

        resp = client.put("/api/notifications/read-all", headers=headers)
        assert resp.status_code == 200

        result = await db_session.execute(
            select(Notification).where(
                Notification.user_id == normal_user.id,
                Notification.is_read == False,
            )
        )
        assert result.scalars().all() == []

    async def test_mark_all_read_does_not_affect_other_user(self, client, normal_user, another_user, db_session):
        await _create_notification(db_session, normal_user.id, is_read=False)
        other_n = await _create_notification(db_session, another_user.id, is_read=False)

        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(normal_user.id), 'role': normal_user.role})}"}

        client.put("/api/notifications/read-all", headers=headers)

        result = await db_session.execute(select(Notification).where(Notification.id == other_n.id))
        assert result.scalar_one().is_read is False


class TestDeleteNotification:
    async def test_delete_notification(self, client, normal_user, db_session):
        n = await _create_notification(db_session, normal_user.id)

        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(normal_user.id), 'role': normal_user.role})}"}

        resp = client.delete(f"/api/notifications/{n.id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["message"] == "已删除"

        result = await db_session.execute(select(Notification).where(Notification.id == n.id))
        assert result.scalar_one_or_none() is None

    async def test_delete_nonexistent(self, client, normal_user, db_session):
        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(normal_user.id), 'role': normal_user.role})}"}

        resp = client.delete("/api/notifications/99999", headers=headers)
        assert resp.status_code == 404

    async def test_cannot_delete_others_notification(self, client, normal_user, another_user, db_session):
        n = await _create_notification(db_session, another_user.id)

        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(normal_user.id), 'role': normal_user.role})}"}

        resp = client.delete(f"/api/notifications/{n.id}", headers=headers)
        assert resp.status_code == 404

        result = await db_session.execute(select(Notification).where(Notification.id == n.id))
        assert result.scalar_one_or_none() is not None
