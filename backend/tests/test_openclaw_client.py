import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest

from app.services.openclaw_client import AgentResponse, OpenClawWSClient


async def test_client_handshake():
    """Connect should wait for challenge, send connect req frame, and wait for hello."""
    client = OpenClawWSClient(ws_url="ws://openclaw:18789", auth_token="test-token")
    sent_frames = []

    mock_ws = AsyncMock()
    mock_ws.send = AsyncMock(side_effect=lambda data: sent_frames.append(json.loads(data)))

    async def fake_iter(ws_instance):
        # Server sends connect.challenge first
        yield json.dumps({
            "type": "event",
            "event": "connect.challenge",
            "payload": {"nonce": "test-nonce", "ts": 12345},
        })
        # Small delay for the client to send the connect frame
        await asyncio.sleep(0.05)
        # Server sends res ok=true with hello payload
        yield json.dumps({
            "type": "res",
            "id": "will-be-matched-by-id",
            "ok": True,
            "payload": {
                "protocol": 3,
                "server": {"version": "2026.3.23", "connId": "test-conn"},
            },
        })
        # Keep alive
        await asyncio.sleep(10)

    mock_ws.__aiter__ = lambda self: fake_iter(self)

    with patch("app.services.openclaw_client.websockets") as mock_ws_module:
        mock_ws_module.connect = AsyncMock(return_value=mock_ws)
        await client.connect()

        # Should connect with Origin header
        call_kwargs = mock_ws_module.connect.call_args
        assert call_kwargs[0][0] == "ws://openclaw:18789"
        assert call_kwargs[1]["additional_headers"]["Origin"] == "http://localhost:18789"

        # First sent frame should be the connect request
        assert len(sent_frames) >= 1
        connect_frame = sent_frames[0]
        assert connect_frame["type"] == "req"
        assert isinstance(connect_frame["id"], str)
        assert connect_frame["method"] == "connect"
        params = connect_frame["params"]
        assert params["minProtocol"] == 3
        assert params["auth"]["token"] == "test-token"
        assert params["client"]["id"] == "openclaw-control-ui"
        assert params["client"]["mode"] == "ui"
        assert "operator.admin" in params["scopes"]

        # Hello should be stored
        assert client._hello is not None
        assert client._hello["protocol"] == 3

    await client.disconnect()


async def test_rpc_sends_correct_frame():
    """RPC should send type=req with string id and return payload."""
    client = OpenClawWSClient(ws_url="ws://test:18789", auth_token="tok")
    mock_ws = AsyncMock()
    client.ws = mock_ws
    client._connected = True
    client._hello = {"protocol": 3}

    async def fake_send(data):
        frame = json.loads(data)
        assert frame["type"] == "req"
        assert isinstance(frame["id"], str)
        assert frame["method"] == "status"

        req_id = frame["id"]
        if req_id in client._pending:
            client._pending[req_id].set_result({"version": "1.0"})

    mock_ws.send = fake_send
    result = await client._rpc("status", timeout=5)
    assert result == {"version": "1.0"}


async def test_rpc_error_response():
    """RPC should raise RuntimeError when server returns ok=false."""
    client = OpenClawWSClient(ws_url="ws://test:18789", auth_token="tok")
    mock_ws = AsyncMock()
    client.ws = mock_ws
    client._connected = True

    async def fake_send(data):
        frame = json.loads(data)
        req_id = frame["id"]
        if req_id in client._pending:
            client._pending[req_id].set_exception(
                RuntimeError("OpenClaw RPC error [INVALID_REQUEST]: bad params")
            )

    mock_ws.send = fake_send
    with pytest.raises(RuntimeError, match="INVALID_REQUEST"):
        await client._rpc("bad.method", timeout=5)


async def test_send_and_wait_collects_agent_deltas():
    """send_and_wait should use `agent` method and collect text from agent events."""
    client = OpenClawWSClient(ws_url="ws://test:18789", auth_token="tok")
    mock_ws = AsyncMock()
    client.ws = mock_ws
    client._connected = True

    async def fake_send(data):
        frame = json.loads(data)
        req_id = frame["id"]

        # Verify it uses the `agent` method with idempotencyKey
        assert frame["method"] == "agent"
        assert frame["params"]["sessionKey"] == "agent:test-coder:main"
        assert "idempotencyKey" in frame["params"]

        if req_id in client._pending:
            client._pending[req_id].set_result({})

        # Simulate agent streaming events (text in data.delta)
        for listener in client._event_listeners.get("agent", []):
            await listener({
                "type": "event", "event": "agent",
                "payload": {
                    "sessionKey": "agent:test-coder:main",
                    "stream": "assistant",
                    "data": {"delta": "Hello ", "text": "Hello "},
                },
            })
            await listener({
                "type": "event", "event": "agent",
                "payload": {
                    "sessionKey": "agent:test-coder:main",
                    "stream": "assistant",
                    "data": {"delta": "world!", "text": "Hello world!"},
                },
            })

        # Simulate chat final event with complete message
        for listener in client._event_listeners.get("chat", []):
            await listener({
                "type": "event", "event": "chat",
                "payload": {
                    "sessionKey": "agent:test-coder:main",
                    "state": "final",
                    "message": {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "Hello world!"}],
                    },
                },
            })

    mock_ws.send = fake_send
    response = await client.send_and_wait(
        session_key="agent:test-coder:main", message="Test", timeout=5
    )
    assert isinstance(response, AgentResponse)
    assert response.text == "Hello world!"


async def test_send_and_wait_timeout():
    """send_and_wait should raise TimeoutError when no final event arrives."""
    client = OpenClawWSClient(ws_url="ws://test:18789", auth_token="tok")
    mock_ws = AsyncMock()
    client.ws = mock_ws
    client._connected = True

    async def fake_send(data):
        frame = json.loads(data)
        req_id = frame["id"]
        if req_id in client._pending:
            client._pending[req_id].set_result({})
        # No events — should timeout

    mock_ws.send = fake_send
    with pytest.raises(TimeoutError):
        await client.send_and_wait(
            session_key="agent:test:main", message="Test", timeout=0.1
        )


async def test_send_and_wait_ignores_other_sessions():
    """Events for other sessions should be ignored."""
    client = OpenClawWSClient(ws_url="ws://test:18789", auth_token="tok")
    mock_ws = AsyncMock()
    client.ws = mock_ws
    client._connected = True

    async def fake_send(data):
        frame = json.loads(data)
        req_id = frame["id"]
        if req_id in client._pending:
            client._pending[req_id].set_result({})

        # Agent event for DIFFERENT session
        for listener in client._event_listeners.get("agent", []):
            await listener({
                "type": "event", "event": "agent",
                "payload": {
                    "sessionKey": "agent:other:main",
                    "stream": "assistant",
                    "data": {"delta": "wrong"},
                },
            })
        # Agent event for OUR session
        for listener in client._event_listeners.get("agent", []):
            await listener({
                "type": "event", "event": "agent",
                "payload": {
                    "sessionKey": "agent:my-agent:main",
                    "stream": "assistant",
                    "data": {"delta": "right"},
                },
            })
        # Chat final for our session
        for listener in client._event_listeners.get("chat", []):
            await listener({
                "type": "event", "event": "chat",
                "payload": {
                    "sessionKey": "agent:my-agent:main",
                    "state": "final",
                    "message": {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "right"}],
                    },
                },
            })

    mock_ws.send = fake_send
    response = await client.send_and_wait(
        session_key="agent:my-agent:main", message="Test", timeout=5
    )
    assert response.text == "right"


async def test_send_and_wait_falls_back_to_deltas():
    """If final event has no message, fall back to collected agent deltas."""
    client = OpenClawWSClient(ws_url="ws://test:18789", auth_token="tok")
    mock_ws = AsyncMock()
    client.ws = mock_ws
    client._connected = True

    async def fake_send(data):
        frame = json.loads(data)
        req_id = frame["id"]
        if req_id in client._pending:
            client._pending[req_id].set_result({})

        for listener in client._event_listeners.get("agent", []):
            await listener({
                "type": "event", "event": "agent",
                "payload": {
                    "sessionKey": "agent:test:main",
                    "stream": "assistant",
                    "data": {"delta": "from deltas"},
                },
            })
        # Chat final with no message content
        for listener in client._event_listeners.get("chat", []):
            await listener({
                "type": "event", "event": "chat",
                "payload": {
                    "sessionKey": "agent:test:main",
                    "state": "final",
                },
            })

    mock_ws.send = fake_send
    response = await client.send_and_wait(
        session_key="agent:test:main", message="Test", timeout=5
    )
    assert response.text == "from deltas"


async def test_build_session_key():
    """Session key should follow agent:<workspace>:main format."""
    client = OpenClawWSClient(ws_url="ws://test:18789", auth_token="tok")
    assert client.build_session_key("my-coder") == "agent:my-coder:main"
    assert client.build_session_key("test-agent") == "agent:test-agent:main"


async def test_agent_response_dataclass():
    resp = AgentResponse(text="output", token_count=100, cost_usd=0.01)
    assert resp.text == "output"
    assert resp.token_count == 100
    assert resp.cost_usd == 0.01
