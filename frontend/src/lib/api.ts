import { getCredentials, clearCredentials } from "./auth";

const API_URL = import.meta.env.VITE_API_URL || "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const authHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const creds = getCredentials();
  if (creds) {
    authHeaders["Authorization"] = `Basic ${creds}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...authHeaders, ...options?.headers },
  });

  if (res.status === 401) {
    clearCredentials();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const error = await res.text().catch(() => "Request failed");
    throw new Error(`${res.status}: ${error}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Agent types ──

export interface Agent {
  id: string;
  name: string;
  role: string;
  system_prompt: string;
  model: string;
  tools: string[];
  channels: string[];
  schedule: Record<string, unknown> | null;
  memory: Record<string, unknown>;
  skills: string[];
  interaction_rules: Record<string, unknown>;
  guardrails: Record<string, unknown>;
  openclaw_workspace: string | null;
  openclaw_session_key: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export type AgentCreate = Pick<Agent, "name" | "role" | "system_prompt"> &
  Partial<Pick<Agent, "model" | "tools" | "channels" | "schedule" | "memory" | "skills" | "interaction_rules" | "guardrails">>;

// ── Workflow types ──

export interface WorkflowGraph {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type?: string;
    data?: Record<string, unknown>;
  }>;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  is_template: boolean;
  graph: WorkflowGraph;
  max_iterations: number;
  timeout_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowCreate {
  name: string;
  description?: string;
  graph: WorkflowGraph;
  is_template?: boolean;
  max_iterations?: number;
  timeout_seconds?: number;
}

export type WorkflowUpdate = Partial<WorkflowCreate>;

// ── Execution types ──

export interface Execution {
  id: string;
  workflow_id: string;
  status: "pending" | "running" | "completed" | "failed" | "timed_out" | "cancelled";
  current_node_id: string | null;
  iteration_count: number;
  trigger_type: string;
  source: "web" | "telegram";
  source_metadata: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  workflow_name?: string;
}

export interface AgentEvent {
  id: string;
  run_id: string;
  agent_name: string;
  event_type: "started" | "output" | "error" | "completed";
  message: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

export interface ExecutionStep {
  id: string;
  execution_id: string;
  node_id: string;
  agent_id: string;
  agent_name?: string;
  status: "pending" | "running" | "completed" | "failed";
  input_data: string | null;
  output_data: string | null;
  token_count: number;
  cost_usd: number;
  duration_ms: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface WorkspaceFile {
  name: string;
  path: string;
  size: number;
  modified_at: string;
}

export interface AgentMessage {
  id: string;
  execution_id: string;
  from_agent_id: string | null;
  to_agent_id: string | null;
  from_agent_name?: string;
  to_agent_name?: string;
  channel: string;
  content: string;
  message_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── Analytics types ──

export interface OverviewMetrics {
  total_executions: number;
  success_count: number;
  success_rate: number;
  failure_count: number;
  failure_rate: number;
  avg_duration_seconds: number;
  total_tokens: number;
  total_cost_usd: number;
}

export interface ExecutionsPerDay {
  date: string;
  total: number;
  succeeded: number;
  failed: number;
}

export interface ErrorSummaryItem {
  workflow_name: string;
  agent_name: string;
  error_type: string;
  count: number;
  last_occurred: string;
}

export interface WorkflowPerformanceItem {
  workflow_id: string;
  workflow_name: string;
  total_runs: number;
  success_rate: number;
  avg_duration_seconds: number;
  last_run: string | null;
}

// ── Artifact types ──

export interface Artifact {
  id: string;
  name: string;
  type: "application" | "document" | "website" | "code" | "other";
  content: string;
  execution_id: string | null;
  workflow_id: string | null;
  live_url: string | null;
  tags: string[];
  status: "live" | "draft" | "archived";
  created_at: string;
  updated_at: string;
  workflow_name: string | null;
}

export interface ArtifactListItem {
  id: string;
  name: string;
  type: "application" | "document" | "website" | "code" | "other";
  execution_id: string | null;
  workflow_id: string | null;
  live_url: string | null;
  tags: string[];
  status: "live" | "draft" | "archived";
  created_at: string;
  updated_at: string;
  workflow_name: string | null;
}

export type ArtifactCreate = Pick<Artifact, "name" | "type" | "content"> &
  Partial<Pick<Artifact, "execution_id" | "workflow_id" | "live_url" | "tags" | "status">>;

export type ArtifactUpdate = Partial<Pick<Artifact, "name" | "type" | "content" | "live_url" | "tags" | "status">>;

// ── Chat types ──

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SuggestedWorkflow {
  template_id: string | null;
  name: string;
  description: string;
  agents: string[];
}

export interface ChatRecommendResponse {
  message: string;
  suggested_workflow: SuggestedWorkflow | null;
  suggested_action: "use_template" | "create_custom" | null;
}

// ── API client ──

export const api = {
  agents: {
    list: () => request<Agent[]>("/api/v1/agents"),
    get: (id: string) => request<Agent>(`/api/v1/agents/${id}`),
    create: (data: AgentCreate) =>
      request<Agent>("/api/v1/agents", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<AgentCreate>) =>
      request<Agent>(`/api/v1/agents/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/api/v1/agents/${id}`, { method: "DELETE" }),
    workspaceFiles: (id: string) =>
      request<WorkspaceFile[]>(`/api/v1/agents/${id}/workspace/files`),
    workspaceFileContent: (id: string, filepath: string) => {
      const headers: Record<string, string> = {};
      const creds = getCredentials();
      if (creds) headers["Authorization"] = `Basic ${creds}`;
      return fetch(`${API_URL}/api/v1/agents/${id}/workspace/files/${filepath}`, { headers })
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))));
    },
  },

  workflows: {
    list: () => request<Workflow[]>("/api/v1/workflows"),
    get: (id: string) => request<Workflow>(`/api/v1/workflows/${id}`),
    create: (data: WorkflowCreate) =>
      request<Workflow>("/api/v1/workflows", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: WorkflowUpdate) =>
      request<Workflow>(`/api/v1/workflows/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/api/v1/workflows/${id}`, { method: "DELETE" }),
    templates: () => request<Workflow[]>("/api/v1/workflows/templates"),
    cloneTemplate: (templateId: string) =>
      request<Workflow>(`/api/v1/workflows/templates/${templateId}/clone`, { method: "POST" }),
  },

  executions: {
    list: () => request<Execution[]>("/api/v1/executions"),
    get: (id: string) => request<Execution>(`/api/v1/executions/${id}`),
    steps: (id: string) => request<ExecutionStep[]>(`/api/v1/executions/${id}/steps`),
    messages: (id: string) => request<AgentMessage[]>(`/api/v1/executions/${id}/messages`),
    run: (workflowId: string, input?: string) =>
      request<Execution>(`/api/v1/executions`, {
        method: "POST",
        body: JSON.stringify({ workflow_id: workflowId, input }),
      }),
    delete: (id: string) =>
      request<void>(`/api/v1/executions/${id}`, { method: "DELETE" }),
    cancel: (id: string) =>
      request<void>(`/api/v1/executions/${id}/cancel`, { method: "POST" }),
  },

  analytics: {
    overview: (period: string = "7d") =>
      request<OverviewMetrics>(`/api/v1/analytics/overview?period=${period}`),
    executionsOverTime: () =>
      request<ExecutionsPerDay[]>("/api/v1/analytics/executions-over-time"),
    errors: () =>
      request<ErrorSummaryItem[]>("/api/v1/analytics/errors"),
    workflowPerformance: () =>
      request<WorkflowPerformanceItem[]>("/api/v1/analytics/workflow-performance"),
  },

  artifacts: {
    list: (params?: { type?: string; status?: string; tags?: string; search?: string }) => {
      const qs = new URLSearchParams();
      if (params?.type) qs.set("type", params.type);
      if (params?.status) qs.set("status", params.status);
      if (params?.tags) qs.set("tags", params.tags);
      if (params?.search) qs.set("search", params.search);
      const q = qs.toString();
      return request<ArtifactListItem[]>(`/api/v1/artifacts${q ? `?${q}` : ""}`);
    },
    get: (id: string) => request<Artifact>(`/api/v1/artifacts/${id}`),
    create: (data: ArtifactCreate) =>
      request<Artifact>("/api/v1/artifacts", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: ArtifactUpdate) =>
      request<Artifact>(`/api/v1/artifacts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<Artifact>(`/api/v1/artifacts/${id}`, { method: "DELETE" }),
  },

  chat: {
    recommend: (messages: ChatMessage[]) =>
      request<ChatRecommendResponse>("/api/v1/chat/recommend", {
        method: "POST",
        body: JSON.stringify({ messages }),
      }),
  },

  runs: {
    create: (workflowId: string, source: "web" | "telegram" = "web", inputs?: string, sourceMetadata?: Record<string, unknown>) =>
      request<Execution>("/api/v1/runs", {
        method: "POST",
        body: JSON.stringify({ workflow_id: workflowId, source, inputs, source_metadata: sourceMetadata }),
      }),
    list: (workflowId?: string, limit?: number) => {
      const params = new URLSearchParams();
      if (workflowId) params.set("workflow_id", workflowId);
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      return request<Execution[]>(`/api/v1/runs${qs ? `?${qs}` : ""}`);
    },
    get: (id: string) => request<Execution>(`/api/v1/runs/${id}`),
    events: (id: string) => request<AgentEvent[]>(`/api/v1/runs/${id}/events`),
    output: (id: string) => request<{ run_id: string; status: string; output: string }>(`/api/v1/runs/${id}/output`),
  },
};
