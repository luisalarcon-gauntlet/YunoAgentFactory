import asyncio
import json
import logging
import uuid
from dataclasses import dataclass
from typing import Callable

import websockets
from langsmith import traceable

logger = logging.getLogger(__name__)

PROTOCOL_VERSION = 3

# Connect as control-ui client to receive full operator scopes.
# Combined with dangerouslyDisableDeviceAuth=true in the gateway config,
# this lets our backend bypass device pairing (dev-only).
CLIENT_ID = "openclaw-control-ui"
CLIENT_MODE = "ui"
ORIGIN_HEADER = "http://localhost:18789"


@dataclass
class AgentResponse:
    text: str
    token_count: int
    cost_usd: float
    input_tokens: int = 0
    output_tokens: int = 0


# Approximate cost per token by model (USD per token)
MODEL_PRICING: dict[str, tuple[float, float]] = {
    # (input_cost_per_token, output_cost_per_token)
    "claude-sonnet-4-20250514": (3.0 / 1_000_000, 15.0 / 1_000_000),
    "claude-opus-4-20250514": (15.0 / 1_000_000, 75.0 / 1_000_000),
    "claude-haiku-4-20250514": (0.80 / 1_000_000, 4.0 / 1_000_000),
}
DEFAULT_PRICING = (3.0 / 1_000_000, 15.0 / 1_000_000)  # sonnet default


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token for English text."""
    return max(1, len(text) // 4)


def _estimate_cost(input_tokens: int, output_tokens: int, model: str = "") -> float:
    input_price, output_price = MODEL_PRICING.get(model, DEFAULT_PRICING)
    return input_tokens * input_price + output_tokens * output_price


class AgentError(Exception):
    """Raised when an OpenClaw agent run ends in error/aborted state."""

    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


# Substrings in error messages that indicate a transient/retryable failure
_RETRYABLE_PATTERNS = ("overloaded", "temporarily", "rate limit", "529", "503")


class OpenClawWSClient:
    """WebSocket RPC client for the OpenClaw gateway (protocol v3).

    Handshake flow:
      1. Connect to WebSocket
      2. Receive connect.challenge event (nonce)
      3. Send req frame with method="connect" and ConnectParams
      4. Receive res with ok=true containing server hello

    RPC frames:
      - Request: {type:"req", id:"<uuid>", method:"<name>", params:{...}}
      - Response: {type:"res", id:"<uuid>", ok:true/false, payload/error:{...}}
      - Events: {type:"event", event:"<name>", payload:{...}}
    """

    def __init__(self, ws_url: str, auth_token: str) -> None:
        self.ws_url = ws_url
        self.auth_token = auth_token
        self.ws = None
        self._pending: dict[str, asyncio.Future] = {}
        self._event_listeners: dict[str, list[Callable]] = {}
        self._connected = False
        self._hello: dict | None = None
        self._hello_event = asyncio.Event()

    async def connect(self) -> None:
        """Connect to OpenClaw gateway and complete the protocol handshake."""
        if self._connected and self.ws:
            return
        try:
            logger.info("Connecting to OpenClaw gateway at %s", self.ws_url)
            self.ws = await websockets.connect(
                self.ws_url,
                additional_headers={"Origin": ORIGIN_HEADER},
            )
            self._hello_event.clear()
            self._connected = True

            # Start listener before sending handshake so we catch the hello
            asyncio.create_task(self._listen())

            # Wait for the connect.challenge event from the server
            try:
                await asyncio.wait_for(self._hello_event.wait(), timeout=5)
                # _hello_event is first set when we receive connect.challenge,
                # then we clear and re-set it after the hello response.
                # Actually, let's handle this in _listen() properly.
            except asyncio.TimeoutError:
                pass
            # Reset — we'll use _hello_event for the actual hello
            self._hello_event.clear()

            # Send connect request frame (OpenClaw protocol v3)
            connect_frame = {
                "type": "req",
                "id": str(uuid.uuid4()),
                "method": "connect",
                "params": {
                    "minProtocol": PROTOCOL_VERSION,
                    "maxProtocol": PROTOCOL_VERSION,
                    "client": {
                        "id": CLIENT_ID,
                        "mode": CLIENT_MODE,
                        "version": "1.0.0",
                        "platform": "linux",
                    },
                    "role": "operator",
                    "scopes": ["operator.admin", "operator.read", "operator.write"],
                    "auth": {
                        "token": self.auth_token,
                    },
                },
            }
            await self.ws.send(json.dumps(connect_frame))
            logger.debug("Sent connect handshake frame")

            # Wait for the res ok=true (hello)
            try:
                await asyncio.wait_for(self._hello_event.wait(), timeout=10)
            except asyncio.TimeoutError:
                await self.disconnect()
                raise ConnectionError(
                    "OpenClaw did not respond with hello within 10s"
                )

            server_ver = "?"
            if self._hello:
                server_info = self._hello.get("server", {})
                server_ver = server_info.get("version", "?")
            logger.info("Connected to OpenClaw gateway (server %s)", server_ver)

        except ConnectionError:
            self._connected = False
            raise
        except Exception as e:
            self._connected = False
            logger.error("Failed to connect to OpenClaw at %s: %s", self.ws_url, e)
            raise ConnectionError(f"Cannot connect to OpenClaw at {self.ws_url}: {e}") from e

    async def disconnect(self) -> None:
        self._connected = False
        self._hello = None
        self._hello_event.clear()
        if self.ws:
            try:
                await self.ws.close()
            except Exception as e:
                logger.warning("Error closing OpenClaw WebSocket: %s", e)
            finally:
                self.ws = None

    async def check_connection(self) -> dict:
        """Connect and perform a basic RPC to verify the protocol works."""
        try:
            await self.connect()
            status = await self._rpc("status", timeout=10)
            return {
                "connected": True,
                "ws_url": self.ws_url,
                "server": self._hello.get("server") if self._hello else None,
                "status_rpc": status,
            }
        except Exception as e:
            return {
                "connected": False,
                "ws_url": self.ws_url,
                "error": str(e),
            }

    def build_session_key(self, agent_workspace: str) -> str:
        """Construct an OpenClaw session key for an agent.

        Sessions are created implicitly when the first message is sent.
        """
        return f"agent:{agent_workspace}:main"

    @traceable(run_type="llm", name="OpenClaw RPC")
    async def send_and_wait(
        self,
        session_key: str,
        message: str,
        timeout: float = 120,
        on_delta: Callable[[str], asyncio.coroutines] | None = None,
        max_retries: int = 3,
        model: str = "",
    ) -> AgentResponse:
        """Send a message to an agent and wait for the complete response.

        Uses the `agent` RPC method. Text arrives via two channels:
        - `agent` events with stream="assistant" carry real-time deltas
        - `chat` final event carries the complete message in message.content

        Retries automatically on transient errors (API overloaded, rate limits)
        up to ``max_retries`` times with exponential backoff.

        Args:
            on_delta: Optional async callback invoked with each streaming text chunk.
            max_retries: Maximum number of retry attempts for transient errors.
            model: The Claude model to use for this request.
        """
        last_error: AgentError | None = None

        for attempt in range(1, max_retries + 1):
            try:
                return await self._send_and_wait_once(
                    session_key, message, timeout, on_delta, model=model,
                )
            except AgentError as e:
                last_error = e
                if not e.retryable or attempt == max_retries:
                    raise
                backoff = 2 ** attempt  # 2s, 4s, 8s
                logger.warning(
                    "Transient agent error (attempt %d/%d), retrying in %ds: %s",
                    attempt, max_retries, backoff, e,
                )
                await asyncio.sleep(backoff)

        # Should not reach here, but satisfy type checker
        raise last_error  # type: ignore[misc]

    async def _send_and_wait_once(
        self,
        session_key: str,
        message: str,
        timeout: float,
        on_delta: Callable[[str], asyncio.coroutines] | None,
        model: str = "",
    ) -> AgentResponse:
        """Single attempt to send a message and wait for the response."""
        await self._ensure_connected()

        response_parts: list[str] = []
        final_text: str | None = None
        agent_error: AgentError | None = None
        usage_data: dict = {}
        done_event = asyncio.Event()

        async def on_agent_event(event: dict) -> None:
            """Collect streaming text from agent assistant events."""
            payload = event.get("payload", {})
            if payload.get("sessionKey") != session_key:
                return
            stream = payload.get("stream", "")
            data = payload.get("data", {})
            if stream == "assistant" and "delta" in data:
                delta = data["delta"]
                response_parts.append(delta)
                if on_delta is not None:
                    try:
                        await on_delta(delta)
                    except Exception:
                        logger.debug("on_delta callback error", exc_info=True)

        async def on_chat_event(event: dict) -> None:
            """Detect final state and extract complete message + token usage."""
            nonlocal final_text, agent_error
            payload = event.get("payload", {})
            if payload.get("sessionKey") != session_key:
                return

            state = payload.get("state", "")
            if state == "final":
                # Extract complete text from message content
                message_obj = payload.get("message", {})
                content = message_obj.get("content", [])
                parts = []
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        parts.append(block.get("text", ""))
                    elif isinstance(block, str):
                        parts.append(block)
                if parts:
                    final_text = "".join(parts)

                # Extract token usage if provided by OpenClaw
                for key in ("usage", "tokens", "tokenUsage"):
                    u = payload.get(key) or message_obj.get(key)
                    if isinstance(u, dict):
                        usage_data.update(u)
                        break

                done_event.set()
            elif state in ("aborted", "error"):
                error_msg = payload.get("error", payload.get("message", "Unknown error"))
                logger.error("Agent error for session '%s': %s", session_key, error_msg)
                retryable = any(p in error_msg.lower() for p in _RETRYABLE_PATTERNS)
                agent_error = AgentError(
                    f"Agent '{session_key}' failed: {error_msg}",
                    retryable=retryable,
                )
                done_event.set()

        self._event_listeners.setdefault("agent", []).append(on_agent_event)
        self._event_listeners.setdefault("chat", []).append(on_chat_event)

        try:
            logger.info("Sending message to session '%s' (%d chars)", session_key, len(message))

            rpc_params: dict = {
                "sessionKey": session_key,
                "message": message,
                "idempotencyKey": str(uuid.uuid4()),
            }
            if model:
                rpc_params["model"] = model

            await self._rpc("agent", rpc_params)

            await asyncio.wait_for(done_event.wait(), timeout=timeout)

            # If the agent errored, raise instead of returning empty response
            if agent_error is not None:
                raise agent_error

            # Prefer the authoritative final text; fall back to collected deltas
            full_text = final_text if final_text is not None else "".join(response_parts)

            # Token counting: use OpenClaw-provided data or estimate
            input_tokens = int(
                usage_data.get("input_tokens")
                or usage_data.get("prompt_tokens")
                or _estimate_tokens(message)
            )
            output_tokens = int(
                usage_data.get("output_tokens")
                or usage_data.get("completion_tokens")
                or _estimate_tokens(full_text)
            )
            total_tokens = input_tokens + output_tokens
            cost = _estimate_cost(input_tokens, output_tokens, model=model)

            logger.info(
                "Received response from session '%s' (%d chars, ~%d tokens)",
                session_key, len(full_text), total_tokens,
            )
            return AgentResponse(
                text=full_text,
                token_count=total_tokens,
                cost_usd=cost,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
        except asyncio.TimeoutError:
            logger.error("Agent response timed out for session '%s' after %.0fs", session_key, timeout)
            raise TimeoutError(f"Agent response timed out after {timeout}s")
        finally:
            self._event_listeners["agent"].remove(on_agent_event)
            self._event_listeners["chat"].remove(on_chat_event)

    async def _ensure_connected(self) -> None:
        if not self._connected or not self.ws:
            await self.connect()

    async def _listen(self) -> None:
        """Background listener for incoming WebSocket frames."""
        try:
            async for raw in self.ws:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    logger.warning("Non-JSON frame from OpenClaw: %s", raw[:200])
                    continue

                frame_type = msg.get("type")

                if frame_type == "res":
                    req_id = msg.get("id")
                    if req_id and req_id in self._pending:
                        if msg.get("ok"):
                            self._pending[req_id].set_result(msg.get("payload", {}))
                        else:
                            error = msg.get("error", {})
                            error_msg = error.get("message", "Unknown RPC error")
                            error_code = error.get("code", "UNKNOWN")
                            self._pending[req_id].set_exception(
                                RuntimeError(f"OpenClaw RPC error [{error_code}]: {error_msg}")
                            )
                    elif req_id:
                        # Could be the connect response — check if it contains hello data
                        if msg.get("ok"):
                            payload = msg.get("payload", {})
                            if "protocol" in payload or "server" in payload:
                                self._hello = payload
                                self._hello_event.set()
                                logger.debug(
                                    "Received hello: server=%s",
                                    payload.get("server", {}).get("version", "?"),
                                )

                elif frame_type == "event":
                    event_name = msg.get("event", "")

                    if event_name == "connect.challenge":
                        # Server challenge — signal that connection is open
                        self._hello_event.set()
                    elif event_name == "tick":
                        pass  # heartbeat, ignore
                    else:
                        for listener in self._event_listeners.get(event_name, []):
                            asyncio.create_task(listener(msg))

                else:
                    logger.debug("Unhandled frame type '%s'", frame_type)

        except websockets.ConnectionClosed as e:
            logger.warning("OpenClaw WebSocket closed: code=%s reason=%s", e.code, e.reason)
            self._connected = False
        except Exception as e:
            logger.error("OpenClaw WebSocket listener error: %s", e)
            self._connected = False

    async def _rpc(self, method: str, params: dict | None = None, timeout: float = 30) -> dict:
        """Send an RPC request and wait for the response."""
        await self._ensure_connected()

        req_id = str(uuid.uuid4())
        frame: dict = {
            "type": "req",
            "id": req_id,
            "method": method,
        }
        if params:
            frame["params"] = params

        loop = asyncio.get_event_loop()
        future = loop.create_future()
        self._pending[req_id] = future

        try:
            await self.ws.send(json.dumps(frame))
            logger.debug("Sent RPC: method=%s id=%s", method, req_id[:8])
        except Exception as e:
            self._pending.pop(req_id, None)
            logger.error("Failed to send RPC '%s': %s", method, e)
            raise ConnectionError(f"Failed to send to OpenClaw: {e}") from e

        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            logger.error("RPC '%s' timed out after %.0fs (id=%s)", method, timeout, req_id[:8])
            raise TimeoutError(f"OpenClaw RPC '{method}' timed out after {timeout}s")
        finally:
            self._pending.pop(req_id, None)
