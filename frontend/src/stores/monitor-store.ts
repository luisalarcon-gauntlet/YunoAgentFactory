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
  workflow_name?: string;
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

/** Heartbeat data for a step currently in progress. */
interface StepHeartbeat {
  agentName: string;
  elapsedSeconds: number;
  phase: "thinking" | "streaming";
  lastUpdate: number; // Date.now() timestamp
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

  /** Heartbeat data keyed by `${execution_id}:${node_id}` */
  stepHeartbeats: Record<string, StepHeartbeat>;

  // Actions
  connect: () => void;
  disconnect: () => void;
  clearEvents: () => void;
}

const MAX_EVENTS = 500;

export const useMonitorStore = create<MonitorState>((set, get) => {
  let unsubscribe: (() => void) | null = null;

  function handleEvent(event: MonitorEvent) {
    const state = get();
    const type = event.type;

    // High-frequency events: only update the specific slice that changed
    if (type === "step.delta" && event.execution_id && event.node_id && event.delta) {
      const key = `${event.execution_id}:${event.node_id}`;
      const existing = state.stepDeltas[key];
      const newDelta: StepDelta = {
        text: (existing?.text ?? "") + event.delta,
        agentName: event.agent_name || existing?.agentName || "",
      };
      set({
        stepDeltas: { ...state.stepDeltas, [key]: newDelta },
        events: [event, ...state.events].slice(0, MAX_EVENTS),
      });
      return;
    }

    if (type === "step.heartbeat" && event.execution_id && event.node_id) {
      const key = `${event.execution_id}:${event.node_id}`;
      set({
        stepHeartbeats: {
          ...state.stepHeartbeats,
          [key]: {
            agentName: event.agent_name || "",
            elapsedSeconds: event.elapsed_seconds || 0,
            phase: (event.phase as "thinking" | "streaming") || "thinking",
            lastUpdate: Date.now(),
          },
        },
        events: [event, ...state.events].slice(0, MAX_EVENTS),
      });
      return;
    }

    // Lower-frequency events: build full update
    const events = [event, ...state.events].slice(0, MAX_EVENTS);
    const patch: Partial<MonitorState> = { events, isConnected: wsClient.isConnected };

    // Update agent statuses
    if (type === "agent.status" && event.agent_id) {
      patch.agentStatuses = {
        ...state.agentStatuses,
        [event.agent_id]: {
          agent_id: event.agent_id,
          agent_name: event.agent_name ?? event.agent_id,
          status: event.status ?? "idle",
          updatedAt: event.timestamp ?? new Date().toISOString(),
        },
      };
    }
    if (type === "step.started" && event.agent_name) {
      const key = event.agent_name;
      patch.agentStatuses = {
        ...state.agentStatuses,
        [key]: {
          agent_id: event.agent_id ?? key,
          agent_name: event.agent_name,
          status: "running",
          lastActivity: event.execution_id,
          updatedAt: event.timestamp ?? new Date().toISOString(),
        },
      };
    }
    if (type === "step.completed" && event.agent_name) {
      const key = event.agent_name;
      if (state.agentStatuses[key]) {
        patch.agentStatuses = {
          ...state.agentStatuses,
          [key]: {
            ...state.agentStatuses[key],
            status: "idle",
            updatedAt: event.timestamp ?? new Date().toISOString(),
          },
        };
      }
    }

    // Update active executions
    if (type === "execution.started" && event.execution_id) {
      patch.activeExecutions = {
        ...state.activeExecutions,
        [event.execution_id]: {
          execution_id: event.execution_id,
          workflow_id: event.workflow_id,
          workflow_name: event.workflow_name,
          status: "running",
          startedAt: event.timestamp ?? new Date().toISOString(),
        },
      };
    }
    if (type === "step.started" && event.execution_id) {
      if (state.activeExecutions[event.execution_id]) {
        patch.activeExecutions = {
          ...state.activeExecutions,
          [event.execution_id]: {
            ...state.activeExecutions[event.execution_id],
            current_node: event.node_id,
            agent_name: event.agent_name,
          },
        };
      }
    }
    if (type === "execution.completed" && event.execution_id) {
      if (state.activeExecutions[event.execution_id]) {
        patch.activeExecutions = {
          ...state.activeExecutions,
          [event.execution_id]: {
            ...state.activeExecutions[event.execution_id],
            status: event.status ?? "completed",
          },
        };
        // Remove completed executions after a delay
        const execId = event.execution_id;
        setTimeout(() => {
          set((s) => {
            const execs = { ...s.activeExecutions };
            delete execs[execId];
            return { activeExecutions: execs };
          });
        }, 10000);
      }
    }

    // Clean up deltas/heartbeats on step completion
    if (type === "step.completed" && event.execution_id && event.node_id) {
      const key = `${event.execution_id}:${event.node_id}`;
      if (state.stepDeltas[key] || state.stepHeartbeats[key]) {
        const stepDeltas = { ...state.stepDeltas };
        const stepHeartbeats = { ...state.stepHeartbeats };
        delete stepDeltas[key];
        delete stepHeartbeats[key];
        patch.stepDeltas = stepDeltas;
        patch.stepHeartbeats = stepHeartbeats;
      }
    }

    // Update cost summary
    if (type === "step.completed") {
      patch.costSummary = {
        stepCount: state.costSummary.stepCount + 1,
        totalTokens: state.costSummary.totalTokens + (event.token_count || 0),
        totalCostUsd: state.costSummary.totalCostUsd + (event.cost_usd || 0),
      };
    }

    set(patch);
  }

  return {
    isConnected: false,
    events: [],
    agentStatuses: {},
    activeExecutions: {},
    costSummary: { totalTokens: 0, totalCostUsd: 0, stepCount: 0 },
    stepDeltas: {},
    stepHeartbeats: {},

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
