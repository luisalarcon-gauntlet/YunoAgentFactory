import { useMonitorStore } from "@/stores/monitor-store";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { dot: string; label: string }> = {
  idle: { dot: "bg-zinc-500", label: "Idle" },
  running: { dot: "bg-emerald-500 animate-pulse", label: "Running" },
  error: { dot: "bg-red-500", label: "Error" },
};

export default function AgentStatusGrid() {
  const agentStatuses = useMonitorStore((s) => s.agentStatuses);
  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: api.agents.list,
  });

  // Merge DB agents with live statuses
  const merged = (agents ?? []).map((agent) => {
    const live = agentStatuses[agent.name] ?? agentStatuses[agent.id];
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      channels: agent.channels,
      status: live?.status ?? agent.status ?? "idle",
      lastActivity: live?.lastActivity,
      updatedAt: live?.updatedAt,
    };
  });

  if (merged.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-xs">
        No agents configured
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
      {merged.map((agent) => {
        const config = statusConfig[agent.status] ?? statusConfig.idle;
        return (
          <div
            key={agent.id}
            className="px-3 py-2 rounded-lg border border-border bg-card/50"
          >
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full shrink-0", config.dot)} aria-hidden="true" />
              <span className="text-xs font-medium truncate">{agent.name}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">{config.label}</span>
              {agent.channels.length > 0 && (
                <div className="flex gap-0.5">
                  {agent.channels.map((ch) => (
                    <span key={ch} className="text-[9px] bg-primary/10 text-primary px-1 rounded">
                      {ch}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
