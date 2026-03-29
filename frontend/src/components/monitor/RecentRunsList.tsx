import type { Execution } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface Props {
  runs: Execution[];
}

const statusConfig: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  completed: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-400",
    label: "Completed",
  },
  failed: { bg: "bg-red-500/15", text: "text-red-400", label: "Failed" },
  timed_out: {
    bg: "bg-amber-500/15",
    text: "text-amber-400",
    label: "Timed Out",
  },
  running: {
    bg: "bg-blue-500/15",
    text: "text-blue-400",
    label: "Running",
  },
  pending: {
    bg: "bg-zinc-500/15",
    text: "text-zinc-400",
    label: "Pending",
  },
};

function formatDuration(
  startedAt: string | null,
  completedAt: string | null
): string {
  if (!startedAt) return "-";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function RecentRunsList({ runs }: Props) {
  const navigate = useNavigate();

  if (runs.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-xs">
        No runs yet. Execute a workflow to see results here.
      </div>
    );
  }

  return (
    <div className="overflow-y-auto max-h-[calc(100vh-500px)] space-y-1">
      {runs.map((run) => {
        const config = statusConfig[run.status] ?? statusConfig.pending;
        return (
          <div
            key={run.id}
            onClick={() => navigate(`/runs?execution=${run.id}`)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-card/30 hover:bg-card/60 cursor-pointer transition-colors"
          >
            {/* Status badge */}
            <span
              className={cn(
                "text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase",
                config.bg,
                config.text
              )}
            >
              {config.label}
            </span>

            {/* Workflow name */}
            <span className="text-xs font-medium flex-1 truncate">
              {run.workflow_name || "Workflow"}
            </span>

            {/* Source */}
            <span className="text-[9px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/30">
              {run.source}
            </span>

            {/* Duration */}
            <span className="text-[10px] text-muted-foreground w-12 text-right">
              {formatDuration(run.started_at, run.completed_at)}
            </span>

            {/* Time ago */}
            <span className="text-[10px] text-muted-foreground w-14 text-right">
              {timeAgo(run.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
