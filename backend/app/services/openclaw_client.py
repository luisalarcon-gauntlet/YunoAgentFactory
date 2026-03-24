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

    async def connect(self) -> None:
        self.ws = await websockets.connect(
            f"{self.ws_url}?token={self.auth_token}"
        )
        asyncio.create_task(self._listen())
        logger.info("Connected to OpenClaw gateway at %s", self.ws_url)

    async def disconnect(self) -> None:
        if self.ws:
            await self.ws.close()
            self.ws = None

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
        except Exception as e:
            logger.error("OpenClaw WebSocket listener error: %s", e)

    async def _rpc(self, method: str, params: dict | None = None, timeout: float = 30) -> dict:
        self._request_id += 1
        req_id = self._request_id
        frame: dict = {"type": "request", "requestId": req_id, "method": method}
        if params:
            frame["params"] = params

        loop = asyncio.get_event_loop()
        future = loop.create_future()
        self._pending[req_id] = future

        await self.ws.send(json.dumps(frame))

        try:
            return await asyncio.wait_for(future, timeout=timeout)
        finally:
            self._pending.pop(req_id, None)

    async def send_and_wait(self, session_key: str, message: str, timeout: float = 120) -> AgentResponse:
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
            await self._rpc("chat.send", {
                "sessionKey": session_key,
                "message": message,
            })

            await asyncio.wait_for(done_event.wait(), timeout=timeout)

            full_text = "".join(response_parts)
            return AgentResponse(
                text=full_text,
                token_count=len(full_text.split()) * 2,
                cost_usd=0.0,
            )
        finally:
            self._event_listeners["chat"].remove(on_chat)
