/**
 * Shared status color configuration.
 *
 * Centralises the semantic color mapping for execution statuses,
 * agent statuses, and source badges so every component draws from
 * one source of truth.
 */

// ── Execution / step status badges ──

export interface StatusStyle {
  bg: string;
  text: string;
  dot: string;
  label: string;
}

export const executionStatus: Record<string, StatusStyle> = {
  pending:   { bg: "bg-zinc-500/15",    text: "text-zinc-400",    dot: "bg-zinc-500",    label: "Pending" },
  running:   { bg: "bg-emerald-500/15", text: "text-emerald-400", dot: "bg-emerald-500", label: "Running" },
  completed: { bg: "bg-blue-500/15",    text: "text-blue-400",    dot: "bg-blue-500",    label: "Completed" },
  failed:    { bg: "bg-red-500/15",     text: "text-red-400",     dot: "bg-red-500",     label: "Failed" },
  timed_out: { bg: "bg-amber-500/15",   text: "text-amber-400",   dot: "bg-amber-500",   label: "Timed Out" },
  cancelled: { bg: "bg-zinc-500/15",    text: "text-zinc-400",    dot: "bg-zinc-500",    label: "Cancelled" },
};

// ── Agent status (idle / running / error) ──

export interface AgentStatusStyle {
  dot: string;
  label: string;
}

export const agentStatus: Record<string, AgentStatusStyle> = {
  idle:    { dot: "bg-zinc-500",                  label: "Idle" },
  running: { dot: "bg-emerald-500 animate-pulse", label: "Running" },
  error:   { dot: "bg-red-500",                   label: "Error" },
};

// ── Source badges ──

export interface SourceStyle {
  bg: string;
  text: string;
  label: string;
}

export const sourceBadge: Record<string, SourceStyle> = {
  web:      { bg: "bg-sky-500/15",    text: "text-sky-400",    label: "Web" },
  telegram: { bg: "bg-indigo-500/15", text: "text-indigo-400", label: "Telegram" },
};

// ── Event type colors ──

export const eventTypeColor: Record<string, string> = {
  started:   "text-blue-400",
  output:    "text-emerald-400",
  completed: "text-sky-400",
  error:     "text-red-400",
};

// ── Event dot colors ──

export const eventDotColor: Record<string, string> = {
  started:   "bg-blue-500",
  output:    "bg-emerald-500",
  completed: "bg-sky-500",
  error:     "bg-red-500",
};
