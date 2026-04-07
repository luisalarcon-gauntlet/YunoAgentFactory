import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  api,
  OverviewMetrics,
  ExecutionsPerDay,
  ErrorSummaryItem,
  WorkflowPerformanceItem,
} from "@/lib/api";

// ── Overview Cards ──

function OverviewCards({ period }: { period: string }) {
  const { data, isLoading, error } = useQuery<OverviewMetrics>({
    queryKey: ["analytics", "overview", period],
    queryFn: () => api.analytics.overview(period),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-4 py-3 rounded-lg border border-border bg-card animate-pulse h-20" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">
        Failed to load overview metrics
      </div>
    );
  }

  const cards = [
    { label: "Total Runs", value: data.total_executions.toLocaleString(), color: "text-foreground" },
    { label: "Success Rate", value: `${data.success_rate}%`, color: "text-emerald-500" },
    { label: "Failures", value: data.failure_count.toLocaleString(), color: data.failure_count > 0 ? "text-red-500" : "text-foreground" },
    { label: "Avg Duration", value: `${data.avg_duration_seconds.toFixed(1)}s`, color: "text-foreground" },
    { label: "Tokens Used", value: data.total_tokens.toLocaleString(), color: "text-foreground" },
    { label: "Est. Cost", value: `$${Number(data.total_cost_usd).toFixed(4)}`, color: "text-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="px-4 py-3 rounded-lg border border-border bg-card">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{card.label}</p>
          <p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Executions Chart (pure CSS bars, no recharts needed) ──

function ExecutionsChart() {
  const { data, isLoading, error } = useQuery<ExecutionsPerDay[]>({
    queryKey: ["analytics", "executions-over-time"],
    queryFn: () => api.analytics.executionsOverTime(),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 h-64 animate-pulse" />
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
        Failed to load chart data
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        No executions recorded yet
      </div>
    );
  }

  const maxTotal = Math.max(...data.map((d) => d.total), 1);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground mb-4">Executions Over Time (14 days)</h3>
      <div role="img" aria-label={`Bar chart showing executions over ${data.length} days. Total: ${data.reduce((s, d) => s + d.total, 0)} executions, ${data.reduce((s, d) => s + d.succeeded, 0)} succeeded, ${data.reduce((s, d) => s + d.failed, 0)} failed.`} className="flex items-end gap-1.5 h-48">
        {data.map((day) => {
          const failedHeight = (day.failed / maxTotal) * 100;
          const succeededHeight = (day.succeeded / maxTotal) * 100;
          const dateLabel = day.date.slice(5); // MM-DD

          return (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full relative flex flex-col justify-end" style={{ height: "100%" }}>
                <div
                  className="w-full rounded-t-sm bg-emerald-500/80"
                  style={{ height: `${succeededHeight}%`, minHeight: day.succeeded > 0 ? 2 : 0 }}
                  title={`${day.succeeded} succeeded`}
                />
                <div
                  className="w-full bg-red-500/80"
                  style={{ height: `${failedHeight}%`, minHeight: day.failed > 0 ? 2 : 0 }}
                  title={`${day.failed} failed`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground truncate w-full text-center">{dateLabel}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/80" /> Succeeded
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500/80" /> Failed
        </span>
      </div>
    </div>
  );
}

// ── Error Summary Table ──

function ErrorTable() {
  const { data, isLoading, error } = useQuery<ErrorSummaryItem[]>({
    queryKey: ["analytics", "errors"],
    queryFn: () => api.analytics.errors(),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 h-64 animate-pulse" />
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
        Failed to load errors
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground text-sm">
        No errors recorded
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">Recent Errors</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground text-xs">
              <th scope="col" className="px-4 py-2 font-medium">Workflow</th>
              <th scope="col" className="px-4 py-2 font-medium">Agent</th>
              <th scope="col" className="px-4 py-2 font-medium">Error</th>
              <th scope="col" className="px-4 py-2 font-medium text-right">Count</th>
              <th scope="col" className="px-4 py-2 font-medium">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-accent/50 transition-colors">
                <td className="px-4 py-2 font-medium">{row.workflow_name}</td>
                <td className="px-4 py-2 text-muted-foreground">{row.agent_name}</td>
                <td className="px-4 py-2 text-red-400 font-mono text-xs truncate max-w-[200px]" title={row.error_type}>
                  {row.error_type}
                </td>
                <td className="px-4 py-2 text-right font-bold">{row.count}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  {new Date(row.last_occurred).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Workflow Performance Table ──

function WorkflowPerformanceTable() {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<string>("total_runs");
  const [sortDesc, setSortDesc] = useState(true);

  const { data, isLoading, error } = useQuery<WorkflowPerformanceItem[]>({
    queryKey: ["analytics", "workflow-performance"],
    queryFn: () => api.analytics.workflowPerformance(),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 h-64 animate-pulse" />
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
        Failed to load workflow performance
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground text-sm">
        No workflow data yet
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => {
    const av = a[sortBy as keyof WorkflowPerformanceItem] ?? 0;
    const bv = b[sortBy as keyof WorkflowPerformanceItem] ?? 0;
    if (av < bv) return sortDesc ? 1 : -1;
    if (av > bv) return sortDesc ? -1 : 1;
    return 0;
  });

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(col);
      setSortDesc(true);
    }
  };

  const sortIcon = (col: string) => {
    if (sortBy !== col) return "";
    return sortDesc ? " \u25BC" : " \u25B2";
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">Workflow Performance</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground text-xs">
              <th scope="col" className="px-4 py-2 font-medium">Workflow</th>
              <th scope="col" className="px-4 py-2 font-medium">
                <button type="button" onClick={() => handleSort("total_runs")} aria-label={`Sort by runs${sortBy === "total_runs" ? (sortDesc ? ", descending" : ", ascending") : ""}`} className="hover:text-foreground transition-colors">
                  Runs{sortIcon("total_runs")}
                </button>
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                <button type="button" onClick={() => handleSort("success_rate")} aria-label={`Sort by success rate${sortBy === "success_rate" ? (sortDesc ? ", descending" : ", ascending") : ""}`} className="hover:text-foreground transition-colors">
                  Success Rate{sortIcon("success_rate")}
                </button>
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                <button type="button" onClick={() => handleSort("avg_duration_seconds")} aria-label={`Sort by average duration${sortBy === "avg_duration_seconds" ? (sortDesc ? ", descending" : ", ascending") : ""}`} className="hover:text-foreground transition-colors">
                  Avg Duration{sortIcon("avg_duration_seconds")}
                </button>
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                <button type="button" onClick={() => handleSort("last_run")} aria-label={`Sort by last run${sortBy === "last_run" ? (sortDesc ? ", descending" : ", ascending") : ""}`} className="hover:text-foreground transition-colors">
                  Last Run{sortIcon("last_run")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((wf) => (
              <tr
                key={wf.workflow_id}
                className="border-b border-border/50 hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/workflows/${wf.workflow_id}`)}
              >
                <td className="px-4 py-2 font-medium">{wf.workflow_name}</td>
                <td className="px-4 py-2">{wf.total_runs}</td>
                <td className="px-4 py-2">
                  <span className={wf.success_rate >= 80 ? "text-emerald-500" : wf.success_rate >= 50 ? "text-amber-500" : "text-red-500"}>
                    {wf.success_rate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{wf.avg_duration_seconds.toFixed(1)}s</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  {wf.last_run ? new Date(wf.last_run).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ──

const PERIODS = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("7d");

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Analytics</h1>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                period === p.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <OverviewCards period={period} />

      <ExecutionsChart />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ErrorTable />
        <WorkflowPerformanceTable />
      </div>
    </div>
  );
}
