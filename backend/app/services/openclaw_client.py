import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Callable

import websockets

logger = logging.getLogger(__name__)


@dataclass
class AgentResponse:
    text: str
    token_count: int
    cost_usd: float


class OpenClawWSClient:
    def __init__(self, ws_url: str, auth_token: str):
        self.ws_url = ws_url
        self.auth_token = auth_token
        self.ws = None
        self._request_id = 0
        self._pending: dict[int, asyncio.Future] = {}
        self._event_listeners: dict[str, list[Callable]] = {}
        self._connected = False

    async def connect(self) -> None:
        if self._connected and self.ws:
            return
        try:
            url = f"{self.ws_url}?token={self.auth_token}"
            logger.info("Connecting to OpenClaw gateway at %s", self.ws_url)
            self.ws = await websockets.connect(url)
            self._connected = True
            asyncio.create_task(self._listen())
            logger.info("Successfully connected to OpenClaw gateway")
        except Exception as e:
            self._connected = False
            logger.error("Failed to connect to OpenClaw gateway at %s: %s", self.ws_url, e)
            raise ConnectionError(f"Cannot connect to OpenClaw at {self.ws_url}: {e}") from e

    async def disconnect(self) -> None:
        self._connected = False
        if self.ws:
            try:
                await self.ws.close()
            except Exception as e:
                logger.warning("Error closing OpenClaw WebSocket: %s", e)
            finally:
                self.ws = None

    async def create_session(self, agent_workspace: str) -> str:
        """Create an OpenClaw session for an agent and return the session key."""
        await self._ensure_connected()
        logger.info("Creating OpenClaw session for agent workspace '%s'", agent_workspace)
        try:
            response = await self._rpc("session.create", {
                "agentId": agent_workspace,
            })
            session_key = response.get("data", {}).get("sessionKey", "")
            if not session_key:
                # Some OpenClaw versions return the key differently
                session_key = response.get("result", {}).get("sessionKey", "")
            if not session_key:
                # Fall back to using the agent workspace as the session key
                session_key = agent_workspace
                logger.warning(
                    "OpenClaw did not return a sessionKey for '%s', using workspace name as key",
                    agent_workspace,
                )
            logger.info("Created session '%s' for agent '%s'", session_key, agent_workspace)
            return session_key
        except Exception as e:
            logger.error("Failed to create session for agent '%s': %s", agent_workspace, e)
            raise

    async def check_connection(self) -> dict:
        """Check if the OpenClaw gateway is reachable. Returns status dict."""
        try:
            await self.connect()
            return {
                "connected": self._connected,
                "ws_url": self.ws_url,
            }
        except Exception as e:
            return {
                "connected": False,
                "ws_url": self.ws_url,
                "error": str(e),
            }

    async def _ensure_connected(self) -> None:
        if not self._connected or not self.ws:
            await self.connect()

    async def _listen(self) -> None:
        try:
            async for raw in self.ws:
                msg = json.loads(raw)
                frame_type = msg.get("type")

                if frame_type == "response":
                    req_id = msg.get("requestId")
                    if req_id in self._pending:
                        self._pending[req_id].set_result(msg)
                elif frame_type == "event":
                    event_name = msg.get("event")
                    for listener in self._event_listeners.get(event_name, []):
                        asyncio.create_task(listener(msg))
        except websockets.exceptions.ConnectionClosed:
            logger.warning("OpenClaw WebSocket connection closed")
            self._connected = False
        except Exception as e:
            logger.error("OpenClaw WebSocket listener error: %s", e)
            self._connected = False

    async def _rpc(self, method: str, params: dict | None = None, timeout: float = 30) -> dict:
        await self._ensure_connected()

        self._request_id += 1
        req_id = self._request_id
        frame: dict = {"type": "request", "requestId": req_id, "method": method}
        if params:
            frame["params"] = params

        loop = asyncio.get_event_loop()
        future = loop.create_future()
        self._pending[req_id] = future

        try:
            await self.ws.send(json.dumps(frame))
        except Exception as e:
            self._pending.pop(req_id, None)
            logger.error("Failed to send RPC '%s': %s", method, e)
            raise ConnectionError(f"Failed to send to OpenClaw: {e}") from e

        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            logger.error("RPC '%s' timed out after %.0fs", method, timeout)
            raise TimeoutError(f"OpenClaw RPC '{method}' timed out after {timeout}s")
        finally:
            self._pending.pop(req_id, None)

    async def send_and_wait(self, session_key: str, message: str, timeout: float = 120) -> AgentResponse:
        await self._ensure_connected()

        response_parts: list[str] = []
        done_event = asyncio.Event()

        async def on_chat(event: dict) -> None:
            data = event.get("data", {})
            if data.get("sessionKey") == session_key:
                if data.get("final"):
                    done_event.set()
                elif data.get("text"):
                    response_parts.append(data["text"])

        self._event_listeners.setdefault("chat", []).append(on_chat)

        try:
            logger.info("Sending message to session '%s' (%d chars)", session_key, len(message))
            await self._rpc("chat.send", {
                "sessionKey": session_key,
                "message": message,
            })

            await asyncio.wait_for(done_event.wait(), timeout=timeout)

            full_text = "".join(response_parts)
            logger.info(
                "Received response from session '%s' (%d chars)",
                session_key,
                len(full_text),
            )
            return AgentResponse(
                text=full_text,
                token_count=len(full_text.split()) * 2,
                cost_usd=0.0,
            )
        except asyncio.TimeoutError:
            logger.error("Agent response timed out for session '%s' after %.0fs", session_key, timeout)
            raise TimeoutError(f"Agent response timed out after {timeout}s")
        finally:
            self._event_listeners["chat"].remove(on_chat)
