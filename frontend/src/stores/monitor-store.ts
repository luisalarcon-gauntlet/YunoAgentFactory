import { create } from "zustand";
import { wsClient, type MonitorEvent } from "@/lib/ws";

interface AgentStatus {
  agent_id: string;
  agent_name: string;
  status: string;
  lastActivity?: string;
  updatedAt: string;
}

interface ActiveExecution {
  execution_id: string;
  workflow_id?: string;
  status: string;
  current_node?: string;
  agent_name?: string;
  startedAt: string;
}

interface CostSummary {
  totalTokens: number;
  totalCostUsd: number;
  stepCount: number;
}

/** Accumulated streaming text for a step currently in progress. */
interface StepDelta {
  text: string;
  agentName: string;
}

interface MonitorState {
  // Connection
  isConnected: boolean;

  // Live data
  events: MonitorEvent[];
  agentStatuses: Record<string, AgentStatus>;
  activeExecutions: Record<string, ActiveExecution>;
  costSummary: CostSummary;

  /** Streaming deltas keyed by `${execution_id}:${node_id}` */
  stepDeltas: Record<string, StepDelta>;

  // Actions
  connect: () => void;
  disconnect: () => void;
  clearEvents: () => void;
}

const MAX_EVENTS = 200;

export const useMonitorStore = create<MonitorState>((set, get) => {
  let unsubscribe: (() => void) | null = null;

  function handleEvent(event: MonitorEvent) {
    const state = get();

    // Add to event log
    const events = [event, ...state.events].slice(0, MAX_EVENTS);

    // Update agent statuses
    const agentStatuses = { ...state.agentStatuses };
    if (event.type === "agent.status" && event.agent_id) {
      agentStatuses[event.agent_id] = {
        agent_id: event.agent_id,
        agent_name: event.agent_name ?? event.agent_id,
        status: event.status ?? "idle",
        updatedAt: event.timestamp ?? new Date().toISOString(),
      };
    }
    if (event.type === "step.started" && event.agent_name) {
      const key = event.agent_name;
      agentStatuses[key] = {
        agent_id: event.agent_id ?? key,
        agent_name: event.agent_name,
        status: "running",
        lastActivity: event.execution_id,
        updatedAt: event.timestamp ?? new Date().toISOString(),
      };
    }
    if (event.type === "step.completed" && event.agent_name) {
      const key = event.agent_name;
      if (agentStatuses[key]) {
        agentStatuses[key] = {
          ...agentStatuses[key],
          status: "idle",
          updatedAt: event.timestamp ?? new Date().toISOString(),
        };
      }
    }

    // Update active executions
    const activeExecutions = { ...state.activeExecutions };
    if (event.type === "execution.started" && event.execution_id) {
      activeExecutions[event.execution_id] = {
        execution_id: event.execution_id,
        workflow_id: event.workflow_id,
        status: "running",
        startedAt: event.timestamp ?? new Date().toISOString(),
      };
    }
    if (event.type === "step.started" && event.execution_id) {
      if (activeExecutions[event.execution_id]) {
        activeExecutions[event.execution_id] = {
          ...activeExecutions[event.execution_id],
          current_node: event.node_id,
          agent_name: event.agent_name,
        };
      }
    }
    if (event.type === "execution.completed" && event.execution_id) {
      if (activeExecutions[event.execution_id]) {
        activeExecutions[event.execution_id] = {
          ...activeExecutions[event.execution_id],
          status: event.status ?? "completed",
        };
        // Remove completed executions after a delay
        setTimeout(() => {
          set((s) => {
            const execs = { ...s.activeExecutions };
            delete execs[event.execution_id!];
            return { activeExecutions: execs };
          });
        }, 10000);
      }
    }

    // Handle streaming deltas
    const stepDeltas = { ...state.stepDeltas };
    if (event.type === "step.delta" && event.execution_id && event.node_id && event.delta) {
      const key = `${event.execution_id}:${event.node_id}`;
      const existing = stepDeltas[key] || { text: "", agentName: event.agent_name || "" };
      stepDeltas[key] = { text: existing.text + event.delta, agentName: event.agent_name || existing.agentName };
    }
    if (event.type === "step.completed" && event.execution_id && event.node_id) {
      const key = `${event.execution_id}:${event.node_id}`;
      delete stepDeltas[key];
    }

    // Update cost summary
    const costSummary = { ...state.costSummary };
    if (event.type === "step.completed") {
      costSummary.stepCount += 1;
      if (event.token_count) costSummary.totalTokens += event.token_count;
      if (event.cost_usd) costSummary.totalCostUsd += event.cost_usd;
    }

    set({ events, agentStatuses, activeExecutions, costSummary, stepDeltas, isConnected: wsClient.isConnected });
  }

  return {
    isConnected: false,
    events: [],
    agentStatuses: {},
    activeExecutions: {},
    costSummary: { totalTokens: 0, totalCostUsd: 0, stepCount: 0 },
    stepDeltas: {},

    connect: () => {
      if (unsubscribe) return;
      wsClient.connect();
      unsubscribe = wsClient.subscribe(handleEvent);
      set({ isConnected: wsClient.isConnected });
    },

    disconnect: () => {
      unsubscribe?.();
      unsubscribe = null;
      wsClient.disconnect();
      set({ isConnected: false });
    },

    clearEvents: () => {
      set({ events: [] });
    },
  };
});
