import base64
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.auth import _check_credentials, _users
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter()


def _authenticate_ws(websocket: WebSocket) -> bool:
    """Check Basic auth from Authorization header or 'token' query parameter."""
    if not _users:
        return True  # No users configured — auth disabled

    # Try Authorization header
    auth_header = websocket.headers.get("authorization", "")
    if auth_header.startswith("Basic "):
        try:
            decoded = base64.b64decode(auth_header[6:]).decode("utf-8")
            username, password = decoded.split(":", 1)
            if _check_credentials(username, password):
                return True
        except Exception:
            pass

    # Try query parameter (for browser WebSocket which can't set headers)
    token = websocket.query_params.get("token", "")
    if token:
        try:
            decoded = base64.b64decode(token).decode("utf-8")
            username, password = decoded.split(":", 1)
            if _check_credentials(username, password):
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
