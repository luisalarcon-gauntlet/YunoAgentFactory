import { useState, useRef, useEffect } from "react";

interface RunWorkflowModalProps {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onRun: (input: string) => void;
}

export default function RunWorkflowModal({
  open,
  loading,
  onClose,
  onRun,
}: RunWorkflowModalProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setInput("");
      // Focus after the modal opens
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = () => {
    onRun(input || "Execute the workflow with the configured task instructions");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
        <h2 className="text-base font-semibold text-foreground mb-1">
          Run Workflow
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Provide an initial prompt for the first agent in the workflow.
        </p>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the task for the first agent..."
          rows={5}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          disabled={loading}
        />

        <p className="text-[10px] text-muted-foreground mt-1.5 mb-4">
          Press Ctrl+Enter to run. Leave empty to use default instructions.
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Starting..." : "Run Workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}
