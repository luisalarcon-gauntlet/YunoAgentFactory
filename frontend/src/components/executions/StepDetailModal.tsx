import { useState, useEffect } from "react";
import type { ExecutionStep } from "@/lib/api";
import { cn } from "@/lib/utils";
import MarkdownContent from "@/components/ui/markdown-content";
import { executionStatus } from "@/lib/status";

interface StepDetailModalProps {
  step: ExecutionStep;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  const val = Number(ms) || 0;
  if (val < 1000) return `${Math.round(val)}ms`;
  if (val < 60000) return `${(val / 1000).toFixed(1)}s`;
  return `${(val / 60000).toFixed(1)}m`;
}

function formatCost(usd: number): string {
  const val = Number(usd) || 0;
  if (val === 0) return "$0.00";
  if (val < 0.01) return `$${val.toFixed(4)}`;
  return `$${val.toFixed(3)}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="text-[10px] px-2 py-1 rounded bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

type Tab = "output" | "input";

export default function StepDetailModal({ step, onClose }: StepDetailModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("output");
  const config = executionStatus[step.status] ?? executionStatus.pending;

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="step-detail-title"
        className="relative w-full max-w-3xl max-h-[85vh] mx-4 bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/20">
          <div className="flex items-center gap-3">
            <h3 id="step-detail-title" className="text-sm font-semibold">{step.agent_name ?? step.node_id}</h3>
            <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", config.bg, config.text)}>
              {config.label}
            </span>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="text-muted-foreground hover:text-foreground p-2 rounded transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 py-3 border-b border-border">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Duration</p>
            <p className="text-sm font-semibold mt-0.5">
              {Number(step.duration_ms) > 0 ? formatDuration(step.duration_ms) : "--"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tokens</p>
            <p className="text-sm font-semibold mt-0.5">
              {Number(step.token_count) > 0 ? Number(step.token_count).toLocaleString() : "--"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost</p>
            <p className="text-sm font-semibold mt-0.5">
              {Number(step.cost_usd) > 0 ? formatCost(step.cost_usd) : "--"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Time</p>
            <p className="text-sm font-semibold mt-0.5">
              {step.started_at
                ? new Date(step.started_at).toLocaleTimeString()
                : "--"}
              {step.completed_at && (
                <span className="text-muted-foreground font-normal">
                  {" → "}
                  {new Date(step.completed_at).toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Error */}
        {step.error_message && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-400">{step.error_message}</p>
          </div>
        )}

        {/* Tabs */}
        <div role="tablist" aria-label="Step content" className="flex gap-0 px-5 border-b border-border">
          <button
            role="tab"
            aria-selected={activeTab === "output"}
            aria-controls="step-tab-output"
            onClick={() => setActiveTab("output")}
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 transition-colors",
              activeTab === "output"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Output
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "input"}
            aria-controls="step-tab-input"
            onClick={() => setActiveTab("input")}
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 transition-colors",
              activeTab === "input"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Input (Prompt)
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "output" && (
            <div id="step-tab-output" role="tabpanel" className="p-5">
              {step.output_data ? (
                <>
                  <div className="flex justify-end mb-2">
                    <CopyButton text={step.output_data} />
                  </div>
                  <div className="bg-muted/20 border border-border/50 rounded-lg p-4">
                    <MarkdownContent content={step.output_data} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No output data.</p>
              )}
            </div>
          )}
          {activeTab === "input" && (
            <div id="step-tab-input" role="tabpanel" className="p-5">
              {step.input_data ? (
                <>
                  <div className="flex justify-end mb-2">
                    <CopyButton text={step.input_data} />
                  </div>
                  <div className="bg-muted/20 border border-border/50 rounded-lg p-4">
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words leading-relaxed font-mono text-xs">
                      {step.input_data}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No input data (first step in pipeline).</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
