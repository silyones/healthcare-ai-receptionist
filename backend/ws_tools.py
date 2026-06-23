import json
from collections import defaultdict

from fastapi import WebSocket


class ToolWsManager:
    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, room_name: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._rooms[room_name].add(websocket)

    def disconnect(self, room_name: str, websocket: WebSocket) -> None:
        self._rooms[room_name].discard(websocket)
        if not self._rooms[room_name]:
            del self._rooms[room_name]

    async def broadcast(self, room_name: str, payload: dict) -> None:
        if room_name not in self._rooms:
            return

        message = json.dumps(payload)
        dead: list[WebSocket] = []
        for websocket in self._rooms[room_name]:
            try:
                await websocket.send_text(message)
            except Exception:
                dead.append(websocket)

        for websocket in dead:
            self.disconnect(room_name, websocket)


tool_ws_manager = ToolWsManager()
