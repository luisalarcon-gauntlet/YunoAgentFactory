import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Agent, type AgentCreate } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AgentFormProps {
  agent?: Agent | null;
  onClose: () => void;
}

const MODEL_OPTIONS = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-haiku-4-20250514",
];

const TOOL_OPTIONS = ["shell", "file_read", "file_write", "browser", "code_interpreter"];
const CHANNEL_OPTIONS = ["webchat", "telegram"];

function TagInput({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      <div className="flex flex-wrap gap-2 mt-1.5">
        {options.map((opt) => {
          const isActive = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() =>
                onChange(
                  isActive
                    ? selected.filter((s) => s !== opt)
                    : [...selected, opt]
                )
              }
              className={cn(
                "px-3 py-2 text-xs rounded-md border transition-colors",
                isActive
                  ? "bg-primary/15 border-primary/50 text-primary"
                  : "bg-muted/30 border-border text-muted-foreground hover:border-primary/30"
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AgentForm({ agent, onClose }: AgentFormProps) {
  const queryClient = useQueryClient();
  const isEdit = !!agent;

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState(MODEL_OPTIONS[0]);
  const [tools, setTools] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [skills, setSkills] = useState("");
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [guardrailMaxTokens, setGuardrailMaxTokens] = useState("4096");
  const [guardrailMaxCost, setGuardrailMaxCost] = useState("1.00");

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setRole(agent.role);
      setSystemPrompt(agent.system_prompt);
      setModel(agent.model);
      setTools(agent.tools);
      setChannels(agent.channels);
      setSkills(agent.skills.join(", "));
      setMemoryEnabled((agent.memory as Record<string, boolean>).enabled !== false);
      if (agent.guardrails) {
        setGuardrailMaxTokens(String((agent.guardrails as Record<string, number>).max_tokens ?? 4096));
        setGuardrailMaxCost(String((agent.guardrails as Record<string, number>).max_cost_usd ?? 1.0));
      }
    }
  }, [agent]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: AgentCreate = {
        name,
        role,
        system_prompt: systemPrompt,
        model,
        tools,
        channels,
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        schedule: null,
        memory: { enabled: memoryEnabled },
        guardrails: {
          max_tokens: parseInt(guardrailMaxTokens, 10) || 4096,
          max_cost_usd: parseFloat(guardrailMaxCost) || 1.0,
        },
      };
      if (isEdit) {
        return api.agents.update(agent!.id, payload);
      }
      return api.agents.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-form-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] mx-4 md:mx-0 rounded-xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 id="agent-form-title" className="text-sm font-semibold">
            {isEdit ? "Edit Agent" : "Create Agent"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-muted-foreground hover:text-foreground p-2.5 rounded transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 text-sm rounded-lg bg-muted/30 border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              placeholder="e.g. Coder Agent"
            />
          </div>

          {/* Role */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Role *
            </label>
            <input
              type="text"
              required
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 text-sm rounded-lg bg-muted/30 border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              placeholder="e.g. Writes clean, well-documented code"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              System Prompt *
            </label>
            <textarea
              required
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
              className="mt-1 w-full px-3 py-2.5 text-sm rounded-lg bg-muted/30 border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
              placeholder="You are a senior developer who..."
            />
          </div>

          {/* Model */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 text-sm rounded-lg bg-muted/30 border border-border focus:border-primary outline-none"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Tools */}
          <TagInput label="Tools" options={TOOL_OPTIONS} selected={tools} onChange={setTools} />

          {/* Channels */}
          <TagInput label="Channels" options={CHANNEL_OPTIONS} selected={channels} onChange={setChannels} />

          {/* Memory */}
          <div className="border border-border rounded-lg p-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Memory
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={memoryEnabled}
                aria-label="Memory enabled"
                onClick={() => setMemoryEnabled(!memoryEnabled)}
                className={cn(
                  "w-8 h-4 rounded-full transition-colors relative",
                  memoryEnabled ? "bg-primary" : "bg-muted"
                )}
              >
                <span className={cn(
                  "absolute left-0 top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                  memoryEnabled ? "translate-x-4" : "translate-x-0.5"
                )} />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {memoryEnabled ? "Agent retains conversation context" : "Agent operates statelessly"}
            </p>
          </div>

          {/* Guardrails */}
          <div className="border border-border rounded-lg p-3 space-y-2">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Guardrails
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Max Tokens</label>
                <input
                  type="number"
                  value={guardrailMaxTokens}
                  onChange={(e) => setGuardrailMaxTokens(e.target.value)}
                  className="mt-0.5 w-full px-3 py-2.5 text-xs rounded-md bg-muted/30 border border-border focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Max Cost (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={guardrailMaxCost}
                  onChange={(e) => setGuardrailMaxCost(e.target.value)}
                  className="mt-0.5 w-full px-3 py-2.5 text-xs rounded-md bg-muted/30 border border-border focus:border-primary outline-none"
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {mutation.isError && (
            <div role="alert" aria-live="assertive" className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {mutation.error.message}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!name || !role || !systemPrompt || mutation.isPending}
            className="px-4 py-2.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? "Saving..." : isEdit ? "Update Agent" : "Create Agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
