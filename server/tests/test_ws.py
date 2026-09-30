"""WebSocket 房间授权测试。"""
import pytest
from starlette.websockets import WebSocketDisconnect

from app.core.security import create_access_token


def _create_guestbook(client, headers):
    resp = client.post("/api/guestbooks/", json={
        "name": "测试礼簿",
        "event_type": "wedding",
        "event_date": "2026-10-01",
    }, headers=headers)
    return resp.json()["id"]


def _ws_url(guestbook_id: int, token: str | None = None) -> str:
    url = f"/api/ws/guestbooks/{guestbook_id}"
    if token:
        url += f"?token={token}"
    return url


def _token_for(user) -> str:
    return create_access_token({"sub": str(user.id), "role": user.role})


class TestGuestbookWsAuth:
    async def test_owner_can_connect(self, client, super_admin):
        from tests.conftest import _auth_headers
        gb_id = _create_guestbook(client, _auth_headers(super_admin))

        with client.websocket_connect(_ws_url(gb_id, _token_for(super_admin))) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "user_joined"
            assert msg["online_count"] == 1

    async def test_non_owner_rejected(self, client, super_admin, normal_user):
        from tests.conftest import _auth_headers
        gb_id = _create_guestbook(client, _auth_headers(super_admin))

        with client.websocket_connect(_ws_url(gb_id, _token_for(normal_user))) as ws:
            with pytest.raises(WebSocketDisconnect) as exc_info:
                ws.receive_json()
        assert exc_info.value.code == 4003

    async def test_missing_token_rejected(self, client, super_admin):
        from tests.conftest import _auth_headers
        gb_id = _create_guestbook(client, _auth_headers(super_admin))

        with client.websocket_connect(_ws_url(gb_id)) as ws:
            with pytest.raises(WebSocketDisconnect) as exc_info:
                ws.receive_json()
        assert exc_info.value.code == 4001

    async def test_invalid_token_rejected(self, client, super_admin):
        from tests.conftest import _auth_headers
        gb_id = _create_guestbook(client, _auth_headers(super_admin))

        with client.websocket_connect(_ws_url(gb_id, "not-a-valid-token")) as ws:
            with pytest.raises(WebSocketDisconnect) as exc_info:
                ws.receive_json()
        assert exc_info.value.code == 4001
