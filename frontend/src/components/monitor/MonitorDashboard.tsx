import { useEffect } from "react";
import { useMonitorStore } from "@/stores/monitor-store";
import AgentStatusGrid from "./AgentStatusGrid";
import LiveEventFeed from "./LiveEventFeed";
import CostTracker from "./CostTracker";
import { cn } from "@/lib/utils";

export default function MonitorDashboard() {
  const connect = useMonitorStore((s) => s.connect);
  const disconnect = useMonitorStore((s) => s.disconnect);
  const isConnected = useMonitorStore((s) => s.isConnected);
  const activeExecutions = useMonitorStore((s) => s.activeExecutions);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const activeExecs = Object.values(activeExecutions).filter(
    (e) => e.status === "running"
  );

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-96px)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Live Monitor</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Real-time agent activity and execution monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full",
            isConnected ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
          )}>
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
            )} />
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Cost summary */}
      <CostTracker />

      {/* Agent status grid */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Agent Status
        </h3>
        <AgentStatusGrid />
      </div>

      {/* Active executions */}
      {activeExecs.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Active Executions
          </h3>
          <div className="space-y-1">
            {activeExecs.map((exec) => (
              <div
                key={exec.execution_id}
                className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-card/50"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium">
                    {exec.execution_id.slice(0, 8)}...
                  </span>
                  {exec.agent_name && (
                    <span className="text-[10px] text-muted-foreground">
                      → {exec.agent_name}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {exec.startedAt ? new Date(exec.startedAt).toLocaleTimeString() : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event feed */}
      <div className="flex-1 min-h-0 rounded-lg border border-border bg-card/30 overflow-hidden">
        <div className="px-3 py-2 border-b border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Event Feed
          </h3>
        </div>
        <LiveEventFeed />
      </div>
    </div>
  );
}
