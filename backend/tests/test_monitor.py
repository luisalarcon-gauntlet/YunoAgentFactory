import json
from unittest.mock import AsyncMock

from app.services.ws_manager import WebSocketManager


async def test_ws_manager_broadcast():
    manager = WebSocketManager()
    mock_ws = AsyncMock()
    mock_ws.accept = AsyncMock()
    await manager.connect(mock_ws)

    await manager.broadcast({"type": "test", "data": "hello"})
    mock_ws.send_text.assert_called_once()
    sent = json.loads(mock_ws.send_text.call_args[0][0])
    assert sent["type"] == "test"
    assert sent["data"] == "hello"


async def test_ws_manager_multiple_clients():
    manager = WebSocketManager()
    clients = [AsyncMock() for _ in range(3)]
    for c in clients:
        c.accept = AsyncMock()
        await manager.connect(c)

    await manager.broadcast({"type": "ping"})
    for c in clients:
        assert c.send_text.call_count == 1


async def test_ws_manager_disconnect():
    manager = WebSocketManager()
    mock_ws = AsyncMock()
    mock_ws.accept = AsyncMock()
    await manager.connect(mock_ws)
    manager.disconnect(mock_ws)

    await manager.broadcast({"type": "ping"})
    mock_ws.send_text.assert_not_called()


async def test_ws_manager_handles_dead_connections():
    manager = WebSocketManager()
    good_ws = AsyncMock()
    good_ws.accept = AsyncMock()
    bad_ws = AsyncMock()
    bad_ws.accept = AsyncMock()
    bad_ws.send_text.side_effect = Exception("Connection closed")

    await manager.connect(good_ws)
    await manager.connect(bad_ws)

    await manager.broadcast({"type": "test"})
    good_ws.send_text.assert_called_once()
    assert len(manager._connections) == 1
