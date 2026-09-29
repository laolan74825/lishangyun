import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.database import AsyncSessionLocal
from app.models.user import User

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[int, set[WebSocket]] = {}

    async def connect(self, guestbook_id: int, ws: WebSocket) -> None:
        self._rooms.setdefault(guestbook_id, set()).add(ws)

    def disconnect(self, guestbook_id: int, ws: WebSocket) -> None:
        room = self._rooms.get(guestbook_id)
        if room:
            room.discard(ws)
            if not room:
                del self._rooms[guestbook_id]

    async def broadcast(self, guestbook_id: int, message: dict) -> None:
        room = self._rooms.get(guestbook_id)
        if not room:
            return
        payload = json.dumps(message, ensure_ascii=False, default=str)
        stale: list[WebSocket] = []
        for ws in room:
            try:
                await ws.send_text(payload)
            except Exception:
                stale.append(ws)
        for ws in stale:
            room.discard(ws)

    def room_count(self, guestbook_id: int) -> int:
        return len(self._rooms.get(guestbook_id, set()))


manager = ConnectionManager()


async def _authenticate(token: str | None) -> User | None:
    if not token:
        return None
    payload = decode_access_token(token)
    if payload is None:
        return None
    user_id = payload.get("sub")
    if user_id is None:
        return None
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == int(user_id)))
        user = result.scalar_one_or_none()
        if user is None or user.is_deleted or not user.is_active:
            return None
        return user


@router.websocket("/ws/guestbooks/{guestbook_id}")
async def guestbook_ws(ws: WebSocket, guestbook_id: int, token: str | None = None):
    await ws.accept()

    user = await _authenticate(token)
    if not user:
        await ws.close(code=4001, reason="认证失败")
        return

    await manager.connect(guestbook_id, ws)
    await manager.broadcast(guestbook_id, {
        "type": "user_joined",
        "user_id": user.id,
        "username": user.username,
        "online_count": manager.room_count(guestbook_id),
    })

    try:
        while True:
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                await ws.send_text(json.dumps({"type": "error", "message": "无效的JSON格式"}))
                continue

            msg_type = msg.get("type")
            if msg_type == "new_record":
                await manager.broadcast(guestbook_id, {
                    "type": "new_record",
                    "data": msg.get("data"),
                    "user_id": user.id,
                    "username": user.username,
                })
            elif msg_type == "record_deleted":
                await manager.broadcast(guestbook_id, {
                    "type": "record_deleted",
                    "record_id": msg.get("record_id"),
                    "user_id": user.id,
                    "username": user.username,
                })
            elif msg_type == "record_updated":
                await manager.broadcast(guestbook_id, {
                    "type": "record_updated",
                    "data": msg.get("data"),
                    "user_id": user.id,
                    "username": user.username,
                })
            elif msg_type == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
            else:
                await ws.send_text(json.dumps({"type": "error", "message": f"未知消息类型: {msg_type}"}))
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(guestbook_id, ws)
        await manager.broadcast(guestbook_id, {
            "type": "user_left",
            "user_id": user.id,
            "username": user.username,
            "online_count": manager.room_count(guestbook_id),
        })
