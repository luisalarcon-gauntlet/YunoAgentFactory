"""Telegram PIN-based authentication.

Manages a set of authorized chat_ids. New users must enter the correct
PIN (from TELEGRAM_ACCESS_PIN env var) before they can use bot commands.
Authorized chat_ids are persisted to a JSON file so they survive restarts.
"""
import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

TELEGRAM_ACCESS_PIN = os.environ.get("TELEGRAM_ACCESS_PIN", "")
_AUTH_FILE = Path("/app/data/telegram_authorized.json")


def _load_authorized() -> set[str]:
    """Load authorized chat_ids from disk."""
    if _AUTH_FILE.exists():
        try:
            data = json.loads(_AUTH_FILE.read_text())
            return set(data)
        except Exception:
            logger.warning("Failed to read telegram auth file, starting fresh")
    return set()


def _save_authorized(chat_ids: set[str]) -> None:
    """Persist authorized chat_ids to disk."""
    _AUTH_FILE.parent.mkdir(parents=True, exist_ok=True)
    _AUTH_FILE.write_text(json.dumps(sorted(chat_ids)))


# In-memory cache, loaded once at import
_authorized_chat_ids: set[str] = _load_authorized()


def is_authorized(chat_id: str) -> bool:
    """Check if a chat_id is authorized."""
    return chat_id in _authorized_chat_ids


def check_pin(chat_id: str, text: str) -> str | None:
    """Check if the text is the correct PIN.

    Returns a response string if the auth layer handled the message
    (either granting access or rejecting the PIN), or None if the
    message should be passed through to normal command handling.
    """
    if not TELEGRAM_ACCESS_PIN:
        # No PIN configured — everyone is allowed
        return None

    if is_authorized(chat_id):
        return None

    # User is not authorized — check if they're entering the PIN
    if text.strip() == TELEGRAM_ACCESS_PIN:
        _authorized_chat_ids.add(chat_id)
        _save_authorized(_authorized_chat_ids)
        logger.info("Telegram chat_id %s authorized via PIN", chat_id)
        return "\u2705 Access granted. You can now use Yuno Agent Factory."

    # Wrong PIN or first message — prompt for PIN
    if text.strip().startswith("/"):
        # They tried a command without being authorized
        return "\U0001f510 Enter your access PIN to use Yuno Agent Factory."

    return "\u274c Invalid PIN. Try again."
