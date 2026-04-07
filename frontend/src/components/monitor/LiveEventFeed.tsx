import { useMonitorStore } from "@/stores/monitor-store";
import { cn } from "@/lib/utils";
import type { MonitorEvent } from "@/lib/ws";

const eventIcons: Record<string, { icon: string; color: string }> = {
  "execution.started": { icon: "▶", color: "text-emerald-400" },
  "execution.completed": { icon: "✓", color: "text-blue-400" },
  "step.started": { icon: "⟶", color: "text-amber-400" },
  "step.completed": { icon: "●", color: "text-blue-400" },
  "agent.message": { icon: "✉", color: "text-primary" },
  "agent.status": { icon: "◉", color: "text-zinc-400" },
  "channel.message": { icon: "⬡", color: "text-violet-400" },
};

function formatEventMessage(event: MonitorEvent): string {
  switch (event.type) {
    case "execution.started":
      return `Execution started (${event.execution_id?.slice(0, 8)}...)`;
    case "execution.completed":
      return `Execution ${event.status ?? "completed"} (${event.execution_id?.slice(0, 8)}...)`;
    case "step.started":
      return `${event.agent_name ?? event.node_id ?? "Agent"} started processing`;
    case "step.completed":
      return `${event.agent_name ?? event.node_id ?? "Agent"} completed${event.duration_ms ? ` (${event.duration_ms}ms)` : ""}`;
    case "agent.message":
      return `${event.from_agent ?? "Agent"} → ${event.to_agent ?? "Agent"}: ${(event.content ?? "").slice(0, 80)}`;
    case "agent.status":
      return `${event.agent_name ?? "Agent"} is now ${event.status ?? "unknown"}`;
    case "channel.message":
      return `[${event.channel}] ${event.from ?? "user"}: ${(event.content ?? "").slice(0, 80)}`;
    default:
      return JSON.stringify(event);
  }
}

function formatTime(timestamp?: string): string {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function LiveEventFeed() {
  const events = useMonitorStore((s) => s.events);
  const clearEvents = useMonitorStore((s) => s.clearEvents);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[10px] text-muted-foreground">{events.length} events</span>
        {events.length > 0 && (
          <button
            onClick={clearEvents}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto space-y-0.5 px-2 pb-2">
        {events.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-xs">
            Waiting for events...
          </div>
        )}
        {events.map((event, i) => {
          const config = eventIcons[event.type] ?? { icon: "·", color: "text-zinc-400" };
          return (
            <div
              key={`${event.timestamp}-${i}`}
              className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-muted/30 transition-colors"
            >
              <span className={cn("text-xs shrink-0 mt-0.5", config.color)}>
                {config.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground/80 break-words">
                  {formatEventMessage(event)}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatTime(event.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
