import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { cn } from "@/lib/utils";

export interface AgentNodeData {
  label: string;
  role?: string;
  agent_id?: string;
  status?: "idle" | "running" | "completed" | "failed" | "error";
  channels?: string[];
  model?: string;
  config?: {
    task_instruction?: string;
  };
  [key: string]: unknown;
}

export type AgentNodeType = Node<AgentNodeData, "agentNode">;

const statusConfig: Record<string, { color: string; ring: string }> = {
  idle: { color: "bg-zinc-500", ring: "" },
  running: { color: "bg-emerald-500 animate-pulse", ring: "ring-2 ring-emerald-500/30" },
  completed: { color: "bg-blue-500", ring: "" },
  failed: { color: "bg-red-500", ring: "ring-2 ring-red-500/30" },
  error: { color: "bg-red-500", ring: "ring-2 ring-red-500/30" },
};

const channelIcons: Record<string, { label: string; bg: string; text: string }> = {
  telegram: { label: "Telegram", bg: "bg-sky-500/15", text: "text-sky-400" },
  webchat: { label: "Web", bg: "bg-violet-500/15", text: "text-violet-400" },
  slack: { label: "Slack", bg: "bg-amber-500/15", text: "text-amber-400" },
  api: { label: "API", bg: "bg-emerald-500/15", text: "text-emerald-400" },
};

function AgentNode({ data, selected }: NodeProps<AgentNodeType>) {
  const status = data.status ?? "idle";
  const { color, ring } = statusConfig[status] ?? statusConfig.idle;
  const channels = data.channels ?? [];

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-xl border-2 shadow-lg bg-card min-w-[180px] max-w-[220px] transition-all duration-200",
        selected ? "border-primary shadow-primary/20" : "border-border",
        ring
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background !-left-[6px]"
      />

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", color)} aria-hidden="true" />
        <span className="font-semibold text-sm text-foreground truncate">
          {data.label}
        </span>
        <span className="sr-only">Status: {status}</span>
      </div>

      {/* Role */}
      {data.role && (
        <p className="text-xs text-muted-foreground mt-1 truncate">{data.role}</p>
      )}

      {/* Channel badges */}
      {channels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {channels.map((ch) => {
            const icon = channelIcons[ch] ?? {
              label: ch,
              bg: "bg-secondary",
              text: "text-secondary-foreground",
            };
            return (
              <span
                key={ch}
                className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", icon.bg, icon.text)}
              >
                {icon.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Model badge */}
      {data.model && (
        <div className="mt-2">
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {data.model.split("-").slice(0, 2).join("-")}
          </span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background !-right-[6px]"
      />
    </div>
  );
}

export default memo(AgentNode);
