"""Short-lived one-time WebSocket authentication tickets.

Instead of passing credentials as URL query parameters (which leak into logs),
clients call POST /api/v1/auth/ws-ticket to obtain a one-time UUID ticket,
then connect to the WebSocket with ?ticket=<uuid>.
"""
import logging
import time
import uuid
from threading import Lock

logger = logging.getLogger(__name__)

# Ticket store: {ticket_uuid: expiry_timestamp}
_tickets: dict[str, float] = {}
_lock = Lock()

TICKET_TTL_SECONDS = 30


def create_ticket() -> str:
    """Create a new ticket that expires in TICKET_TTL_SECONDS."""
    ticket = str(uuid.uuid4())
    expiry = time.time() + TICKET_TTL_SECONDS
    with _lock:
        # Purge expired tickets while we're here
        now = time.time()
        expired = [k for k, v in _tickets.items() if v < now]
        for k in expired:
            del _tickets[k]
        _tickets[ticket] = expiry
    return ticket


def validate_and_consume_ticket(ticket: str) -> bool:
    """Validate a ticket. Returns True if valid, and invalidates it on first use."""
    with _lock:
        expiry = _tickets.pop(ticket, None)
    if expiry is None:
        return False
    if time.time() > expiry:
        return False
    return True
