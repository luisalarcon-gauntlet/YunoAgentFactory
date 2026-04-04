# Security Audit Report

**Date:** 2026-04-04
**Scope:** Full codebase — backend, frontend, Docker infrastructure, secrets management
**Status:** Audit only — no changes made

---

## Critical

### S-01: Docker Socket Mounted into OpenClaw Container

**File:** `docker-compose.yml:13-14`
```yaml
- /var/run/docker.sock:/var/run/docker.sock
- /usr/bin/docker:/usr/bin/docker:ro
```

The OpenClaw container has direct access to the host's Docker daemon. Any code execution vulnerability in OpenClaw (which is an LLM-driven agent runtime that executes shell commands) gives an attacker full control over all containers and the host filesystem.

**Impact:** Container escape, host compromise, lateral movement to all services.
**Status:** Acknowledged — required for deployment pipeline. OpenClaw agents build and run Docker containers. Comment added to docker-compose.yml documenting the risk.
**Original Fix Suggestion:** Remove the Docker socket mount. If OpenClaw needs container management, use a restricted Docker-in-Docker sidecar or a socket proxy like `tecnativa/docker-socket-proxy` with read-only permissions.

---

### S-02: CORS Allows All Origins with Credentials

**File:** `backend/app/main.py:44-50`
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Wildcard origins + `allow_credentials=True` enables any website to make authenticated cross-origin requests to the API. A malicious page visited by an authenticated user can exfiltrate data or trigger workflow executions.

**Impact:** CSRF-style attacks, data exfiltration from authenticated sessions.
**Fix:** Replace `allow_origins=["*"]` with specific origins: `[f"http://{HOST_IP}:3001", "http://localhost:3001"]`. Read from env var.

---

### S-03: OpenClaw Gateway Security Explicitly Disabled

**File:** `openclaw-entrypoint.sh:26-28`
```javascript
config.gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback = true;
config.gateway.controlUi.dangerouslyDisableDeviceAuth = true;
config.gateway.controlUi.allowInsecureAuth = true;
```

All three flags are named "dangerous" by the OpenClaw team for a reason. Device auth is disabled, insecure auth is allowed, and host header injection is possible.

**Impact:** Unauthorized access to the OpenClaw dashboard and agent control. Combined with S-01, this is a full compromise chain.
**Fix:** Enable device auth. Remove `dangerouslyAllowHostHeaderOriginFallback`. Set `allowInsecureAuth = false` and configure proper TLS.

---

### S-04: Gemini API Key Hardcoded in Tracked Config File

**File:** `openclaw-data/config/openclaw.json:19`
```json
"apiKey": "AIzaSyBJb4ria9trFSBhC0O5THIvRFoD2TITtzc"
```

While `openclaw-data/config/` is in `.gitignore`, the file exists on disk with a live Google API key embedded. The entrypoint script (`openclaw-entrypoint.sh:61`) writes it from `$GEMINI_API_KEY`, but the result persists in the config file and could be leaked via backup, log, or debug endpoint.

**Impact:** API key compromise if config file is exposed.
**Fix:** Ensure OpenClaw reads the key from environment at runtime rather than persisting it to disk. If persistence is required, restrict file permissions to 0600.

---

## High

### S-05: WebSocket Endpoint Bypasses Auth Middleware

**File:** `backend/app/auth.py:37-38`
```python
if request.url.path.startswith("/ws/"):
    return await call_next(request)
```

The BasicAuth middleware explicitly skips all WebSocket paths. While `backend/app/websocket/monitor.py:14-41` implements its own auth check, the middleware bypass means any future WebSocket endpoint will be unauthenticated by default.

**Impact:** Any new `/ws/*` route is silently unauthenticated.
**Fix:** Remove the blanket `/ws/` bypass. Let each WebSocket handler perform its own auth (as monitor.py already does), but don't skip the middleware — instead, have the middleware detect WebSocket upgrades and delegate.

---

### S-06: Auth Credentials Passed as URL Query Parameter

**File:** `backend/app/websocket/monitor.py:30-39`
```python
token = websocket.query_params.get("token", "")
decoded = base64.b64decode(token).decode("utf-8")
username, password = decoded.split(":", 1)
```

**File:** `frontend/src/lib/ws.ts:57-66`
```typescript
return `${this.url}${separator}token=${encodeURIComponent(token)}`;
```

Base64-encoded credentials are passed as a URL query parameter. URLs are logged in server access logs, browser history, proxy logs, and monitoring tools.

**Impact:** Credential exposure in logs and browser history.
**Fix:** Use a short-lived auth ticket: client calls `POST /api/v1/auth/ws-ticket` (authenticated), gets a one-time token, passes that as the query parameter. Backend validates and invalidates the ticket on first use.

---

### S-07: No Rate Limiting on Any Endpoint

**Files:** All routers in `backend/app/routers/`

No rate limiting middleware (e.g., SlowAPI) is configured. The login endpoint, workflow trigger endpoint, and all CRUD endpoints accept unlimited requests.

**Impact:** Brute-force credential guessing, resource exhaustion, cost amplification via repeated workflow executions (each triggers LLM API calls).
**Fix:** Add `slowapi` to `requirements.txt`. Apply per-IP rate limits: 5/min on auth-related, 30/min on CRUD, 10/min on workflow execution triggers.

---

### S-08: Auth Disabled When ADMIN_USERS Is Empty

**File:** `backend/app/auth.py:24-25`
```python
def _check_credentials(username: str, password: str) -> bool:
    if not _users:
        return True  # No users configured = auth disabled
```

If the `ADMIN_USERS` env var is empty or unset, authentication is completely disabled. The docker-compose default is `${ADMIN_USERS:-}` (empty string).

**Impact:** Unauthenticated access to all endpoints if env var is misconfigured.
**Fix:** Fail closed. If `ADMIN_USERS` is empty, refuse to start or require an explicit `AUTH_DISABLED=true` flag.

---

### S-09: Containers Run as Root

**Files:** `backend/Dockerfile`, `frontend/Dockerfile`

Neither Dockerfile contains a `USER` directive. Both containers run as root, which means a container breakout gives root on the host.

**Impact:** Privilege escalation on container escape.
**Fix:** Add non-root users:
```dockerfile
# Backend
RUN adduser --disabled-password --no-create-home appuser
USER appuser

# Frontend
USER node
```

---

### S-10: PostgreSQL Port Exposed to Host

**File:** `docker-compose.yml:34-35`
```yaml
ports:
  - "${POSTGRES_PORT:-5434}:5432"
```

The database port is mapped to the host. Combined with weak default credentials (`devpassword`), this allows direct database access from the network.

**Impact:** Direct database access, data exfiltration, data manipulation.
**Fix:** Remove the `ports:` mapping. Backend connects via Docker internal DNS (`postgres:5432`). Use `docker compose exec postgres psql` for admin access.

---

### S-11: Admin Credentials Weak and Shared via Env Var

**File:** `.env:26`
```
ADMIN_USERS=simon:YunoDemo2026,luis:YunoAdmin2026
```

Passwords are predictable (company name + year). Stored in plaintext in `.env`. Parsed as plaintext strings in memory (`backend/app/auth.py:12-17`).

**Impact:** Easy credential guessing. If `.env` leaks, immediate full access.
**Fix:** Use bcrypt-hashed passwords in the env var. Hash at parse time in `auth.py`. Use a password manager to generate strong passwords.

---

### S-12: Debug Endpoints Leak System Information

**File:** `backend/app/routers/executions.py:267-331`

`/api/v1/debug/openclaw-status` and `/api/v1/debug/openclaw` return OpenClaw server version, protocol details, session lists, agent lists, and raw exception messages (`str(e)` on line 297).

**Impact:** Information disclosure useful for reconnaissance.
**Fix:** Gate behind an additional admin-only check or environment flag (`DEBUG_ENDPOINTS_ENABLED=true`). Sanitize error messages.

---

### S-13: .env File World-Readable

**Permissions:** `664 (rw-rw-r--)` — readable by any user on the host.

**Impact:** Any local user or compromised process can read all API keys and credentials.
**Fix:** `chmod 600 .env`

---

## Medium

### S-14: No Security Headers

**File:** `backend/app/main.py`

No middleware for security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`, `X-XSS-Protection`.

**Fix:** Add a security headers middleware or use `starlette-securehead`.

---

### S-15: Path Traversal via Symlinks

**File:** `backend/app/routers/agents.py:229-231`
```python
full_path = os.path.normpath(os.path.join(workspace_dir, filepath))
if not full_path.startswith(os.path.normpath(workspace_dir)):
```

`normpath` handles `../` but not symlinks. An attacker who can place a symlink in the workspace (OpenClaw agents write to this directory) could read arbitrary files.

**Fix:** Use `os.path.realpath()` to resolve symlinks before the boundary check.

---

### S-16: No Input Length Validation on String Fields

**Files:** `backend/app/schemas/agent.py`, `backend/app/schemas/workflow.py`, `backend/app/schemas/run.py`

No `max_length` or `min_length` constraints on `name`, `role`, `system_prompt`, `description`, `input` fields.

**Impact:** Oversized payloads, potential memory exhaustion.
**Fix:** Add Pydantic field constraints: `name: str = Field(min_length=1, max_length=200)`, `system_prompt: str = Field(max_length=50000)`, etc.

---

### S-17: No Request Body Size Limit

**File:** `backend/entrypoint.sh`

Uvicorn is started without `--limit-max-request-size`. Default is 1MB which is reasonable, but JSONB workflow graphs could be large.

**Fix:** Explicitly set `--limit-max-request-size 5242880` (5MB) in entrypoint.

---

### S-18: WebSocket Connection Has No Max Message Count or Duration

**File:** `backend/app/websocket/monitor.py:51-55`
```python
while True:
    await websocket.receive_text()
```

A client can hold a WebSocket connection indefinitely. No timeout, no max idle, no max messages.

**Fix:** Add idle timeout and max connection duration. Disconnect stale clients.

---

### S-19: Failed Auth Attempts Not Logged

**File:** `backend/app/auth.py:51-52`
```python
except Exception:
    pass
```

Failed login attempts are silently swallowed. No logging of IP, username, or failure reason.

**Fix:** Add `logger.warning("Auth failed for user=%s ip=%s", username, request.client.host)`.

---

### S-20: Telegram PIN Stored in Plaintext JSON

**File:** `backend/app/services/telegram_auth.py:15`
```python
_AUTH_FILE = Path("/app/data/telegram_authorized.json")
```

Authorized Telegram chat IDs stored in plain JSON on the filesystem. The `TELEGRAM_ACCESS_PIN` itself is just a simple string comparison.

**Fix:** Store authorized chat IDs in the database. Consider rate-limiting PIN attempts.

---

### S-21: Hardcoded Default Database Password in Code

**File:** `backend/app/config.py:5`
```python
database_url: str = "postgresql+asyncpg://platform:devpassword@postgres:5432/agentplatform"
```

The default value exposes the dev password in source code.

**Fix:** Remove the default value. Require `DATABASE_URL` to be set via environment.

---

### S-22: OpenAPI/Swagger UI Accessible Without Auth

**File:** `backend/app/auth.py:20`
```python
OPEN_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}
```

The API documentation endpoints are publicly accessible, revealing all endpoint signatures, schemas, and descriptions.

**Fix:** Remove `/docs`, `/openapi.json`, `/redoc` from `OPEN_PATHS` in production. Or gate behind `DOCS_ENABLED` env var.

---

### S-23: Host Filesystem Path Mounted into OpenClaw

**File:** `docker-compose.yml:12`
```yaml
- /var/www/deployments:/deployments
```

A host directory is writable by the OpenClaw container. Agent-executed code can read/write to `/var/www/deployments`.

**Fix:** Make read-only (`:ro`) or remove if not needed.

---

## Low

### S-24: Frontend Vite Dev Server Binds 0.0.0.0

**File:** `frontend/Dockerfile` — dev mode binds all interfaces.

In development only. Not a production concern if properly firewalled.

---

### S-25: No Audit Logging

No record of who created, modified, or deleted agents/workflows. Basic Auth doesn't track user identity beyond authentication.

**Fix:** Log mutation events with username from auth header.

---

### S-26: Session Storage for Credentials (Frontend)

**File:** `frontend/src/lib/auth.ts:8`
```typescript
sessionStorage.setItem(AUTH_KEY, btoa(`${username}:${password}`));
```

Credentials stored in sessionStorage are accessible to any XSS payload. Base64 is not encryption.

**Fix:** For the current Basic Auth scheme, this is inherent. Long-term: migrate to JWT with HTTP-only cookies.

---

## Quick Wins (< 30 min each)

| # | Fix | Est. Time |
|---|-----|-----------|
| 1 | `chmod 600 .env` | 1 min |
| 2 | Restrict CORS origins to specific frontend URL | 5 min |
| 3 | Remove `/docs`, `/openapi.json`, `/redoc` from `OPEN_PATHS` (or gate behind env var) | 5 min |
| 4 | Remove PostgreSQL `ports:` mapping from docker-compose | 2 min |
| 5 | Add `USER` directives to Dockerfiles | 10 min |
| 6 | Log failed auth attempts in `auth.py` | 10 min |
| 7 | Remove default password from `config.py` | 5 min |
| 8 | Add `max_length` to Pydantic string fields | 15 min |
| 9 | Make `/var/www/deployments` mount read-only | 1 min |
| 10 | Fail closed when `ADMIN_USERS` is empty (require explicit opt-out) | 15 min |
| 11 | Use `os.path.realpath()` in workspace file endpoint | 5 min |
| 12 | Add `DEBUG_ENDPOINTS_ENABLED` env var check to debug routes | 10 min |
