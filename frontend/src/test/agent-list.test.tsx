import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AgentList from "@/components/agents/AgentList";

// Mock the api module
vi.mock("@/lib/api", () => ({
  api: {
    agents: {
      list: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { api } from "@/lib/api";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

const mockAgents = [
  {
    id: "agent-1",
    name: "Coder",
    role: "Writes code",
    system_prompt: "You are a coder",
    model: "claude-sonnet-4-20250514",
    tools: ["shell", "file_read"],
    channels: ["webchat"],
    schedule: null,
    memory: {},
    skills: [],
    interaction_rules: {},
    guardrails: {},
    openclaw_workspace: null,
    openclaw_session_key: null,
    status: "idle",
    created_at: "2026-03-24T00:00:00Z",
    updated_at: "2026-03-24T00:00:00Z",
  },
  {
    id: "agent-2",
    name: "Reviewer",
    role: "Reviews code",
    system_prompt: "You are a reviewer",
    model: "claude-sonnet-4-20250514",
    tools: ["file_read"],
    channels: ["webchat"],
    schedule: null,
    memory: {},
    skills: [],
    interaction_rules: {},
    guardrails: {},
    openclaw_workspace: null,
    openclaw_session_key: null,
    status: "idle",
    created_at: "2026-03-24T00:00:00Z",
    updated_at: "2026-03-24T00:00:00Z",
  },
];

describe("AgentList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeleton while fetching", () => {
    vi.mocked(api.agents.list).mockReturnValue(new Promise(() => {})); // Never resolves
    render(<AgentList onEdit={vi.fn()} />, { wrapper: createWrapper() });
    // Skeleton cards should be visible (animate-pulse class)
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows error state when fetch fails", async () => {
    vi.mocked(api.agents.list).mockRejectedValue(new Error("Network error"));
    render(<AgentList onEdit={vi.fn()} />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText(/failed to load agents/i)).toBeInTheDocument();
    });
  });

  it("shows empty state when no agents exist", async () => {
    vi.mocked(api.agents.list).mockResolvedValue([]);
    render(<AgentList onEdit={vi.fn()} />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText(/no agents yet/i)).toBeInTheDocument();
    });
  });

  it("renders agent cards when agents are loaded", async () => {
    vi.mocked(api.agents.list).mockResolvedValue(mockAgents);
    render(<AgentList onEdit={vi.fn()} />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText("Coder")).toBeInTheDocument();
      expect(screen.getByText("Reviewer")).toBeInTheDocument();
    });
  });
});
