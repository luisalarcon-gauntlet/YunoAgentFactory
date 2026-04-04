# UI Functionality Audit Results

**Date:** 2026-04-04
**Scope:** Full frontend + backend feature audit — what works, what doesn't, what's cosmetic

---

## Feature Status Table

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | **Model Selection (dropdown)** | **Broken** | UI shows 5 models (sonnet, opus, haiku, gpt-4o, gpt-4o-mini). The selected model is saved to the DB but **never passed to OpenClaw**. All executions use OpenClaw's global default (`claude-sonnet-4-20250514`) regardless of selection. GPT models are completely non-functional. |
| 2 | **Custom Agent Creation** | **Partial** | Agent is created in DB. `OpenClawSync.sync_agent()` exists but is **never called** from the agent creation endpoint. Custom agents lack workspace files (SOUL.md, MEMORY.md). Execution may still work via implicit OpenClaw session creation, but the agent's system prompt, tools, and personality are not synced to the workspace. |
| 3 | **Custom Agent Update** | **Partial** | Same issue as creation — DB is updated, but workspace files are not re-synced. Changes to system_prompt, tools, etc. have no effect on OpenClaw behavior. |
| 4 | **Custom Workflow Creation** | **Partial** | React Flow builder works for visual editing. Workflows save/load correctly. **No graph validation** — can save workflows referencing deleted agents, with orphan nodes, or invalid edge conditions. Execution will fail at runtime with an opaque error. |
| 5 | **Workflow Execution (Run button)** | **Working** | RunWorkflowModal submits to POST `/api/v1/executions`. Background task starts orchestration engine. Works for seeded template agents. |
| 6 | **Dev Pipeline Template** | **Working** | Seeded on startup. Coder → Reviewer → Deployer flow executes. Rejection loop functions. Agents have pre-configured workspaces. |
| 7 | **Research Pipeline Template** | **Working** | Seeded on startup. Researcher → Analyst → Writer flow executes. Same architecture as Dev Pipeline. |
| 8 | **Template Clone ("Use Template")** | **Working** | Clones workflow via POST `/api/v1/workflows/templates/{id}/clone`, navigates to builder with cloned copy. |
| 9 | **Execution Cancel** | **Broken** | API endpoint exists (`POST /executions/{id}/cancel`) and is defined in `api.ts`, but: (a) **no cancel button exists in the frontend**, (b) the endpoint only updates the DB status — the **orchestration engine never checks** for cancellation during execution and continues running. |
| 10 | **"Open Live App" Button** | **Partial** | Appears only when the last completed step's output contains a URL matching ports 9000–9099. Works when present, but is invisible/absent for most executions. No user-facing documentation of this behavior. |
| 11 | **Telegram Trigger** | **Working** | Bot token configured, long-polling active. `/run`, `/status`, `/output`, `/templates` commands functional. PIN-based auth (`YunoDemo2026`). |
| 12 | **Manual Trigger (Web)** | **Working** | RunWorkflowModal → POST `/api/v1/executions`. Works correctly. |
| 13 | **Live Monitor (WebSocket)** | **Working** | WebSocket at `/ws/monitor` broadcasts step deltas, heartbeats, and completion events. Frontend Zustand store handles real-time updates. |
| 14 | **Monitor Authentication** | **Broken** | WebSocket endpoint has **no authentication**. Any client can connect to `/ws/monitor` and receive all execution events, including streaming agent output. |
| 15 | **Agent "channels" field** | **Cosmetic** | UI allows selecting webchat, telegram, slack, api. Value is stored in DB but **not used** by the orchestration engine or OpenClaw. Channels are display-only badges. |
| 16 | **Agent "skills" field** | **Cosmetic** | Comma-separated input stored in DB. Not synced to OpenClaw workspace. Has no effect on agent behavior. |
| 17 | **Agent "schedule" field** | **Cosmetic** | Toggle + cron string input. Stored in DB. **No scheduler exists** — cron expressions are never evaluated or triggered. |
| 18 | **Agent "memory" toggle** | **Cosmetic** | Toggle stored in DB as a dict. Not synced to OpenClaw. Has no effect on whether agents retain memory across sessions. |
| 19 | **Agent "guardrails" fields** | **Cosmetic** | `max_tokens` and `max_cost_usd` inputs stored in DB. **Not enforced** — orchestration engine does not check token or cost limits during execution. |
| 20 | **Agent status indicator** | **Partial** | Shows idle/running/error via colored dot. Updated by WebSocket events during execution, but resets to "idle" on page reload (status is not persisted). |
| 21 | **Cost tracking** | **Partial** | Tokens and cost are estimated client-side using `len(text) // 4` approximation. Cost always uses sonnet pricing regardless of model selected. Not actual API billing data. |
| 22 | **Download Report button** | **Working** | Generates a styled HTML file with execution steps, conversation, and metadata. |
| 23 | **Dark/Light theme toggle** | **Working** | Persisted to localStorage. Applies correctly. |
| 24 | **Sign Out** | **Working** | Clears sessionStorage credentials, redirects to login. |
| 25 | **Agent Delete** | **Partial** | Deletes from DB. Does **not** clean up OpenClaw workspace files (OpenClawSync.cleanup_agent() exists but is not called). Workflows referencing the deleted agent will break at runtime. |
| 26 | **Execution Delete** | **Working** | Blocks deletion of running executions. Cascades to steps/messages via FK. |
| 27 | **Workflow Delete** | **Working** | Cascades to executions via FK ON DELETE CASCADE. |
| 28 | **Execution Steps timeline** | **Working** | Shows per-step status, output, duration, tokens, cost. Live updates during execution. |
| 29 | **Execution Conversation view** | **Working** | Agent-to-agent conversation bubbles with handoff indicators. |
| 30 | **Execution Events tab** | **Working** | Displays AgentEvent records with timestamps and event types. |
| 31 | **Slack channel option** | **Cosmetic** | Listed in channels dropdown. No Slack integration exists anywhere in the backend. |
| 32 | **API channel option** | **Cosmetic** | Listed in channels dropdown. No dedicated API channel handling exists. |

---

## Prioritized Fix List

Ordered by user-facing impact (highest first):

| Priority | Issue | Impact | Complexity | Details |
|----------|-------|--------|------------|---------|
| **P0** | Model selection not passed to OpenClaw | **High** | Medium | Users select models expecting different behavior/cost. All executions silently use sonnet. GPT models are dead options. Fix: pass model to OpenClaw session config or per-request, remove GPT options. |
| **P0** | Custom agents not synced to OpenClaw | **High** | Small | `OpenClawSync.sync_agent()` is implemented but never called. Users create agents that execute without their configured system prompt or tools. Fix: call sync in agent create/update endpoints. |
| **P1** | No cancel button for running executions | **High** | Medium | Users cannot stop runaway workflows. Backend cancel endpoint only updates DB; engine doesn't check. Fix: add UI button, implement cooperative cancellation in orchestration loop. |
| **P1** | Guardrails not enforced | **High** | Medium | `max_tokens` and `max_cost_usd` are collected but ignored. Users expect safety limits. Fix: check limits in orchestration engine before/after each step. |
| **P1** | Workflow graph not validated | **Medium** | Medium | Saving a workflow with references to deleted agents or invalid structure succeeds, fails only at runtime. Fix: validate graph on save (check agent IDs exist, edges reference valid nodes). |
| **P2** | Agent schedule field non-functional | **Medium** | Large | Cron scheduling UI exists but no scheduler backend. Either implement a scheduler or remove the UI field. |
| **P2** | Agent delete doesn't clean up workspace | **Medium** | Small | Stale workspace files remain. Fix: call `OpenClawSync.cleanup_agent()` in delete endpoint. |
| **P2** | Agent delete doesn't warn about workflow references | **Medium** | Small | Deleting an agent used in workflows silently breaks those workflows. Fix: check for references, warn or cascade. |
| **P2** | WebSocket monitor has no authentication | **Medium** | Small | Anyone can listen to all execution events. Fix: require auth token on WS handshake. |
| **P2** | Cost estimation inaccurate | **Low** | Medium | Uses `len/4` token approximation and always sonnet pricing. Fix: use actual token counts from OpenClaw response, apply per-model pricing. |
| **P3** | Channels field is cosmetic | **Low** | Large | webchat/telegram/slack/api badges are display-only. Either wire up channel routing or remove the field. |
| **P3** | Skills field is cosmetic | **Low** | Medium | Stored but not synced. Fix: include in workspace sync. |
| **P3** | Memory toggle is cosmetic | **Low** | Medium | Stored but not synced. Fix: configure OpenClaw memory per-agent via workspace. |
| **P3** | Slack channel option misleading | **Low** | Small | No Slack integration exists. Fix: remove from options or add "coming soon" label. |
| **P3** | Model default mismatch | **Low** | Small | DB default is `claude-haiku-4-20250514`, Pydantic schema default is `claude-sonnet-4-20250514`. Fix: align defaults. |
| **P3** | Agent status not persisted | **Low** | Small | Status resets on page reload. Fix: persist status in DB or derive from active executions. |

---

## Summary

- **Working features:** 12 (template execution, manual triggers, Telegram bot, live monitor, builder save/load, theme, auth, reports, delete operations)
- **Broken features:** 3 (model selection, execution cancel, WebSocket auth)
- **Partially functional:** 7 (custom agents, custom workflows, "Open Live App", agent status, cost tracking, agent delete, guardrails display)
- **Cosmetic-only fields:** 6 (channels, skills, schedule, memory, guardrails enforcement, Slack option)

The most critical gap is the **model selection → OpenClaw disconnect**: the UI presents model choice as a core feature, but it has zero effect on execution. The second most critical gap is **custom agent sync** — the code to fix it already exists (`OpenClawSync`) but isn't wired into the API endpoints.
