# Yuno AI Agent Orchestration Platform

A visual platform for configuring, orchestrating, and monitoring multi-agent AI workflows. Built as a hiring partner project for **Yuno** (a16z-backed payment orchestration fintech). Think of agent workflows the way Yuno thinks of payment flows: configurable, observable, reliable, and recoverable.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (User)                           │
│                                                                 │
│   React (Vite) + Tailwind + shadcn/ui + React Flow             │
│   - Login / Basic Auth                                          │
│   - Agent CRUD UI                                               │
│   - Visual Workflow Builder (node graph)                        │
│   - Live Monitoring Dashboard                                   │
│   - Execution History & Message Trail Viewer                    │
│                                                                 │
│   Connects to backend via:                                      │
│     REST  → http://<host>:8000/api/v1/...                       │
│     WS    → ws://<host>:8000/ws/monitor                         │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ HTTP REST + WebSocket
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND (FastAPI + Python)                     │
│                   Port 8000                                     │
│                                                                 │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│   │  REST API    │  │  WS Manager  │  │  Orchestration       │  │
│   │  (CRUD,      │  │  (push live  │  │  Engine              │  │
│   │   triggers)  │  │   events to  │  │  (workflow executor,  │  │
│   │              │  │   frontend)  │  │   agent-to-agent     │  │
│   │  Basic Auth  │  │              │  │   message routing,   │  │
│   │  Middleware   │  │              │  │   condition eval,    │  │
│   │              │  │              │  │   retry/loop logic)  │  │
│   └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│   Connects to:                                                  │
│     Postgres    → postgresql://postgres:5432/agentplatform       │
│     OpenClaw GW → ws://openclaw:18789 (Gateway WebSocket RPC)   │
│                                                                 │
└──────────┬──────────────────┬───────────────────────────────────┘
           │                  │
           ▼                  ▼
┌──────────────────┐  ┌──────────────────────────────────────────┐
│   PostgreSQL     │  │          OpenClaw Gateway                 │
│   Port 5432      │  │          Port 18789                      │
│                  │  │                                          │
│   Tables:        │  │   - Agent runtime (LLM loop)            │
│   - agents       │  │   - Session management                  │
│   - workflows    │  │   - Tool execution (shell, browser, fs) │
│   - workflow_    │  │   - Skill system (SKILL.md)             │
│     executions   │  │   - Memory (MEMORY.md)                  │
│   - execution_   │  │   - Cron/Heartbeat scheduler            │
│     steps        │  │   - Channel adapters:                   │
│   - agent_       │  │       Telegram ◄──► Telegram Bot API    │
│     messages     │  │       WebChat (built-in)                │
│                  │  │   - WebSocket RPC protocol               │
└──────────────────┘  └──────────────────────────────────────────┘
```

### Component Descriptions

**Frontend (React + Vite)** — Single-page application with a dark-themed UI built on shadcn/ui components. Features a drag-and-drop workflow builder powered by React Flow, real-time monitoring via WebSocket, and a complete agent management interface. Includes Basic Auth login flow and route guards. Zustand manages global state for live events.

**Backend (FastAPI)** — Async Python API that handles agent and workflow CRUD, triggers workflow executions through the orchestration engine, and pushes real-time events to connected frontends via WebSocket. Protected by Basic Auth middleware with configurable admin users. All database operations use SQLAlchemy 2.0 async ORM with Pydantic v2 schemas.

**Orchestration Engine** — The core runtime. Traverses workflow graphs node-by-node, dispatches work to agents via OpenClaw's WebSocket RPC, evaluates edge conditions (approved/rejected/contains/always), manages feedback loops, enforces max-iteration safety limits, and persists every step and inter-agent message for full audit trails.

**PostgreSQL** — Persistent storage for agent configurations (10+ configurable dimensions), workflow graph definitions (JSONB), execution history with per-step traces, and the complete inter-agent message trail.

**OpenClaw Gateway** — The AI agent runtime. Each agent gets its own workspace with SOUL.md (personality), MEMORY.md (context), and SKILL.md files. OpenClaw handles LLM inference, tool execution (shell, file I/O, browser), and external channel adapters (Telegram, WebChat).

### Communication Protocols

| From → To | Protocol | Purpose |
|---|---|---|
| Frontend → Backend | REST (HTTP) | CRUD operations, trigger workflow runs |
| Frontend → Backend | WebSocket | Real-time monitoring (agent status, logs, messages) |
| Backend → Postgres | SQLAlchemy async | Persist workflows, executions, messages |
| Backend → OpenClaw | WebSocket (RPC) | Send messages to agents, read sessions, manage config |
| OpenClaw → Telegram | Telegram Bot API | External human-agent chat |
| OpenClaw → LLM | HTTPS | Model inference (Anthropic/OpenAI API) |

## Runtime Choice: OpenClaw

### Why OpenClaw over Goose/OpenCode

- **Native multi-channel messaging**: Supports 20+ platforms out of the box (Telegram, Slack, Discord, WebChat, etc.) — no custom adapter code needed
- **Built-in memory, skills, and scheduler**: Agents get persistent memory (MEMORY.md), composable skills (SKILL.md), and cron-based scheduling without building these systems from scratch
- **WebSocket RPC gateway**: Programmatic control over agent sessions, configuration, and message routing via a documented WebSocket protocol
- **Markdown-based agent configuration**: SOUL.md personality files are human-readable and version-controllable, making agent behavior transparent and auditable

### Tradeoffs Acknowledged

- **Heavier footprint** than Goose or OpenCode — OpenClaw is a full-featured gateway, not a minimal SDK
- **Designed as personal assistant** — multi-agent orchestration is our added layer on top of OpenClaw's single-agent runtime
- **Rapidly evolving project** — we pin to a stable Docker image tag to avoid breaking changes

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) + TypeScript + Tailwind CSS + shadcn/ui + React Flow |
| Backend | FastAPI + SQLAlchemy 2.0 + asyncpg + Pydantic v2 |
| Database | PostgreSQL 16 |
| Auth | Basic Auth (backend middleware + frontend login page) |
| Agent Runtime | OpenClaw (Docker) |
| External Channel | Telegram |
| Containerization | Docker Compose (4 services) |

## Setup Instructions

### Prerequisites

- Docker and Docker Compose installed
- An Anthropic API key (for agent LLM inference)
- (Optional) A Telegram bot token from @BotFather

### Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/luisalarcon-gauntlet/YunoAgentFactory.git
cd YunoAgentFactory

# 2. Copy environment config
cp .env.example .env

# 3. Edit .env with your API keys
#    Required: ANTHROPIC_API_KEY
#    Optional: TELEGRAM_BOT_TOKEN
#    Optional: ADMIN_USERS=user1:pass1,user2:pass2 (enables Basic Auth)

# 4. Start everything
./setup.sh
# or manually:
docker compose up --build -d

# 5. Access the platform
#    Frontend:  http://localhost:3000
#    Backend:   http://localhost:8000
#    API docs:  http://localhost:8000/docs
#    OpenClaw:  http://localhost:18789
```

The backend automatically seeds two workflow templates (Dev Pipeline, Research Pipeline) on first startup.

### Authentication

The platform supports optional Basic Auth. Set the `ADMIN_USERS` environment variable to enable it:

```bash
# In .env
ADMIN_USERS=admin:secretpassword,user2:anotherpass
```

When `ADMIN_USERS` is set, the frontend shows a login page and all API requests require credentials. When unset, auth is disabled and the platform is open.

### Running Tests

```bash
# Backend tests
docker compose exec backend pytest tests/ -v --tb=short

# Frontend tests
docker compose exec frontend npx vitest run

# Integration tests (full stack)
docker compose -f docker-compose.test.yml up --abort-on-container-exit
```

## Telegram Integration Setup

Telegram allows users to chat with agents via their phone.

### Step 1: Create a Bot with BotFather

1. Open Telegram and search for `@BotFather`
2. Send `/newbot`
3. Choose a name (e.g., "Yuno Agent Bot")
4. Choose a username (must end in `bot`, e.g., `yuno_agent_bot`)
5. BotFather gives you a **bot token** — copy it

### Step 2: Configure the Token

```bash
# Add to your .env file
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

### Step 3: Restart OpenClaw

```bash
docker compose restart openclaw
```

OpenClaw reads the token on startup and connects to Telegram via long-polling.

### Step 4: Pair Your Account

1. Open Telegram and message your bot (send any message)
2. OpenClaw generates a pairing code — check its logs:
   ```bash
   docker compose logs openclaw -f --tail 20
   ```
3. Approve the pairing:
   ```bash
   docker compose exec openclaw openclaw pairing approve telegram <PAIRING_CODE>
   ```

### Step 5: Assign an Agent to Telegram

1. In the platform UI, create or edit an agent
2. Add `telegram` to the agent's **Channels** field
3. Save — OpenClaw routes Telegram messages to that agent's workspace/session

## Adding a New Workflow Template

1. **Create agents** via the API (`POST /api/v1/agents`) or the Agents page in the UI
2. **Define the graph JSON** — nodes (one per agent) and edges (with conditions: `always`, `approved`, `rejected`, `contains:<keyword>`, `default`):
   ```json
   {
     "nodes": [
       {
         "id": "node-1",
         "type": "agentNode",
         "position": { "x": 100, "y": 120 },
         "data": {
           "label": "Agent Name",
           "role": "Agent role description",
           "agent_id": "<uuid>",
           "config": { "task_instruction": "What the agent should do" }
         }
       }
     ],
     "edges": [
       {
         "id": "edge-1",
         "source": "node-1",
         "target": "node-2",
         "type": "conditionEdge",
         "data": { "condition": "always", "label": "Next step" }
       }
     ]
   }
   ```
3. **Create the workflow** with `is_template: true`:
   ```bash
   curl -X POST http://localhost:8000/api/v1/workflows \
     -H "Content-Type: application/json" \
     -d '{"name": "My Template", "graph": {...}, "is_template": true}'
   ```
4. The template appears on the **Templates** page — users can clone and customize it

## Key Metrics

| Metric | Value |
|---|---|
| Configurable dimensions per agent | 11 (name, role, prompt, model, tools, channels, schedule, memory, skills, interaction_rules, guardrails) |
| Time from zero to working workflow | < 5 minutes with templates |
| Agent-to-agent message reliability | 100% (persisted, with delivery confirmation) |
| Workflow execution observability | Full step-by-step trace with timing, tokens, and cost |
| Real-time monitoring latency | < 100ms (WebSocket push) |

## Project Structure

```
YunoAgentFactory/
├── docker-compose.yml          # All 4 services
├── setup.sh                    # One-command bootstrap
├── .env.example                # Environment template
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── entrypoint.sh           # Runs migrations on startup
│   ├── alembic/                # Database migrations
│   ├── app/
│   │   ├── main.py             # FastAPI app with lifespan, CORS
│   │   ├── auth.py             # Basic Auth middleware
│   │   ├── config.py           # Settings from env vars
│   │   ├── database.py         # Async engine + session factory
│   │   ├── seed.py             # Template seeding on startup
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   ├── routers/            # API endpoints (agents, workflows, executions)
│   │   ├── services/           # Business logic (orchestration, OpenClaw client, Telegram)
│   │   └── websocket/          # WebSocket monitor endpoint
│   └── tests/                  # pytest + pytest-asyncio test suite
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── components/         # React components (workflow builder, agents, monitor)
│   │   │   ├── ui/             # shadcn/ui base components
│   │   │   ├── executions/     # Execution detail, step timeline, step modal
│   │   │   ├── layout/         # Sidebar navigation
│   │   │   ├── AuthGuard.tsx   # Route protection
│   │   │   └── ...
│   │   ├── pages/              # Route-level pages (login, agents, workflows, monitor)
│   │   ├── stores/             # Zustand state management
│   │   └── lib/                # API client, WebSocket client, auth utilities
│
└── openclaw-data/
    ├── config/                 # OpenClaw configuration
    └── workspace/              # Agent workspaces (SOUL.md, MEMORY.md, SKILL.md)
```
