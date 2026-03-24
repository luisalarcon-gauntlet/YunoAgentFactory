import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Execution } from "@/lib/api";
import StepTimeline from "./StepTimeline";
import MessageTrail from "./MessageTrail";
import { cn } from "@/lib/utils";

interface ExecutionDetailProps {
  execution: Execution;
  onClose: () => void;
}

const statusBadge: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-zinc-500/15", text: "text-zinc-400" },
  running: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  completed: { bg: "bg-blue-500/15", text: "text-blue-400" },
  failed: { bg: "bg-red-500/15", text: "text-red-400" },
  timed_out: { bg: "bg-amber-500/15", text: "text-amber-400" },
  cancelled: { bg: "bg-zinc-500/15", text: "text-zinc-400" },
};

type Tab = "steps" | "messages";

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "--";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = e - s;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function ExecutionDetail({ execution, onClose }: ExecutionDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>("steps");
  const isLive = execution.status === "running";

  const { data: steps, isLoading: stepsLoading } = useQuery({
    queryKey: ["execution-steps", execution.id],
    queryFn: () => api.executions.steps(execution.id),
    refetchInterval: isLive ? 2000 : false,
  });

  const badge = statusBadge[execution.status] ?? statusBadge.pending;
  const totalTokens = steps?.reduce((sum, s) => sum + (s.token_count ?? 0), 0) ?? 0;
  const totalCost = steps?.reduce((sum, s) => sum + (s.cost_usd ?? 0), 0) ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">
              {execution.workflow_name ?? "Execution"}
            </h3>
            <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", badge.bg, badge.text)}>
              {execution.status}
            </span>
            {isLive && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {execution.id.slice(0, 8)}... · {execution.trigger_type} · {formatDuration(execution.started_at, execution.completed_at)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3 border-b border-border">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">Steps</p>
          <p className="text-sm font-semibold">{steps?.length ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">Iterations</p>
          <p className="text-sm font-semibold">{execution.iteration_count}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">Tokens</p>
          <p className="text-sm font-semibold">{totalTokens.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">Cost</p>
          <p className="text-sm font-semibold">${totalCost.toFixed(4)}</p>
        </div>
      </div>

      {/* Error */}
      {execution.error_message && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400">{execution.error_message}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 px-4 border-b border-border">
        <button
          onClick={() => setActiveTab("steps")}
          className={cn(
            "px-3 py-2 text-xs font-medium border-b-2 transition-colors",
            activeTab === "steps"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Steps
        </button>
        <button
          onClick={() => setActiveTab("messages")}
          className={cn(
            "px-3 py-2 text-xs font-medium border-b-2 transition-colors",
            activeTab === "messages"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Messages
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "steps" && (
          <div className="px-4 py-3">
            {stepsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : (
              <StepTimeline steps={steps ?? []} />
            )}
          </div>
        )}
        {activeTab === "messages" && (
          <MessageTrail executionId={execution.id} isLive={isLive} />
        )}
      </div>
    </div>
  );
}
