# CLAUDE.md — Project Rules for Claude Code

> These rules are mandatory. Follow them for every task in this project.

## Project Context

This is the **Yuno AI Agent Orchestration Platform** — a hiring partner project for Yuno (a16z-backed payment orchestration fintech). The full implementation spec is in `yuno-agent-platform-spec.md`. Read it before starting any work.

---

## Rule 1: Everything Runs in Docker

**No exceptions. Nothing runs on the host machine.**

### Development Environment
- All services (OpenClaw, FastAPI backend, PostgreSQL, React frontend) run as Docker containers via `docker-compose.yml`
- Never install project dependencies on the host. Use `docker compose exec <service> <command>` to run commands inside containers.
- Never use `pip install` or `npm install` directly on the host. All dependencies are installed inside container builds via Dockerfiles.
- The entire project must boot with a single `docker compose up --build` command. If it doesn't, it's broken.

### Backend Container (FastAPI)
- Base image: `python:3.12-slim`
- Install dependencies via `requirements.txt` in the Dockerfile
- Run with `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` in dev
- Health check endpoint: `GET /health`
- Database migrations run on container startup via an entrypoint script

### Frontend Container (React)
- Base image: `node:20-alpine`
- Install dependencies via `package.json` in the Dockerfile
- Dev mode: `npm run dev -- --host 0.0.0.0 --port 3000`
- Production: build static assets and serve with `nginx` or `serve`

### PostgreSQL Container
- Image: `postgres:16-alpine`
- Data persisted via a named Docker volume (`pgdata`)
- Health check: `pg_isready`

### OpenClaw Container
- Image: `ghcr.io/openclaw/openclaw:latest` (pin to a specific version tag once stable)
- Config and workspace mounted as volumes from `./openclaw-data/`
- Health check on port 18789

### Test Containers
- Backend tests run inside the backend container: `docker compose exec backend pytest tests/ -v`
- Frontend tests run inside the frontend container: `docker compose exec frontend npx vitest run`
- Integration tests that need the full stack use `docker compose -f docker-compose.test.yml up --abort-on-container-exit`

### Docker Rules
- Every Dockerfile must have a `.dockerignore` to exclude `node_modules/`, `__pycache__/`, `.git/`, `.env`
- Use multi-stage builds where appropriate (especially frontend: build stage → nginx serve stage)
- All inter-container communication uses Docker's internal DNS (service names), NOT `localhost`
  - Backend connects to Postgres at `postgres:5432`, not `localhost:5432`
  - Backend connects to OpenClaw at `openclaw:18789`, not `localhost:18789`
- Environment variables are the configuration mechanism. Use `.env` file loaded by Docker Compose.
- Never hardcode ports, hosts, or credentials. Always read from environment variables.

---

## Rule 2: AI Test-Driven Development (AI TDD)

**Write tests FIRST. Then write the implementation to make them pass. This is non-negotiable.**

AI TDD prevents the failure mode where you write implementation and then generate tests that merely confirm what the code already does. Tests written after the fact verify behavior, not requirements.

### The Cycle: Red → Green → Refactor

For every feature, function, endpoint, or component:

1. **RED — Write a failing test first**
   - The test encodes the requirement: what should happen given specific inputs
   - Run the test. It MUST fail. If it passes, the test is wrong or the feature already exists.
   - Commit the failing test with message: `test: add failing test for <feature>`

2. **GREEN — Write the minimum code to pass the test**
   - Implement only what the failing test demands. No extra features. No premature abstractions.
   - Run the test. It must pass.
   - Run ALL existing tests. None should break.
   - Commit with message: `feat: implement <feature> to pass tests`

3. **REFACTOR — Clean up while keeping tests green**
   - Improve code structure, naming, DRY violations
   - Run all tests after every refactoring change
   - Commit with message: `refactor: clean up <what was improved>`

### Practical AI TDD Workflow for This Project

#### Backend (pytest)

For every new endpoint or service method:

```
Step 1: Write the test in tests/
Step 2: Run `docker compose exec backend pytest tests/test_<module>.py -v`
Step 3: Confirm it fails (RED)
Step 4: Write the implementation in app/
Step 5: Run the test again, confirm it passes (GREEN)
Step 6: Run full suite: `docker compose exec backend pytest tests/ -v`
Step 7: Refactor if needed, re-run tests
```

Example — adding the `POST /api/v1/agents` endpoint:

```python
# FIRST: Write this test (RED)
# tests/test_agents.py
async def test_create_agent(client, db_session):
    payload = {
        "name": "Test Coder",
        "role": "Writes code",
        "system_prompt": "You are a coder.",
        "model": "claude-sonnet-4-20250514",
        "tools": ["shell"],
        "channels": ["webchat"],
    }
    response = await client.post("/api/v1/agents", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Coder"
    assert "id" in data

# Run it — it fails because the endpoint doesn't exist yet (RED ✓)
# THEN: Implement the endpoint in app/routers/agents.py (GREEN)
# THEN: Run all tests, refactor if needed
```

#### Frontend (Vitest + React Testing Library)

For every new component or page:

```
Step 1: Write the test in tests/ or __tests__/
Step 2: Run `docker compose exec frontend npx vitest run <test_file>`
Step 3: Confirm it fails (RED)
Step 4: Build the component
Step 5: Run the test again (GREEN)
Step 6: Run full suite: `docker compose exec frontend npx vitest run`
```

#### Orchestration Engine

The orchestration engine is the most critical code. Test it rigorously:

```python
# FIRST: Write these tests with a mock OpenClaw client
# tests/test_orchestration.py

async def test_linear_workflow_execution(mock_openclaw, db_session):
    """A→B→C workflow should execute all three agents in order."""
    # Set up mock to return predetermined responses
    mock_openclaw.send_and_wait.side_effect = [
        AgentResponse(text="Code output from A", token_count=100, cost_usd=0.01),
        AgentResponse(text="APPROVED: Looks good", token_count=50, cost_usd=0.005),
        AgentResponse(text="Deployed successfully", token_count=30, cost_usd=0.003),
    ]

    engine = OrchestrationEngine(db_session, mock_openclaw, mock_ws_manager)
    execution_id = await engine.run_workflow(workflow_id, initial_input="Build a todo app")

    execution = await db_session.get(WorkflowExecution, execution_id)
    assert execution.status == "completed"

    steps = await get_execution_steps(db_session, execution_id)
    assert len(steps) == 3
    assert all(s.status == "completed" for s in steps)

async def test_feedback_loop_workflow(mock_openclaw, db_session):
    """Reviewer rejects → loops back to Coder → Reviewer approves → Deployer runs."""
    mock_openclaw.send_and_wait.side_effect = [
        AgentResponse(text="First attempt code", token_count=100, cost_usd=0.01),
        AgentResponse(text="REJECTED: Missing error handling", token_count=80, cost_usd=0.008),
        AgentResponse(text="Revised code with error handling", token_count=120, cost_usd=0.012),
        AgentResponse(text="APPROVED: Looks great now", token_count=50, cost_usd=0.005),
        AgentResponse(text="Deployed successfully", token_count=30, cost_usd=0.003),
    ]

    engine = OrchestrationEngine(db_session, mock_openclaw, mock_ws_manager)
    execution_id = await engine.run_workflow(feedback_workflow_id, initial_input="Build email validator")

    execution = await db_session.get(WorkflowExecution, execution_id)
    assert execution.status == "completed"
    assert execution.iteration_count >= 4  # Went through the loop

async def test_max_iterations_safety(mock_openclaw, db_session):
    """Workflow that always rejects should stop at max_iterations."""
    mock_openclaw.send_and_wait.return_value = AgentResponse(
        text="REJECTED: Still not right", token_count=50, cost_usd=0.005
    )

    engine = OrchestrationEngine(db_session, mock_openclaw, mock_ws_manager)
    execution_id = await engine.run_workflow(feedback_workflow_id, initial_input="Impossible task")

    execution = await db_session.get(WorkflowExecution, execution_id)
    assert execution.status == "timed_out"
    assert "max iterations" in execution.error_message.lower()

# THEN: Implement OrchestrationEngine to pass all these tests
```

### Anti-Patterns — DO NOT DO THESE

❌ **Never write implementation first and tests second.**
The test becomes a mirror of the implementation, not a specification of requirements.

❌ **Never write a test that tests implementation details.**
Test behavior (given input X, expect output Y), not internal method calls or data structures.

❌ **Never write one giant test for multiple behaviors.**
One test, one behavior. Name tests descriptively: `test_rejected_review_loops_back_to_coder`.

❌ **Never skip the RED phase.**
If you write a test and it passes immediately, either the feature already exists or your test is wrong. Investigate before proceeding.

❌ **Never leave broken tests.**
If you change implementation and a test breaks, fix the test OR fix the implementation. Never comment out or delete a failing test without replacing it.

❌ **Never mock what you own.**
Mock external boundaries (OpenClaw WebSocket, Telegram API). Don't mock your own service classes — test them through the API layer.

### Test File Naming and Organization

```
backend/tests/
├── conftest.py                    # Shared fixtures: test DB, test client, mock OpenClaw
├── test_agents.py                 # Agent CRUD endpoint tests
├── test_workflows.py              # Workflow CRUD endpoint tests
├── test_orchestration.py          # Orchestration engine unit tests
├── test_messages.py               # Message trail and delivery tests
├── test_edge_evaluation.py        # Edge condition matching tests
└── integration/
    └── test_openclaw_integration.py  # Requires running OpenClaw container

frontend/src/tests/ (or __tests__/)
├── workflow-builder.test.tsx      # React Flow canvas interactions
├── agent-form.test.tsx            # Form validation
├── execution-viewer.test.tsx      # Step timeline and message rendering
└── monitor-dashboard.test.tsx     # WebSocket event handling
```

### Test Fixtures (conftest.py)

```python
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from unittest.mock import AsyncMock
from app.main import app
from app.database import get_db, Base
from app.services.openclaw_client import OpenClawWSClient

TEST_DATABASE_URL = "postgresql+asyncpg://platform:devpassword@postgres:5432/agentplatform_test"

@pytest_asyncio.fixture
async def db_engine():
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest_asyncio.fixture
async def db_session(db_engine):
    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session

@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
def mock_openclaw():
    mock = AsyncMock(spec=OpenClawWSClient)
    mock.connect = AsyncMock()
    mock.send_and_wait = AsyncMock()
    return mock

@pytest.fixture
def mock_ws_manager():
    mock = AsyncMock()
    mock.broadcast = AsyncMock()
    return mock
```

---

## Rule 3: Code Quality Standards

### Python (Backend)
- Python 3.12+
- Type hints on all function signatures
- Async/await for all database and WebSocket operations
- Pydantic v2 for all request/response schemas
- SQLAlchemy 2.0 async ORM style
- Format with `ruff format`, lint with `ruff check`
- No `print()` statements — use `logging` module

### TypeScript (Frontend)
- TypeScript strict mode enabled
- All API response types defined as interfaces
- No `any` types — use proper typing
- React functional components only, no class components
- Use React Query for all API calls — no raw `fetch` in components
- Use Zustand for global state (WebSocket events, live monitor data)
- Format with Prettier, lint with ESLint

---

## Rule 3b: Git Workflow — Commit After Every Feature

**This project is a git repo. Initialize it first. Commit after every meaningful unit of work.**

### Repository Setup

The very first thing you do before writing any code:

```bash
git init
git add .gitignore
git commit -m "chore: initialize repository"
```

Create a `.gitignore` immediately:

```
# Dependencies
node_modules/
__pycache__/
*.pyc
.venv/

# Environment
.env
.env.local

# Docker
openclaw-data/config/
openclaw-data/workspace/

# IDE
.vscode/
.idea/
*.swp

# Build artifacts
dist/
build/
*.egg-info/

# Database
pgdata/

# OS
.DS_Store
Thumbs.db
```

### Commit Convention

Use **conventional commits** with a clear scope:

```
<type>(<scope>): <short description>

Types:
  chore:    — project setup, config, dependencies, docker
  test:     — adding or updating tests (RED phase)
  feat:     — new feature implementation (GREEN phase)
  refactor: — code improvement without behavior change
  fix:      — bug fix
  docs:     — documentation, README
  style:    — formatting, linting (no logic change)

Scopes:
  docker, backend, frontend, db, agents, workflows, orchestration,
  openclaw, monitor, telegram, templates, tests
```

### When to Commit — The Rule

**Commit after every single completed unit of work. A "unit" is one of:**

- A new file or config that works (docker-compose, Dockerfile, etc.)
- A failing test (RED phase — commit the test alone)
- Implementation that makes the test pass (GREEN phase)
- A refactoring pass with all tests still green
- A new UI component or page that renders
- A new API endpoint that responds
- A bug fix

**Never batch multiple features into one commit.** If you built the Agent model AND the Agent router AND the Agent tests, that is 3+ commits, not 1.

**Never commit broken code.** Before every commit, verify:
- `docker compose up --build` still works (for infra changes)
- Relevant tests pass (for code changes)

### Commit Map — Every Step Gets a Commit

This is the exact sequence of commits for the project. Follow this order.

```
Phase 1: Foundation
──────────────────
 1. chore(docker): initialize repo with .gitignore
 2. chore(docker): add docker-compose.yml with all 4 services
 3. chore(docker): add backend Dockerfile and requirements.txt
 4. chore(docker): add frontend Dockerfile and package.json
 5. chore(docker): add setup.sh and .env.example
 6. feat(backend): add FastAPI app skeleton with health check and CORS
 7. feat(db): add SQLAlchemy models for all 5 tables
 8. chore(db): add Alembic config and initial migration
 9. chore(docker): add entrypoint.sh that runs migrations on startup
10. test(agents): add failing tests for agent CRUD endpoints
11. feat(agents): implement agent CRUD endpoints to pass tests
12. refactor(agents): clean up agent router and schemas
13. feat(frontend): initialize React + Vite + Tailwind + shadcn/ui
14. feat(frontend): add app shell with sidebar and routing
15. feat(frontend): add agents list page with API integration

Phase 2: Core Engine
────────────────────
16. test(openclaw): add failing tests for OpenClaw WS client (mocked)
17. feat(openclaw): implement OpenClaw WebSocket client
18. test(openclaw-sync): add failing tests for agent config sync
19. feat(openclaw-sync): implement agent → OpenClaw workspace sync
20. test(orchestration): add failing tests for linear workflow execution
21. test(orchestration): add failing tests for feedback loop execution
22. test(orchestration): add failing tests for max iterations safety
23. test(orchestration): add failing tests for edge condition evaluation
24. feat(orchestration): implement OrchestrationEngine to pass all tests
25. refactor(orchestration): clean up engine, extract helpers
26. test(workflows): add failing tests for workflow CRUD endpoints
27. feat(workflows): implement workflow CRUD endpoints to pass tests
28. test(monitor): add failing tests for WebSocket monitor
29. feat(monitor): implement WebSocket monitor endpoint with event broadcasting

Phase 3: UI/UX
───────────────
30. feat(frontend): add React Flow workflow builder canvas
31. feat(frontend): add custom AgentNode and ConditionEdge components
32. feat(frontend): add node config panel and agent palette
33. feat(frontend): add workflow save/load with backend integration
34. feat(frontend): add execution detail view with step timeline
35. feat(frontend): add message trail component
36. feat(frontend): add live monitor dashboard with WebSocket
37. feat(frontend): add agent creation/edit form with all config fields
38. feat(frontend): add templates page with clone functionality

Phase 4: Integration + Demo
────────────────────────────
39. feat(telegram): configure OpenClaw Telegram channel
40. feat(templates): seed dev pipeline and research pipeline templates
41. test(e2e): add integration test for full workflow execution
42. feat(demo): verify end-to-end Telegram conversation works
43. docs: record demo video and add link to README

Phase 5: Polish
───────────────
44. fix(backend): add comprehensive error handling to all endpoints
45. feat(frontend): add loading states, error states, empty states
46. test(frontend): add Vitest tests for critical components
47. docs: write full README with architecture, setup, and justification
48. refactor: final code cleanup and lint pass
49. chore: final docker compose verification — single command boot
```

### How to Actually Commit

After completing each unit of work:

```bash
# Stage the relevant files (not everything blindly)
git add backend/app/models/agent.py backend/app/models/__init__.py

# Commit with a descriptive conventional commit message
git commit -m "feat(db): add SQLAlchemy models for all 5 tables

- agents table with all config dimensions (schedule, memory, skills, guardrails)
- workflows table with JSONB graph storage
- workflow_executions table with status tracking
- execution_steps table with per-node execution trace
- agent_messages table for inter-agent message trail"

# For test commits (RED phase), stage only the test file
git add backend/tests/test_agents.py
git commit -m "test(agents): add failing tests for agent CRUD endpoints"

# For implementation commits (GREEN phase), stage only the implementation
git add backend/app/routers/agents.py backend/app/schemas/agent.py
git commit -m "feat(agents): implement agent CRUD endpoints to pass tests"
```

**Use `git add <specific files>`, not `git add .`** — this keeps commits clean and atomic. Only add the files that belong to that commit.

**Write commit bodies for non-trivial commits.** The first line is a summary. Add a blank line and bullet points for details when the change is substantial.

---

## Rule 4: Implementation Order

Follow the phased build order from the spec AND the commit map above. Do NOT skip ahead. Each numbered item in the commit map is a discrete task that ends with a commit.

---

## Rule 5: Running Commands

Always run commands inside Docker containers:

```bash
# Backend tests
docker compose exec backend pytest tests/ -v --tb=short

# Single backend test file
docker compose exec backend pytest tests/test_agents.py -v

# Backend migrations
docker compose exec backend alembic upgrade head

# Create new migration
docker compose exec backend alembic revision --autogenerate -m "description"

# Frontend tests
docker compose exec frontend npx vitest run

# Frontend lint
docker compose exec frontend npx eslint src/ --ext .ts,.tsx

# View OpenClaw logs
docker compose logs openclaw -f --tail 50

# Access OpenClaw CLI
docker compose exec openclaw openclaw status

# Database shell
docker compose exec postgres psql -U platform -d agentplatform

# Rebuild a single service
docker compose up --build backend -d

# Full rebuild
docker compose down && docker compose up --build -d
```

---

## Rule 6: Error Handling

- Every API endpoint must have try/except with proper HTTP error codes
- Use FastAPI's `HTTPException` with descriptive messages
- Log errors with full traceback at `ERROR` level
- The orchestration engine must never crash silently — failed workflows must be marked as `failed` in the database with an error message
- Frontend must show loading states, error states, and empty states for every data-fetching component
- WebSocket reconnection logic: auto-reconnect with exponential backoff on disconnect

---

## Rule 7: OpenClaw Integration Boundaries

- **Your code does NOT run inside OpenClaw.** You communicate with it via WebSocket RPC.
- **Agent config sync is one-way**: your DB is the source of truth. On agent create/update, write SOUL.md, MEMORY.md, and skill files to the mounted OpenClaw workspace volume.
- **Session management**: create one OpenClaw session per agent. Store the session key in the agents table.
- **Never modify OpenClaw's core config** (`openclaw.json`) programmatically unless absolutely necessary. Channel setup (Telegram) is done once during initial setup, not by your application code.
- **Mock OpenClaw in unit tests.** Only use a real OpenClaw instance in integration tests.

---

## Rule 8: Dark Theme

The frontend uses a dark theme. Yuno's brand is dark/modern.

- Use shadcn/ui with dark mode as default
- Set `darkMode: "class"` in Tailwind config
- Add `class="dark"` to the `<html>` tag
- Use shadcn/ui's semantic color variables (`bg-background`, `text-foreground`, `bg-card`, etc.)
- Accent color: blue-ish (similar to Yuno's brand — `hsl(220, 70%, 50%)`)
- No white backgrounds anywhere
