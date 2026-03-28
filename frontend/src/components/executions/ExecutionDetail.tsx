import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Execution, type ExecutionStep } from "@/lib/api";
import { downloadReport } from "@/lib/export-report";
import StepTimeline from "./StepTimeline";
import StepDetailModal from "./StepDetailModal";
import { cn } from "@/lib/utils";
import { useMonitorStore } from "@/stores/monitor-store";

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

type Tab = "steps" | "conversation";

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "--";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = e - s;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

const agentColors = [
  { bg: "bg-blue-500/10", border: "border-l-blue-500", text: "text-blue-400", avatar: "bg-blue-500/20 text-blue-400" },
  { bg: "bg-emerald-500/10", border: "border-l-emerald-500", text: "text-emerald-400", avatar: "bg-emerald-500/20 text-emerald-400" },
  { bg: "bg-violet-500/10", border: "border-l-violet-500", text: "text-violet-400", avatar: "bg-violet-500/20 text-violet-400" },
  { bg: "bg-amber-500/10", border: "border-l-amber-500", text: "text-amber-400", avatar: "bg-amber-500/20 text-amber-400" },
  { bg: "bg-rose-500/10", border: "border-l-rose-500", text: "text-rose-400", avatar: "bg-rose-500/20 text-rose-400" },
  { bg: "bg-cyan-500/10", border: "border-l-cyan-500", text: "text-cyan-400", avatar: "bg-cyan-500/20 text-cyan-400" },
];

function getAgentColorIndex(agentId: string, seenAgents: Map<string, number>): number {
  if (seenAgents.has(agentId)) return seenAgents.get(agentId)!;
  const idx = seenAgents.size % agentColors.length;
  seenAgents.set(agentId, idx);
  return idx;
}

function ConversationView({ steps }: { steps: ExecutionStep[] }) {
  const [expandedBubbles, setExpandedBubbles] = useState<Set<string>>(new Set());

  if (steps.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No conversation yet.
      </div>
    );
  }

  const toggleBubble = (id: string) => {
    setExpandedBubbles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const agentMap = new Map<string, number>();

  return (
    <div className="p-4 space-y-3">
      {steps.map((step, index) => {
        const colorIdx = getAgentColorIndex(step.agent_id, agentMap);
        const color = agentColors[colorIdx];
        const name = step.agent_name ?? step.node_id;
        const initials = name.slice(0, 2).toUpperCase();
        const output = step.output_data ?? "";
        const isLong = output.length > 400;
        const isExpanded = expandedBubbles.has(step.id);
        const isFailed = step.status === "failed";

        // Determine if this is a handoff (next step is a different agent)
        const nextStep = steps[index + 1];
        const showArrow = nextStep && nextStep.agent_id !== step.agent_id;

        return (
          <div key={step.id}>
            <div className={cn(
              "rounded-lg border border-border/60 overflow-hidden",
              "border-l-[3px]",
              color.border,
            )}>
              {/* Agent header */}
              <div className="flex items-center gap-2.5 px-3 py-2 bg-muted/15">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                  color.avatar,
                )}>
                  {initials}
                </div>
                <span className={cn("text-xs font-semibold", color.text)}>{name}</span>
                {step.started_at && (
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {new Date(step.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                )}
              </div>

              {/* Message body */}
              <div className="px-3 py-2.5">
                {isFailed ? (
                  <p className="text-xs text-red-400">
                    {step.error_message ?? "Step failed"}
                  </p>
                ) : output ? (
                  <>
                    <p className="text-xs text-foreground/85 whitespace-pre-wrap break-words leading-relaxed">
                      {isLong && !isExpanded ? output.slice(0, 400) + "..." : output}
                    </p>
                    {isLong && (
                      <button
                        onClick={() => toggleBubble(step.id)}
                        className="text-[10px] text-primary hover:text-primary/80 mt-1.5 transition-colors"
                      >
                        {isExpanded ? "Show less" : "Show more"}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No output</p>
                )}
              </div>

              {/* Footer metrics */}
              {(Number(step.token_count) > 0 || Number(step.duration_ms) > 0) && (
                <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border/30 bg-muted/10">
                  {Number(step.duration_ms) > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {Number(step.duration_ms) < 1000
                        ? `${Math.round(Number(step.duration_ms))}ms`
                        : `${(Number(step.duration_ms) / 1000).toFixed(1)}s`}
                    </span>
                  )}
                  {Number(step.token_count) > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {Number(step.token_count).toLocaleString()} tokens
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Handoff arrow between different agents */}
            {showArrow && (
              <div className="flex items-center justify-center py-1.5 text-muted-foreground/40">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Shows live streaming output for a running execution. */
function LiveStreamPanel({ executionId }: { executionId: string }) {
  const stepDeltas = useMonitorStore((s) => s.stepDeltas);
  const activeDeltas = Object.entries(stepDeltas).filter(
    ([key]) => key.startsWith(executionId + ":")
  );

  if (activeDeltas.length === 0) return null;

  return (
    <div className="mx-4 mt-3 space-y-2">
      {activeDeltas.map(([key, delta]) => (
        <div key={key} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-400">{delta.agentName} is typing...</span>
          </div>
          <p className="text-xs text-foreground/80 whitespace-pre-wrap break-words leading-relaxed max-h-32 overflow-y-auto">
            {delta.text}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function ExecutionDetail({ execution, onClose }: ExecutionDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>("steps");
  const [selectedStep, setSelectedStep] = useState<ExecutionStep | null>(null);
  const isLive = execution.status === "running";

  const { data: steps, isLoading: stepsLoading } = useQuery({
    queryKey: ["execution-steps", execution.id],
    queryFn: () => api.executions.steps(execution.id),
    refetchInterval: isLive ? 2000 : false,
  });

  const badge = statusBadge[execution.status] ?? statusBadge.pending;
  const totalTokens = steps?.reduce((sum, s) => sum + (Number(s.token_count) || 0), 0) ?? 0;
  const totalCost = steps?.reduce((sum, s) => sum + (Number(s.cost_usd) || 0), 0) ?? 0;

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
            {execution.id.slice(0, 8)}... · {execution.trigger_type || "manual"} · {formatDuration(execution.started_at, execution.completed_at)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {steps && steps.length > 0 && execution.status !== "running" && (
            <button
              onClick={() => downloadReport(execution, steps)}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted/50 transition-colors"
              title="Download report"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3 border-b border-border">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">Steps</p>
          <p className="text-sm font-semibold">{steps?.length ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">Iterations</p>
          <p className="text-sm font-semibold">{Number(execution.iteration_count) || 0}</p>
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

      {/* Live streaming output */}
      {isLive && <LiveStreamPanel executionId={execution.id} />}

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
          onClick={() => setActiveTab("conversation")}
          className={cn(
            "px-3 py-2 text-xs font-medium border-b-2 transition-colors",
            activeTab === "conversation"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Conversation
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
              <StepTimeline
                steps={steps ?? []}
                onStepClick={(step) => setSelectedStep(step)}
              />
            )}
          </div>
        )}
        {activeTab === "conversation" && (
          <ConversationView steps={steps ?? []} />
        )}
      </div>

      {/* Step Detail Modal */}
      {selectedStep && (
        <StepDetailModal
          step={selectedStep}
          onClose={() => setSelectedStep(null)}
        />
      )}
    </div>
  );
}
