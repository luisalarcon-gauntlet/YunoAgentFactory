import type { ExecutionStep } from "@/lib/api";
import { cn } from "@/lib/utils";

interface StepTimelineProps {
  steps: ExecutionStep[];
  activeStepId?: string;
  onStepClick?: (step: ExecutionStep) => void;
}

const statusConfig: Record<string, { dot: string; bg: string; label: string }> = {
  pending: { dot: "bg-zinc-500", bg: "bg-zinc-500/10", label: "Pending" },
  running: { dot: "bg-emerald-500 animate-pulse", bg: "bg-emerald-500/10", label: "Running" },
  completed: { dot: "bg-blue-500", bg: "bg-blue-500/10", label: "Completed" },
  failed: { dot: "bg-red-500", bg: "bg-red-500/10", label: "Failed" },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

export default function StepTimeline({ steps, activeStepId, onStepClick }: StepTimelineProps) {
  if (steps.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No execution steps yet.
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const config = statusConfig[step.status] ?? statusConfig.pending;
        const isActive = step.id === activeStepId;
        const isLast = index === steps.length - 1;

        return (
          <div
            key={step.id}
            className={cn(
              "relative flex gap-3 cursor-pointer group",
              isActive && "bg-primary/5 -mx-2 px-2 rounded-lg"
            )}
            onClick={() => onStepClick?.(step)}
          >
            {/* Timeline line + dot */}
            <div className="flex flex-col items-center pt-3">
              <div className={cn("w-3 h-3 rounded-full shrink-0 z-10 ring-2 ring-background", config.dot)} />
              {!isLast && (
                <div className="w-0.5 flex-1 bg-border -mb-3 mt-1" />
              )}
            </div>

            {/* Content */}
            <div className={cn("flex-1 pb-4 pt-1.5", !isLast && "border-b border-transparent")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {step.agent_name ?? step.node_id}
                  </span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", config.bg, config.dot.replace("animate-pulse", "").includes("emerald") ? "text-emerald-400" : config.dot.includes("blue") ? "text-blue-400" : config.dot.includes("red") ? "text-red-400" : "text-zinc-400")}>
                    {config.label}
                  </span>
                </div>
                {step.started_at && (
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(step.started_at).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* Metrics row */}
              {step.status !== "pending" && (
                <div className="flex gap-4 mt-1.5">
                  {step.duration_ms > 0 && (
                    <div className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 text-muted-foreground">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                      <span className="text-xs text-muted-foreground">{formatDuration(step.duration_ms)}</span>
                    </div>
                  )}
                  {step.token_count > 0 && (
                    <div className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 text-muted-foreground">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                      </svg>
                      <span className="text-xs text-muted-foreground">{step.token_count.toLocaleString()} tokens</span>
                    </div>
                  )}
                  {step.cost_usd > 0 && (
                    <div className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 text-muted-foreground">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                      <span className="text-xs text-muted-foreground">{formatCost(step.cost_usd)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Error message */}
              {step.error_message && (
                <p className="text-xs text-red-400 mt-1.5 bg-red-500/10 px-2 py-1 rounded">
                  {step.error_message}
                </p>
              )}

              {/* Output preview */}
              {step.output_data && (
                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 bg-muted/30 px-2 py-1 rounded">
                  {step.output_data.length > 200
                    ? step.output_data.slice(0, 200) + "..."
                    : step.output_data}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
