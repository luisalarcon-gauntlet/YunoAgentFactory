import base64
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.auth import _check_credentials, _users
from app.services.ws_manager import ws_manager
from app.services.ws_tickets import validate_and_consume_ticket

logger = logging.getLogger(__name__)

router = APIRouter()


def _authenticate_ws(websocket: WebSocket) -> bool:
    """Authenticate WebSocket via ticket (preferred) or Basic auth header."""
    if not _users:
        return True  # Auth explicitly disabled

    # Preferred: one-time ticket from POST /api/v1/auth/ws-ticket
    ticket = websocket.query_params.get("ticket", "")
    if ticket:
        if validate_and_consume_ticket(ticket):
            return True
        logger.warning("Invalid or expired WebSocket ticket")
        return False

    # Fallback: Authorization header (non-browser clients)
    auth_header = websocket.headers.get("authorization", "")
    if auth_header.startswith("Basic "):
        try:
            decoded = base64.b64decode(auth_header[6:]).decode("utf-8")
            username, password = decoded.split(":", 1)
            if _check_credentials(username, password):
                return True
        except Exception:
            pass

    # Legacy: token query param (deprecated — use ticket instead)
    token = websocket.query_params.get("token", "")
    if token:
        try:
            decoded = base64.b64decode(token).decode("utf-8")
            username, password = decoded.split(":", 1)
            if _check_credentials(username, password):
                logger.warning("WebSocket connected with legacy token param — migrate to ticket-based auth")
                return True
        except Exception:
            pass

    return False


@router.websocket("/ws/monitor")
async def monitor_websocket(websocket: WebSocket) -> None:
    if not _authenticate_ws(websocket):
        await websocket.close(code=1008, reason="Unauthorized")
        return

    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
