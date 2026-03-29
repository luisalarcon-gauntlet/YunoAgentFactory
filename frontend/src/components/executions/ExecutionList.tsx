import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Execution } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ExecutionListProps {
  selectedId?: string;
  onSelect: (execution: Execution) => void;
  onDeleted?: (id: string) => void;
}

const statusBadge: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-zinc-500/15", text: "text-zinc-400" },
  running: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  completed: { bg: "bg-blue-500/15", text: "text-blue-400" },
  failed: { bg: "bg-red-500/15", text: "text-red-400" },
  timed_out: { bg: "bg-amber-500/15", text: "text-amber-400" },
  cancelled: { bg: "bg-zinc-500/15", text: "text-zinc-400" },
};

const sourceBadge: Record<string, { bg: string; text: string; label: string }> = {
  web: { bg: "bg-sky-500/15", text: "text-sky-400", label: "Web" },
  telegram: { bg: "bg-indigo-500/15", text: "text-indigo-400", label: "Telegram" },
};

function formatTimeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60000) return "just now";
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  return `${Math.floor(ms / 86400000)}d ago`;
}

export default function ExecutionList({ selectedId, onSelect, onDeleted }: ExecutionListProps) {
  const queryClient = useQueryClient();

  const { data: executions, isLoading, error } = useQuery({
    queryKey: ["executions"],
    queryFn: api.executions.list,
    refetchInterval: 5000,
  });

  const deleteMutation = useMutation({
    mutationFn: api.executions.delete,
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["executions"] });
      onDeleted?.(deletedId);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load executions: {error.message}
      </div>
    );
  }

  if (!executions?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto mb-2 opacity-50">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
        </svg>
        <p className="text-sm">No executions yet.</p>
        <p className="text-xs mt-1">Run a workflow to see results here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {executions.map((exec) => {
        const badge = statusBadge[exec.status] ?? statusBadge.pending;
        const isSelected = exec.id === selectedId;

        const iterations = Number(exec.iteration_count) || 0;

        return (
          <div
            key={exec.id}
            onClick={() => onSelect(exec)}
            className={cn(
              "group px-3 py-2.5 rounded-lg border cursor-pointer transition-colors relative",
              isSelected
                ? "border-primary/50 bg-primary/5"
                : "border-border bg-card hover:border-primary/30 hover:bg-card/80"
            )}
          >
            {exec.status !== "running" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMutation.mutate(exec.id);
                }}
                disabled={deleteMutation.isPending}
                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                title="Delete execution"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate">
                {exec.workflow_name ?? "Workflow"}
              </span>
              <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0", badge.bg, badge.text)}>
                {exec.status}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">
                {exec.id.slice(0, 8)}... · {exec.trigger_type || "manual"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {exec.created_at ? formatTimeAgo(exec.created_at) : "--"}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              {exec.source && (() => {
                const sb = sourceBadge[exec.source] ?? sourceBadge.web;
                return (
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", sb.bg, sb.text)}>
                    {sb.label}
                  </span>
                );
              })()}
              <span className="text-[10px] text-muted-foreground">
                {iterations} iteration{iterations !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
