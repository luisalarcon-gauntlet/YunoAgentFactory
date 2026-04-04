import logging

from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.services.ws_tickets import create_ticket

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/ws-ticket")
@limiter.limit("5/minute")
async def get_ws_ticket(request: Request) -> dict:
    """Issue a short-lived one-time ticket for WebSocket authentication.

    This endpoint requires Basic auth (enforced by the auth middleware).
    The returned ticket UUID can be used once as ?ticket=<uuid> when
    connecting to a WebSocket endpoint, avoiding credentials in URLs.
    """
    ticket = create_ticket()
    return {"ticket": ticket}
