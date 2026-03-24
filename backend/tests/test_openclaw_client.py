import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.openclaw_client import OpenClawWSClient, AgentResponse


async def test_client_connect():
    client = OpenClawWSClient(ws_url="ws://openclaw:18789", auth_token="test-token")
    with patch("app.services.openclaw_client.websockets") as mock_ws:
        mock_ws.connect = AsyncMock(return_value=AsyncMock())
        await client.connect()
        mock_ws.connect.assert_called_once_with("ws://openclaw:18789?token=test-token")
        assert client.ws is not None


async def test_rpc_sends_correct_frame():
    client = OpenClawWSClient(ws_url="ws://test:18789", auth_token="tok")
    mock_ws = AsyncMock()
    client.ws = mock_ws

    # Simulate the response arriving
    async def fake_send(data):
        import json
        frame = json.loads(data)
        req_id = frame["requestId"]
        if req_id in client._pending:
            client._pending[req_id].set_result({"type": "response", "requestId": req_id, "result": "ok"})

    mock_ws.send = fake_send
    result = await client._rpc("sessions.list", timeout=5)
    assert result["result"] == "ok"


async def test_send_and_wait_returns_agent_response():
    client = OpenClawWSClient(ws_url="ws://test:18789", auth_token="tok")
    mock_ws = AsyncMock()
    client.ws = mock_ws

    # Simulate: rpc sends message, then we fire chat events
    async def fake_send(data):
        import json
        frame = json.loads(data)
        req_id = frame["requestId"]
        if req_id in client._pending:
            client._pending[req_id].set_result({"type": "response", "requestId": req_id})

        # Simulate chat events arriving
        for listener in client._event_listeners.get("chat", []):
            await listener({"data": {"sessionKey": "session-1", "text": "Hello "}})
            await listener({"data": {"sessionKey": "session-1", "text": "world!"}})
            await listener({"data": {"sessionKey": "session-1", "final": True}})

    mock_ws.send = fake_send
    response = await client.send_and_wait(session_key="session-1", message="Test", timeout=5)
    assert isinstance(response, AgentResponse)
    assert response.text == "Hello world!"


async def test_send_and_wait_timeout():
    client = OpenClawWSClient(ws_url="ws://test:18789", auth_token="tok")
    mock_ws = AsyncMock()
    client.ws = mock_ws

    async def fake_send(data):
        import json
        frame = json.loads(data)
        req_id = frame["requestId"]
        if req_id in client._pending:
            client._pending[req_id].set_result({"type": "response", "requestId": req_id})
        # No chat events — should timeout

    mock_ws.send = fake_send
    try:
        await client.send_and_wait(session_key="session-1", message="Test", timeout=0.1)
        assert False, "Should have raised TimeoutError"
    except asyncio.TimeoutError:
        pass


async def test_agent_response_dataclass():
    resp = AgentResponse(text="output", token_count=100, cost_usd=0.01)
    assert resp.text == "output"
    assert resp.token_count == 100
    assert resp.cost_usd == 0.01
