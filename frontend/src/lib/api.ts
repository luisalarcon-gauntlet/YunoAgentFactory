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
  },
};
