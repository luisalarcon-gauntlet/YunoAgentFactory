import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ExecutionList from "@/components/executions/ExecutionList";

vi.mock("@/lib/api", () => ({
  api: {
    executions: {
      list: vi.fn(),
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

const mockExecutions = [
  {
    id: "exec-1",
    workflow_id: "wf-1",
    status: "completed" as const,
    current_node_id: null,
    iteration_count: 3,
    trigger_type: "manual",
    started_at: "2026-03-24T00:00:00Z",
    completed_at: "2026-03-24T00:01:00Z",
    error_message: null,
    created_at: "2026-03-24T00:00:00Z",
    workflow_name: "Dev Pipeline",
  },
  {
    id: "exec-2",
    workflow_id: "wf-2",
    status: "failed" as const,
    current_node_id: null,
    iteration_count: 1,
    trigger_type: "manual",
    started_at: "2026-03-24T00:00:00Z",
    completed_at: "2026-03-24T00:00:30Z",
    error_message: "Agent timeout",
    created_at: "2026-03-24T00:00:00Z",
    workflow_name: "Research Pipeline",
  },
];

describe("ExecutionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeleton while fetching", () => {
    vi.mocked(api.executions.list).mockReturnValue(new Promise(() => {}));
    render(<ExecutionList onSelect={vi.fn()} />, { wrapper: createWrapper() });
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows error state when fetch fails", async () => {
    vi.mocked(api.executions.list).mockRejectedValue(new Error("Server error"));
    render(<ExecutionList onSelect={vi.fn()} />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText(/failed to load executions/i)).toBeInTheDocument();
    });
  });

  it("shows empty state when no executions exist", async () => {
    vi.mocked(api.executions.list).mockResolvedValue([]);
    render(<ExecutionList onSelect={vi.fn()} />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText(/no executions yet/i)).toBeInTheDocument();
    });
  });

  it("renders execution items with status badges", async () => {
    vi.mocked(api.executions.list).mockResolvedValue(mockExecutions);
    render(<ExecutionList onSelect={vi.fn()} />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText("Dev Pipeline")).toBeInTheDocument();
      expect(screen.getByText("Research Pipeline")).toBeInTheDocument();
      expect(screen.getByText("completed")).toBeInTheDocument();
      expect(screen.getByText("failed")).toBeInTheDocument();
    });
  });
});
