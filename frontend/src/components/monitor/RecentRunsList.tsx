import type { Execution } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { executionStatus } from "@/lib/status";

interface Props {
  runs: Execution[];
}

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
    <div className="overflow-y-auto max-h-[calc(100vh-400px)] md:max-h-[calc(100vh-500px)] space-y-1">
      {runs.map((run) => {
        const config = executionStatus[run.status] ?? executionStatus.pending;
        return (
          <div
            key={run.id}
            onClick={() => navigate(`/runs?execution=${run.id}`)}
            className="flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-3 px-3 py-2 rounded-lg border border-border bg-card/30 hover:bg-card/60 cursor-pointer transition-colors"
          >
            {/* Status badge */}
            <span
              className={cn(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase shrink-0",
                config.bg,
                config.text
              )}
            >
              {config.label}
            </span>

            {/* Workflow name */}
            <span className="text-xs font-medium flex-1 truncate min-w-0">
              {run.workflow_name || "Workflow"}
            </span>

            {/* Source */}
            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/30 hidden sm:inline">
              {run.source}
            </span>

            {/* Duration */}
            <span className="text-[10px] text-muted-foreground w-12 text-right shrink-0">
              {formatDuration(run.started_at, run.completed_at)}
            </span>

            {/* Time ago */}
            <span className="text-[10px] text-muted-foreground w-14 text-right shrink-0 hidden sm:inline">
              {timeAgo(run.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
