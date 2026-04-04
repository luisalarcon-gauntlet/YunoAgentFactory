# Tech Debt Audit Report

**Date:** 2026-04-04
**Scope:** Backend, frontend, Docker infrastructure, test coverage

---

## 1. Performance

### T-01: N+1 Queries in List Endpoints (HIGH)

Multiple list endpoints execute one additional query per row to resolve foreign key names.

**`backend/app/routers/executions.py:80-86`** — `list_executions()`
```python
for ex in executions:
    resp = ExecutionResponse.model_validate(ex)
    wf = await db.get(Workflow, ex.workflow_id)  # +1 query per execution
```

**`backend/app/routers/executions.py:167-172`** — `get_execution_steps()`
```python
for step in steps:
    agent = await db.get(Agent, step.agent_id)  # +1 query per step
```

**`backend/app/routers/executions.py:200-207`** — `get_execution_messages()`
```python
for msg in messages:
    from_agent = await db.get(Agent, msg.from_agent_id)  # +1 per message
    to_agent = await db.get(Agent, msg.to_agent_id)       # +2 per message
```

**`backend/app/routers/runs.py:124-134`** — `list_runs()`
Same pattern as `list_executions`.

**Fix:** Use SQLAlchemy `selectinload()` or `joinedload()`, or do a single batch query for all referenced IDs.
**Effort:** 2-3 hours

---

### T-02: Missing Pagination on List Endpoints (HIGH)

Three endpoints return unbounded result sets:

| Endpoint | File | Line |
|----------|------|------|
| `GET /api/v1/agents` | `backend/app/routers/agents.py` | 38-45 |
| `GET /api/v1/workflows` | `backend/app/routers/workflows.py` | ~85 |
| `GET /api/v1/executions` | `backend/app/routers/executions.py` | 70-90 |

`GET /api/v1/runs` already has a `limit` parameter (good).

**Fix:** Add `limit: int = 50, offset: int = 0` query parameters. Apply `.limit(limit).offset(offset)` to queries.
**Effort:** 1-2 hours

---

### T-03: Missing Database Indexes (MEDIUM)

**File:** `backend/alembic/versions/8573fcab806c_initial_schema_with_all_5_tables.py`

Existing indexes:
- `idx_execution_steps_execution` on `execution_steps.execution_id`
- `idx_agent_messages_execution` on `agent_messages.execution_id`

Missing indexes:
- `workflow_executions.workflow_id` — used in every execution list query
- `workflow_executions.status` — used for filtering running/pending executions
- `agent_messages.from_agent_id` — used in message resolution
- `agent_messages.to_agent_id` — used in message resolution
- `execution_steps.agent_id` — used in step name resolution

**Fix:** Create an Alembic migration adding these indexes.
**Effort:** 30 min

---

### T-04: Unbounded Workflow Scan in Agent Deletion (MEDIUM)

**File:** `backend/app/routers/agents.py:122-131`
```python
result = await db.execute(select(Workflow))
workflows = result.scalars().all()  # loads ALL workflows
for wf in workflows:
    graph = wf.graph or {}
    for node in graph.get("nodes", []):
        if node.get("data", {}).get("agent_id") == agent_id_str:
```

Loads every workflow and scans every node to check if the agent is referenced. O(workflows * nodes).

**Fix:** Use a PostgreSQL JSONB containment query or maintain a reverse-index table.
**Effort:** 1-2 hours

---

### T-05: Frontend Monitor Store Event Log Unbounded (MEDIUM)

**File:** `frontend/src/stores/monitor-store.ts`

The `events: MonitorEvent[]` array grows indefinitely. Long-running monitor sessions accumulate thousands of events.

**Fix:** Cap at a max length (e.g., 500 events). Shift old events when limit is reached.
**Effort:** 15 min

---

### T-06: Workspace File Scanning Without Pagination (LOW)

**File:** `backend/app/routers/agents.py:174-197`

`_scan_workspace_files()` walks the entire workspace directory tree. Large workspaces (e.g., coder agents with `node_modules`) could return thousands of files.

**Fix:** Add a file count limit (e.g., 200) and depth limit to `os.walk`.
**Effort:** 30 min

---

## 2. Code Duplication

### T-07: Duplicate Background Workflow Runner (MEDIUM)

**Files:**
- `backend/app/routers/executions.py:41-67` — `_run_workflow_background()`
- `backend/app/routers/runs.py:31-70` — `_run_workflow_background()`

Both are near-identical implementations of the same background workflow execution logic.

**Fix:** Extract to a shared function in `backend/app/services/workflow_runner.py`.
**Effort:** 30 min

---

### T-08: Repeated Workflow Name Resolution Pattern (LOW)

The pattern of fetching a workflow/agent name by ID after loading the main entity is repeated in 6+ places across `executions.py` and `runs.py`.

**Fix:** Add a utility function or use SQLAlchemy relationship loading.
**Effort:** 1 hour (overlaps with T-01 fix)

---

## 3. Error Handling

### T-09: Broad `except Exception` Blocks (MEDIUM)

Every endpoint handler wraps its entire body in `except Exception`. Examples:

- `backend/app/routers/agents.py:43,64,79,108,150`
- `backend/app/routers/executions.py:88,125,145,176,212,235,259`
- `backend/app/routers/workflows.py:~90,110,123,150,165,192,209`
- `backend/app/routers/runs.py:~58,107,135,156,180,213`

While these prevent 500 crashes and include proper logging, they mask unexpected errors (e.g., `TypeError` from a code bug looks the same as a DB timeout).

**Fix:** Catch specific exceptions where possible (`SQLAlchemyError`, `ValidationError`). Keep the broad catch as a last resort with a different error message.
**Effort:** 2-3 hours

---

### T-10: WebSocket Silent Message Drop (LOW)

**File:** `frontend/src/lib/ws.ts:84-91`
```typescript
try {
    const data = JSON.parse(event.data) as MonitorEvent;
    ...
} catch {
    // Ignore malformed messages
}
```

Malformed WebSocket messages are silently dropped. No logging, no counter.

**Fix:** Add `console.warn` or increment a dropped-message counter.
**Effort:** 5 min

---

### T-11: No Top-Level Error Boundary in React (MEDIUM)

**File:** `frontend/src/main.tsx` and `frontend/src/App.tsx`

Only `ExecutionErrorBoundary` exists (`frontend/src/components/executions/ExecutionErrorBoundary.tsx`). If any other page/component throws, the entire app goes blank.

**Fix:** Wrap `<App />` in a top-level error boundary with a "something went wrong" fallback.
**Effort:** 30 min

---

## 4. Test Coverage Gaps

### T-12: Untested Backend Endpoints (HIGH)

| Endpoint | Status |
|----------|--------|
| `GET /api/v1/executions` | No dedicated test |
| `GET /api/v1/executions/{id}/steps` | No test |
| `GET /api/v1/executions/{id}/messages` | No test |
| `DELETE /api/v1/executions/{id}` | No test |
| `POST /api/v1/executions/{id}/cancel` | No test |
| `GET /api/v1/agents/{id}/workspace/files` | No test |
| `GET /api/v1/agents/{id}/workspace/files/{path}` | No test |
| `GET /api/v1/debug/openclaw-status` | No test |
| `GET /api/v1/debug/openclaw` | No test |
| `GET /api/v1/workflows/templates` | No test |
| `POST /api/v1/workflows/templates/{id}/clone` | Minimal |

**Effort:** 4-6 hours for full coverage

---

### T-13: Untested Frontend Components (HIGH)

**Tested (4):** AgentList, ExecutionList, MonitorDashboard, StepTimeline

**Untested (27+):**
- All pages: LoginPage, AgentsPage, WorkflowBuilderPage, TemplatesPage, ExecutionsPage, MonitorPage
- Workflow components: WorkflowCanvas, AgentNode, ConditionEdge, AgentPalette, NodeConfigPanel, RunWorkflowModal
- Execution components: ExecutionDetail, ExecutionErrorBoundary, StepDetailModal, MessageTrail
- Monitor components: ActiveRunsPanel, AgentStatusGrid, CostTracker, LiveEventFeed, RecentRunsList
- Libraries: api.ts, auth.ts, ws.ts, export-report.ts, monitor-store.ts

**Effort:** 8-12 hours for critical path coverage

---

### T-14: No Tests for Auth Middleware (HIGH)

**File:** `backend/app/auth.py`

The BasicAuth middleware has no dedicated tests. Key behaviors untested:
- Auth bypass when `ADMIN_USERS` is empty
- `OPEN_PATHS` bypass
- WebSocket path bypass
- Invalid Base64 handling
- Timing-safe comparison

**Effort:** 2 hours

---

### T-15: No Tests for Telegram Services (MEDIUM)

**Files:** `backend/app/services/telegram_bot.py`, `telegram_auth.py`, `telegram_commands.py`, `telegram_notify.py`

Four service files with zero test coverage.

**Effort:** 3-4 hours

---

## 5. Configuration

### T-16: Frontend VITE_API_URL and VITE_WS_URL Empty in Docker Compose (HIGH)

**File:** `docker-compose.yml:83-84`
```yaml
VITE_API_URL: ""
VITE_WS_URL: ""
```

Empty strings mean the frontend falls back to `window.location.origin` for API calls and constructs WebSocket URLs from the current host. This works by accident when the frontend proxies through the same host, but breaks in any split-host deployment.

**Fix:** Set explicit values: `VITE_API_URL: "http://${HOST_IP:-localhost}:${BACKEND_PORT:-8001}"`.
**Effort:** 15 min

---

### T-17: Dev-Mode Reload in Entrypoint (LOW)

**File:** `backend/entrypoint.sh:8`
```bash
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The `--reload` flag is always enabled. Fine for development, but should be conditional for production.

**Fix:** Use `${UVICORN_RELOAD:---reload}` or similar env-based toggling.
**Effort:** 10 min

---

### T-18: No Environment Distinction (dev/staging/prod) (MEDIUM)

**File:** `backend/app/config.py`

No `environment` field. All settings use the same defaults regardless of deployment context. Debug endpoints, Swagger UI, CORS wildcards, and reload mode are all active everywhere.

**Fix:** Add `environment: str = "development"` to Settings. Gate debug features behind `environment != "production"`.
**Effort:** 1 hour

---

## 6. Dead Code

### T-19: Minimal Dead Code Found (LOW)

No significant dead code, commented-out blocks, or unused imports were found. The codebase is clean in this regard.

Only notable item: `backend/alembic/env.py:11` imports all models with `# noqa: F401` — this is intentional for SQLAlchemy metadata discovery.

---

## Prioritized Backlog

### Tier 1 — Do Now (high impact, low effort)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| T-03 | Add missing database indexes | 30 min | Performance |
| T-05 | Cap monitor store event log | 15 min | Memory |
| T-07 | Extract shared workflow runner | 30 min | Maintainability |
| T-11 | Add top-level React error boundary | 30 min | Reliability |
| T-16 | Set explicit frontend env vars | 15 min | Correctness |
| T-10 | Log dropped WebSocket messages | 5 min | Observability |

### Tier 2 — Do Soon (high impact, moderate effort)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| T-01 | Fix N+1 queries | 2-3 hrs | Performance |
| T-02 | Add pagination to list endpoints | 1-2 hrs | Performance |
| T-12 | Write missing backend endpoint tests | 4-6 hrs | Quality |
| T-14 | Write auth middleware tests | 2 hrs | Security |
| T-18 | Add environment-based config | 1 hr | Operations |

### Tier 3 — Do When Able (moderate impact)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| T-09 | Narrow exception handling | 2-3 hrs | Debuggability |
| T-04 | Optimize agent deletion workflow check | 1-2 hrs | Performance |
| T-13 | Write missing frontend component tests | 8-12 hrs | Quality |
| T-15 | Write Telegram service tests | 3-4 hrs | Quality |
| T-06 | Limit workspace file scanning | 30 min | Performance |

### Tier 4 — Nice to Have

| # | Item | Effort | Impact |
|---|------|--------|--------|
| T-08 | DRY up name resolution pattern | 1 hr | Readability |
| T-17 | Conditional uvicorn reload | 10 min | Operations |
