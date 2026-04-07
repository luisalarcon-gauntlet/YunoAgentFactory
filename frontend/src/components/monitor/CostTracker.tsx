import { useMonitorStore } from "@/stores/monitor-store";

export default function CostTracker() {
  const costSummary = useMonitorStore((s) => s.costSummary);
  const activeExecutions = useMonitorStore((s) => s.activeExecutions);

  const activeCount = Object.values(activeExecutions).filter(
    (e) => e.status === "running"
  ).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="px-3 py-2.5 rounded-lg border border-border bg-card/50">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active Runs</p>
        <p className="text-lg font-bold mt-0.5">{activeCount}</p>
      </div>
      <div className="px-3 py-2.5 rounded-lg border border-border bg-card/50">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Steps (session)</p>
        <p className="text-lg font-bold mt-0.5">{costSummary.stepCount}</p>
      </div>
      <div className="px-3 py-2.5 rounded-lg border border-border bg-card/50">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tokens (session)</p>
        <p className="text-lg font-bold mt-0.5">{costSummary.totalTokens.toLocaleString()}</p>
      </div>
      <div className="px-3 py-2.5 rounded-lg border border-border bg-card/50">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost (session)</p>
        <p className="text-lg font-bold mt-0.5">${costSummary.totalCostUsd.toFixed(4)}</p>
      </div>
    </div>
  );
}
