import { useMonitorStore } from "@/stores/monitor-store";
import { useEffect, useRef } from "react";
import Badge from "@/components/ui/badge";

interface ActiveExecution {
  execution_id: string;
  workflow_id?: string;
  workflow_name?: string;
  status: string;
  current_node?: string;
  agent_name?: string;
  startedAt: string;
}

interface Props {
  executions: ActiveExecution[];
}

function StreamingOutput({ executionId }: { executionId: string }) {
  const stepDeltas = useMonitorStore((s) => s.stepDeltas);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Find any active delta for this execution
  const activeDeltas = Object.entries(stepDeltas).filter(([key]) =>
    key.startsWith(executionId)
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeDeltas]);

  if (activeDeltas.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground italic px-3 py-2">
        Waiting for agent output...
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="max-h-40 overflow-y-auto">
      {activeDeltas.map(([key, delta]) => (
        <div key={key} className="px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-medium text-emerald-400">
              {delta.agentName || "Agent"}
            </span>
          </div>
          <pre className="text-xs text-foreground/70 whitespace-pre-wrap break-words font-mono leading-relaxed">
            {delta.text || "..."}
          </pre>
        </div>
      ))}
    </div>
  );
}

function ElapsedTime({ startedAt }: { startedAt: string }) {
  const start = new Date(startedAt).getTime();
  const elapsed = Math.floor((Date.now() - start) / 1000);

  if (elapsed < 60) return <span>{elapsed}s</span>;
  return (
    <span>
      {Math.floor(elapsed / 60)}m {elapsed % 60}s
    </span>
  );
}

export default function ActiveRunsPanel({ executions }: Props) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Active Executions
      </h3>
      {executions.map((exec) => (
        <div
          key={exec.execution_id}
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium">
                {exec.workflow_name || exec.execution_id.slice(0, 8)}
              </span>
              {exec.agent_name && (
                <Badge variant="primary">{exec.agent_name}</Badge>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">
              <ElapsedTime startedAt={exec.startedAt} />
            </span>
          </div>

          {/* Streaming output */}
          <StreamingOutput executionId={exec.execution_id} />
        </div>
      ))}
    </div>
  );
}
