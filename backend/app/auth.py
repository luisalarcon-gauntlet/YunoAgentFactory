import base64
import logging
import os
import secrets

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# Parse ADMIN_USERS env var: "user1:pass1,user2:pass2"
_users: dict[str, str] = {}
for entry in os.environ.get("ADMIN_USERS", "").split(","):
    entry = entry.strip()
    if ":" in entry:
        u, p = entry.split(":", 1)
        _users[u] = p

# Paths that don't require auth
OPEN_PATHS = {"/health"}

# Fail closed: if no admin users are configured, require explicit opt-out
_auth_disabled = os.environ.get("AUTH_DISABLED", "false").lower() == "true"
if not _users and not _auth_disabled:
    logger.critical(
        "ADMIN_USERS is empty and AUTH_DISABLED is not set to 'true'. "
        "Set ADMIN_USERS or explicitly set AUTH_DISABLED=true to start without auth."
    )
    raise SystemExit(
        "FATAL: ADMIN_USERS is empty. Set ADMIN_USERS or AUTH_DISABLED=true."
    )


def _check_credentials(username: str, password: str) -> bool:
    if not _users:
        return True  # Auth explicitly disabled via AUTH_DISABLED=true
    expected = _users.get(username)
    if expected is None:
        return False
    return secrets.compare_digest(password, expected)


class BasicAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip auth for health check
        if request.url.path in OPEN_PATHS:
            return await call_next(request)

        # WebSocket endpoints handle their own auth (see websocket/monitor.py)
        if request.headers.get("upgrade", "").lower() == "websocket":
            return await call_next(request)

        # If no users configured (AUTH_DISABLED=true), skip auth entirely
        if not _users:
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Basic "):
            try:
                decoded = base64.b64decode(auth_header[6:]).decode("utf-8")
                username, password = decoded.split(":", 1)
                if _check_credentials(username, password):
                    return await call_next(request)
                else:
                    client_ip = request.client.host if request.client else "unknown"
                    logger.warning(
                        "Auth failed for user=%s ip=%s path=%s",
                        username, client_ip, request.url.path,
                    )
            except Exception:
                client_ip = request.client.host if request.client else "unknown"
                logger.warning(
                    "Auth failed (malformed credentials) ip=%s path=%s",
                    client_ip, request.url.path,
                )

        return Response(
            status_code=401,
            content="Unauthorized",
            headers={"WWW-Authenticate": 'Basic realm="Yuno Agent Factory"'},
        )
