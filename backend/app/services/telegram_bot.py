"""Telegram Bot long-polling service.

Polls the Telegram Bot API for updates and dispatches commands to the
command handler. Runs as a background task during the app lifecycle.
"""
import asyncio
import logging
import os

import httpx

from app.database import async_session_factory
from app.services.telegram_commands import handle_command

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API_BASE = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"
POLL_TIMEOUT = 30  # Long-poll timeout in seconds


class TelegramBot:
    """Long-polling Telegram bot that listens for commands."""

    def __init__(self) -> None:
        self._running = False
        self._task: asyncio.Task | None = None
        self._offset: int = 0

    async def start(self) -> None:
        if not TELEGRAM_BOT_TOKEN:
            logger.info("TELEGRAM_BOT_TOKEN not set, Telegram bot disabled")
            return
        if self._running:
            return

        # Clear any existing webhook so we can use long polling
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{TELEGRAM_API_BASE}/deleteWebhook",
                    json={"drop_pending_updates": False},
                )
                logger.info("deleteWebhook result: %s", resp.json())
        except Exception:
            logger.warning("Failed to delete Telegram webhook, polling may conflict")

        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("Telegram bot polling started")

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Telegram bot polling stopped")

    async def _poll_loop(self) -> None:
        """Main polling loop with exponential backoff on errors."""
        backoff = 1
        async with httpx.AsyncClient(timeout=POLL_TIMEOUT + 10) as client:
            while self._running:
                try:
                    updates = await self._get_updates(client)
                    backoff = 1  # Reset on success

                    for update in updates:
                        update_id = update.get("update_id", 0)
                        self._offset = max(self._offset, update_id + 1)

                        message = update.get("message", {})
                        text = message.get("text", "")
                        chat_id = str(message.get("chat", {}).get("id", ""))

                        if not text or not chat_id:
                            continue

                        user = message.get("from", {})
                        logger.info(
                            "Telegram message from %s (chat_id=%s): %s",
                            user.get("username", user.get("first_name", "?")),
                            chat_id,
                            text[:100],
                        )

                        # Process command in background to not block polling
                        asyncio.create_task(self._handle_message(chat_id, text))

                except asyncio.CancelledError:
                    break
                except Exception:
                    logger.exception("Telegram polling error, retrying in %ds", backoff)
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 30)

    async def _get_updates(self, client: httpx.AsyncClient) -> list[dict]:
        """Fetch new updates from Telegram using long polling."""
        resp = await client.get(
            f"{TELEGRAM_API_BASE}/getUpdates",
            params={
                "offset": self._offset,
                "timeout": POLL_TIMEOUT,
                "allowed_updates": '["message"]',
            },
        )
        data = resp.json()
        if not data.get("ok"):
            logger.error("Telegram getUpdates failed: %s", data)
            return []
        return data.get("result", [])

    async def _handle_message(self, chat_id: str, text: str) -> None:
        """Process an incoming message and reply."""
        try:
            async with async_session_factory() as session:
                response = await handle_command(session, text, chat_id=chat_id)

            await self._send_reply(chat_id, response)
        except Exception:
            logger.exception("Failed to handle Telegram message: %s", text[:100])
            await self._send_reply(chat_id, "An error occurred processing your command.")

    async def _send_reply(self, chat_id: str, text: str) -> None:
        """Send a reply message to a Telegram chat."""
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                await client.post(
                    f"{TELEGRAM_API_BASE}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": text,
                        "parse_mode": "HTML",
                    },
                )
        except Exception:
            logger.exception("Failed to send Telegram reply to %s", chat_id)


# Singleton instance
telegram_bot = TelegramBot()
