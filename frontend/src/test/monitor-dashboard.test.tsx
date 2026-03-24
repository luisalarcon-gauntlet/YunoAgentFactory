import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MonitorDashboard from "@/components/monitor/MonitorDashboard";

// Mock the monitor store
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();

vi.mock("@/stores/monitor-store", () => ({
  useMonitorStore: (selector: (state: Record<string, unknown>) => unknown) => {
    const state = {
      connect: mockConnect,
      disconnect: mockDisconnect,
      isConnected: false,
      activeExecutions: {},
      agentStatuses: {},
      events: [],
      costSummary: { stepCount: 0, totalTokens: 0, totalCostUsd: 0 },
      clearEvents: vi.fn(),
    };
    return selector(state);
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    agents: {
      list: vi.fn().mockResolvedValue([]),
    },
  },
}));

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

describe("MonitorDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls connect on mount and disconnect on unmount", () => {
    const { unmount } = render(<MonitorDashboard />, { wrapper: createWrapper() });
    expect(mockConnect).toHaveBeenCalledOnce();
    unmount();
    expect(mockDisconnect).toHaveBeenCalledOnce();
  });

  it("renders the Live Monitor heading", () => {
    render(<MonitorDashboard />, { wrapper: createWrapper() });
    expect(screen.getByText("Live Monitor")).toBeInTheDocument();
  });

  it("shows disconnected status indicator", () => {
    render(<MonitorDashboard />, { wrapper: createWrapper() });
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("shows cost tracker cards with zero values", () => {
    render(<MonitorDashboard />, { wrapper: createWrapper() });
    expect(screen.getByText("Active Runs")).toBeInTheDocument();
    expect(screen.getByText("Tokens (session)")).toBeInTheDocument();
    expect(screen.getByText("Cost (session)")).toBeInTheDocument();
  });

  it("shows empty agent status message when no agents", async () => {
    render(<MonitorDashboard />, { wrapper: createWrapper() });
    expect(screen.getByText("No agents configured")).toBeInTheDocument();
  });

  it("shows waiting for events message", () => {
    render(<MonitorDashboard />, { wrapper: createWrapper() });
    expect(screen.getByText("Waiting for events...")).toBeInTheDocument();
  });
});
