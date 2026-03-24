import { type DragEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Agent } from "@/lib/api";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  idle: "bg-zinc-500",
  running: "bg-emerald-500",
  error: "bg-red-500",
};

function onDragStart(event: DragEvent, agent: Agent) {
  event.dataTransfer.setData("application/yuno-agent", JSON.stringify(agent));
  event.dataTransfer.effectAllowed = "move";
}

export default function AgentPalette() {
  const { data: agents, isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: api.agents.list,
  });

  return (
    <div className="w-56 border-r border-border bg-card/60 backdrop-blur-sm flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Agents
        </h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Drag to add to workflow
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading && (
          <>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
            ))}
          </>
        )}
        {agents?.map((agent) => (
          <div
            key={agent.id}
            draggable
            onDragStart={(e) => onDragStart(e, agent)}
            className={cn(
              "px-3 py-2 rounded-lg border border-border bg-card",
              "cursor-grab active:cursor-grabbing",
              "hover:border-primary/50 hover:bg-primary/5 transition-colors"
            )}
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  statusColors[agent.status] ?? "bg-zinc-500"
                )}
              />
              <span className="text-xs font-medium truncate">{agent.name}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate pl-4">
              {agent.role}
            </p>
            {agent.channels.length > 0 && (
              <div className="flex gap-1 mt-1 pl-4">
                {agent.channels.map((ch) => (
                  <span
                    key={ch}
                    className="text-[9px] bg-primary/10 text-primary px-1 py-0.5 rounded"
                  >
                    {ch}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {agents && agents.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-4">
            No agents yet. Create agents first.
          </p>
        )}
      </div>
    </div>
  );
}
