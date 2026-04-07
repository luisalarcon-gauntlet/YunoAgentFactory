import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Execution, type ExecutionStep, type AgentEvent } from "@/lib/api";
import { downloadReport } from "@/lib/export-report";
import StepTimeline from "./StepTimeline";
import StepDetailModal from "./StepDetailModal";
import { cn } from "@/lib/utils";
import { useMonitorStore } from "@/stores/monitor-store";
import MarkdownContent from "@/components/ui/markdown-content";
import Badge from "@/components/ui/badge";
import Skeleton from "@/components/ui/skeleton";
import EmptyState from "@/components/ui/empty-state";
import { executionStatus, sourceBadge, eventTypeColor, eventDotColor } from "@/lib/status";

interface ExecutionDetailProps {
  execution: Execution;
  onClose: () => void;
}

type Tab = "steps" | "conversation" | "events";

function EventTimeline({ events }: { events: AgentEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState title="No events recorded yet." />
    );
  }

  return (
    <div className="p-4 space-y-2">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex gap-3 items-start px-3 py-2 rounded-lg border border-border/50 bg-card/30"
        >
          {/* Dot */}
          <div className="mt-1.5 shrink-0">
            <span
              className={cn(
                "block w-2 h-2 rounded-full",
                eventDotColor[event.event_type] ?? "bg-red-500"
              )}
            />
          </div>
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">{event.agent_name}</span>
              <span className={cn("text-[10px] font-medium", eventTypeColor[event.event_type] ?? "text-muted-foreground")}>
                {event.event_type}
              </span>
              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
            {event.message && event.event_type !== "started" && event.event_type !== "completed" && (
              <div className="mt-1">
                <MarkdownContent content={event.message} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

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
      <EmptyState title="No conversation yet." />
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
                    {isLong && !isExpanded ? (
                      <p className="text-xs text-foreground/85 whitespace-pre-wrap break-words leading-relaxed">
                        {output.slice(0, 400)}...
                      </p>
                    ) : (
                      <MarkdownContent content={output} />
                    )}
                    {isLong && (
                      <button
                        onClick={() => toggleBubble(step.id)}
                        className="text-xs text-primary hover:text-primary/80 mt-1.5 px-2 py-1 rounded hover:bg-primary/10 transition-colors"
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

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

/** Shows live streaming output for a running execution. */
function LiveStreamPanel({ executionId }: { executionId: string }) {
  const stepDeltas = useMonitorStore((s) => s.stepDeltas);
  const stepHeartbeats = useMonitorStore((s) => s.stepHeartbeats);

  const activeDeltas = Object.entries(stepDeltas).filter(
    ([key]) => key.startsWith(executionId + ":")
  );
  const activeHeartbeats = Object.entries(stepHeartbeats).filter(
    ([key]) => key.startsWith(executionId + ":")
  );

  // Merge: show heartbeat-only entries (thinking, no deltas yet) alongside delta entries
  const shownKeys = new Set(activeDeltas.map(([k]) => k));
  const thinkingOnly = activeHeartbeats.filter(([k]) => !shownKeys.has(k));

  if (activeDeltas.length === 0 && thinkingOnly.length === 0) return null;

  return (
    <div className="mx-4 mt-3 space-y-2">
      {/* Steps that are thinking (no output yet) */}
      {thinkingOnly.map(([key, hb]) => (
        <div key={key} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <span className="text-xs font-medium text-amber-400">{hb.agentName} is thinking...</span>
            <span className="text-[10px] text-amber-400/60 ml-auto tabular-nums">
              {formatElapsed(hb.elapsedSeconds)}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Agent is processing the request. This can take several minutes for complex tasks.
          </p>
        </div>
      ))}

      {/* Steps that are actively streaming output */}
      {activeDeltas.map(([key, delta]) => {
        const hb = stepHeartbeats[key];
        return (
          <div key={key} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400">{delta.agentName} is typing...</span>
              {hb && (
                <span className="text-[10px] text-emerald-400/60 ml-auto tabular-nums">
                  {formatElapsed(hb.elapsedSeconds)}
                </span>
              )}
            </div>
            <p className="text-xs text-foreground/80 whitespace-pre-wrap break-words leading-relaxed max-h-96 overflow-y-auto">
              {delta.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function ExecutionDetail({ execution, onClose }: ExecutionDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>("steps");
  const [selectedStep, setSelectedStep] = useState<ExecutionStep | null>(null);
  const queryClient = useQueryClient();
  const isLive = execution.status === "running";
  const isCancellable = execution.status === "running" || execution.status === "pending";

  const cancelMutation = useMutation({
    mutationFn: () => api.executions.cancel(execution.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["executions"] });
      queryClient.invalidateQueries({ queryKey: ["execution-steps", execution.id] });
    },
  });

  const { data: steps, isLoading: stepsLoading } = useQuery({
    queryKey: ["execution-steps", execution.id],
    queryFn: () => api.executions.steps(execution.id),
    refetchInterval: isLive ? 2000 : false,
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["run-events", execution.id],
    queryFn: () => api.runs.events(execution.id),
    refetchInterval: isLive ? 3000 : false,
  });

  const badge = executionStatus[execution.status] ?? executionStatus.pending;
  const totalTokens = steps?.reduce((sum, s) => sum + (Number(s.token_count) || 0), 0) ?? 0;
  const totalCost = steps?.reduce((sum, s) => sum + (Number(s.cost_usd) || 0), 0) ?? 0;

  // Extract live app URL from the last completed step's output (port range 9000-9099)
  const liveAppUrl = (() => {
    if (!steps || steps.length === 0) return null;
    const completedSteps = steps.filter((s) => s.status === "completed" && s.output_data);
    for (let i = completedSteps.length - 1; i >= 0; i--) {
      const match = completedSteps[i].output_data?.match(/https?:\/\/[\w.\-]+:9\d{3}\b[^\s)"]*/);
      if (match) return match[0];
    }
    return null;
  })();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onClose}
              aria-label="Back to list"
              className="md:hidden text-muted-foreground hover:text-foreground p-2.5 -ml-1 rounded transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
            </button>
            <h3 className="text-sm font-semibold truncate">
              {execution.workflow_name ?? "Execution"}
            </h3>
            <Badge pill className={cn(badge.bg, badge.text)}>
              {execution.status}
            </Badge>
            {execution.source && (() => {
              const sb = sourceBadge[execution.source] ?? sourceBadge.web;
              return (
                <Badge pill className={cn(sb.bg, sb.text)}>
                  {sb.label}
                </Badge>
              );
            })()}
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
        <div className="flex items-center gap-2">
          {isCancellable && (
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="text-xs font-medium px-3 py-2 rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
              title="Cancel execution"
            >
              {cancelMutation.isPending ? "Cancelling..." : "Cancel"}
            </button>
          )}
          {steps && steps.length > 0 && execution.status !== "running" && (
            <button
              onClick={() => downloadReport(execution, steps)}
              className="text-muted-foreground hover:text-foreground p-2.5 rounded hover:bg-muted/50 transition-colors"
              aria-label="Download report"
              title="Download report"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close details"
            className="text-muted-foreground hover:text-foreground p-2.5 rounded transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
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

      {/* Live App Link */}
      {liveAppUrl && execution.status === "completed" && (
        <div className="mx-4 mt-3">
          <a
            href={liveAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Open Live App
          </a>
        </div>
      )}

      {/* Error */}
      {execution.error_message && (
        <div role="alert" className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400">{execution.error_message}</p>
        </div>
      )}

      {/* Live streaming output */}
      {isLive && <LiveStreamPanel executionId={execution.id} />}

      {/* Tabs */}
      <div role="tablist" aria-label="Execution details" className="flex gap-0 px-4 border-b border-border">
        <button
          role="tab"
          aria-selected={activeTab === "steps"}
          aria-controls="exec-tab-steps"
          onClick={() => setActiveTab("steps")}
          className={cn(
            "px-3 py-2.5 text-xs font-medium border-b-2 transition-colors",
            activeTab === "steps"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Steps
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "conversation"}
          aria-controls="exec-tab-conversation"
          onClick={() => setActiveTab("conversation")}
          className={cn(
            "px-3 py-2.5 text-xs font-medium border-b-2 transition-colors",
            activeTab === "conversation"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Conversation
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "events"}
          aria-controls="exec-tab-events"
          onClick={() => setActiveTab("events")}
          className={cn(
            "px-3 py-2.5 text-xs font-medium border-b-2 transition-colors",
            activeTab === "events"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Events{events && events.length > 0 ? ` (${events.length})` : ""}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "steps" && (
          <div id="exec-tab-steps" role="tabpanel" className="px-4 py-3">
            {stepsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : (
              <StepTimeline
                steps={steps ?? []}
                executionId={execution.id}
                onStepClick={(step) => setSelectedStep(step)}
              />
            )}
          </div>
        )}
        {activeTab === "conversation" && (
          <div id="exec-tab-conversation" role="tabpanel">
            <ConversationView steps={steps ?? []} />
          </div>
        )}
        {activeTab === "events" && (
          eventsLoading ? (
            <div id="exec-tab-events" role="tabpanel" className="px-4 py-3 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <div id="exec-tab-events" role="tabpanel">
              <EventTimeline events={events ?? []} />
            </div>
          )
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
