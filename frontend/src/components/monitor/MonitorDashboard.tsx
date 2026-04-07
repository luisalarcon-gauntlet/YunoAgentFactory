import { useEffect } from "react";
import { useMonitorStore } from "@/stores/monitor-store";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import AgentStatusGrid from "./AgentStatusGrid";
import ActiveRunsPanel from "./ActiveRunsPanel";
import RecentRunsList from "./RecentRunsList";
import CostTracker from "./CostTracker";
import { cn } from "@/lib/utils";

export default function MonitorDashboard() {
  const connect = useMonitorStore((s) => s.connect);
  const disconnect = useMonitorStore((s) => s.disconnect);
  const isConnected = useMonitorStore((s) => s.isConnected);
  const activeExecutions = useMonitorStore((s) => s.activeExecutions);

  const { data: recentRuns, refetch: refetchRuns } = useQuery({
    queryKey: ["runs-recent"],
    queryFn: () => api.runs.list(undefined, 10),
    refetchInterval: 5000,
  });

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const activeExecs = Object.values(activeExecutions).filter(
    (e) => e.status === "running"
  );
  const hasActivity = activeExecs.length > 0;

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-120px)] md:h-[calc(100vh-96px)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Live Monitor</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {hasActivity
              ? `${activeExecs.length} active execution${activeExecs.length > 1 ? "s" : ""}`
              : "Waiting for activity..."}
          </p>
        </div>
        <span
          className={cn(
            "flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full",
            isConnected
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-red-500/15 text-red-400"
          )}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
            )}
            aria-hidden="true"
          />
          {isConnected ? "Live" : "Disconnected"}
        </span>
      </div>

      {/* Stats bar */}
      <CostTracker />

      {/* Main content - split view */}
      <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
        {/* Active executions with streaming output */}
        {hasActivity && <ActiveRunsPanel executions={activeExecs} />}

        {/* Agent status */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Agents
          </h3>
          <AgentStatusGrid />
        </div>

        {/* Recent runs */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Recent Runs
          </h3>
          <RecentRunsList runs={recentRuns ?? []} />
        </div>
      </div>
    </div>
  );
}
