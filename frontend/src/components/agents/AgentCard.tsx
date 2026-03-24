import type { Agent } from "@/lib/api";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  idle: "bg-gray-400",
  running: "bg-green-500 animate-pulse",
  error: "bg-red-500",
};

interface AgentCardProps {
  agent: Agent;
  onEdit: (agent: Agent) => void;
  onDelete: (id: string) => void;
}

export default function AgentCard({ agent, onEdit, onDelete }: AgentCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("w-2.5 h-2.5 rounded-full", statusColors[agent.status] || "bg-gray-400")} />
          <h3 className="font-semibold text-sm">{agent.name}</h3>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onEdit(agent)}
            className="text-muted-foreground hover:text-foreground p-1 rounded"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(agent.id)}
            className="text-muted-foreground hover:text-destructive p-1 rounded"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{agent.role}</p>
      <div className="flex flex-wrap gap-1 mt-3">
        <span className="text-xs bg-secondary px-1.5 py-0.5 rounded">{agent.model.split("-").slice(0, 2).join("-")}</span>
        {agent.channels.map((ch) => (
          <span key={ch} className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
            {ch}
          </span>
        ))}
        {agent.tools.map((tool) => (
          <span key={tool} className="text-xs bg-accent px-1.5 py-0.5 rounded text-accent-foreground">
            {tool}
          </span>
        ))}
      </div>
    </div>
  );
}
