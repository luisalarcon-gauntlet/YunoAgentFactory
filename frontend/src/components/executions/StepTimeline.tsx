import { useState, useEffect } from "react";
import type { ExecutionStep } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMonitorStore } from "@/stores/monitor-store";
import MarkdownContent from "@/components/ui/markdown-content";
import { executionStatus } from "@/lib/status";

interface StepTimelineProps {
  steps: ExecutionStep[];
  activeStepId?: string;
  executionId?: string;
  onStepClick?: (step: ExecutionStep) => void;
}

function formatDuration(ms: number): string {
  const val = Number(ms) || 0;
  if (val < 1000) return `${Math.round(val)}ms`;
  if (val < 60000) return `${(val / 1000).toFixed(1)}s`;
  return `${(val / 60000).toFixed(1)}m`;
}

function formatCost(usd: number): string {
  const val = Number(usd) || 0;
  if (val === 0) return "$0";
  if (val < 0.01) return `$${val.toFixed(4)}`;
  return `$${val.toFixed(3)}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** Ticking elapsed timer for running steps. */
function RunningElapsed({ startedAt, executionId, nodeId }: { startedAt: string; executionId?: string; nodeId?: string }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const heartbeats = useMonitorStore((s) => s.stepHeartbeats);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const key = executionId && nodeId ? `${executionId}:${nodeId}` : "";
  const hb = key ? heartbeats[key] : undefined;
  const phase = hb?.phase ?? "thinking";

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const display = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex items-center gap-1">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 text-emerald-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <span className="text-xs text-emerald-400 tabular-nums">{display}</span>
      </div>
      <span className="text-[10px] text-muted-foreground">
        {phase === "streaming" ? "Generating output..." : "Thinking..."}
      </span>
    </div>
  );
}

export default function StepTimeline({ steps, activeStepId, executionId, onStepClick }: StepTimelineProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [expandedInputs, setExpandedInputs] = useState<Set<string>>(new Set());

  if (steps.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No execution steps yet.
      </div>
    );
  }

  const toggleExpand = (stepId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const toggleInput = (stepId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedInputs((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const config = executionStatus[step.status] ?? executionStatus.pending;
        const isActive = step.id === activeStepId;
        const isLast = index === steps.length - 1;
        const isOutputExpanded = expandedSteps.has(step.id);
        const isInputExpanded = expandedInputs.has(step.id);
        const hasLongOutput = (step.output_data?.length ?? 0) > 200;
        const hasInput = !!step.input_data;

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
              <div className={cn("w-3 h-3 rounded-full shrink-0 z-10 ring-2 ring-background", config.dot, step.status === "running" && "animate-pulse")} />
              {!isLast && (
                <div className="w-0.5 flex-1 bg-border -mb-3 mt-1" />
              )}
            </div>

            {/* Content */}
            <div className={cn("flex-1 pb-4 pt-1.5 min-w-0", !isLast && "border-b border-transparent")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {step.agent_name ?? step.node_id}
                  </span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", config.bg, config.text)}>
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
              {step.status === "running" && step.started_at ? (
                <RunningElapsed
                  startedAt={step.started_at}
                  executionId={executionId}
                  nodeId={step.node_id}
                />
              ) : step.status !== "pending" && (
                <div className="flex gap-4 mt-1.5">
                  {Number(step.duration_ms) > 0 && (
                    <div className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 text-muted-foreground">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                      <span className="text-xs text-muted-foreground">{formatDuration(step.duration_ms)}</span>
                    </div>
                  )}
                  {Number(step.token_count) > 0 && (
                    <div className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 text-muted-foreground">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                      </svg>
                      <span className="text-xs text-muted-foreground">{Number(step.token_count).toLocaleString()} tokens</span>
                    </div>
                  )}
                  {Number(step.cost_usd) > 0 && (
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

              {/* Input section (collapsible) */}
              {hasInput && (
                <div className="mt-2">
                  <button
                    onClick={(e) => toggleInput(step.id, e)}
                    aria-expanded={isInputExpanded}
                    aria-label="Toggle input"
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={cn("w-3 h-3 transition-transform", isInputExpanded && "rotate-90")}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                    Input
                  </button>
                  {isInputExpanded && (
                    <div className="mt-1 bg-muted/20 border border-border/50 rounded px-2 py-1.5">
                      <div className="flex justify-end mb-1">
                        <CopyButton text={step.input_data!} />
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                        {step.input_data}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Output preview / expanded */}
              {step.output_data && (
                <div className="mt-2">
                  {isOutputExpanded ? (
                    <div className="bg-muted/20 border border-border/50 rounded px-2 py-1.5">
                      <div className="flex justify-between items-center mb-1">
                        <button
                          onClick={(e) => toggleExpand(step.id, e)}
                          aria-expanded={true}
                          aria-label="Collapse output"
                          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Show less
                        </button>
                        <CopyButton text={step.output_data} />
                      </div>
                      <MarkdownContent content={step.output_data} />
                    </div>
                  ) : (
                    <div className="bg-muted/30 rounded px-2 py-1">
                      <p className="text-xs text-muted-foreground line-clamp-3">
                        {step.output_data.slice(0, 300)}
                        {hasLongOutput && "..."}
                      </p>
                      {hasLongOutput && (
                        <button
                          onClick={(e) => toggleExpand(step.id, e)}
                          aria-expanded={false}
                          aria-label="Expand output"
                          className="text-[10px] text-primary hover:text-primary/80 mt-0.5 transition-colors"
                        >
                          Show more
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
