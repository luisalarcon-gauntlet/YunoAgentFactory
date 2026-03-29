const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
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
    workspaceFileContent: (id: string, filepath: string) =>
      fetch(`${API_URL}/api/v1/agents/${id}/workspace/files/${filepath}`)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`)))),
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
