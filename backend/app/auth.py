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
OPEN_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}


def _check_credentials(username: str, password: str) -> bool:
    if not _users:
        return True  # No users configured = auth disabled
    expected = _users.get(username)
    if expected is None:
        return False
    return secrets.compare_digest(password, expected)


class BasicAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip auth for health check, docs, and WebSocket upgrades
        if request.url.path in OPEN_PATHS:
            return await call_next(request)
        if request.url.path.startswith("/ws/"):
            return await call_next(request)

        # If no users configured, skip auth entirely
        if not _users:
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Basic "):
            try:
                decoded = base64.b64decode(auth_header[6:]).decode("utf-8")
                username, password = decoded.split(":", 1)
                if _check_credentials(username, password):
                    return await call_next(request)
            except Exception:
                pass

        return Response(
            status_code=401,
            content="Unauthorized",
            headers={"WWW-Authenticate": 'Basic realm="Yuno Agent Factory"'},
        )
