import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type Execution } from "@/lib/api";
import { cn } from "@/lib/utils";
import ExecutionList from "@/components/executions/ExecutionList";
import ExecutionDetail from "@/components/executions/ExecutionDetail";
import ExecutionErrorBoundary from "@/components/executions/ExecutionErrorBoundary";

export default function ExecutionsPage() {
  const [searchParams] = useSearchParams();
  const initialExecId = searchParams.get("execution");
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);

  // Fetch execution by URL param so the detail panel opens on direct links
  const { data: initialExec } = useQuery({
    queryKey: ["execution", initialExecId],
    queryFn: () => api.executions.get(initialExecId!),
    enabled: !!initialExecId && !selectedExecution,
    retry: false,
  });

  useEffect(() => {
    if (initialExec && !selectedExecution) {
      setSelectedExecution(initialExec);
    }
  }, [initialExec, selectedExecution]);

  const handleSelect = (exec: Execution) => {
    setSelectedExecution(exec);
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-48px)] -m-3 -mt-14 md:-m-6">
      {/* Left: Execution list — full width on mobile when no selection, side panel on desktop */}
      <div className={cn(
        "md:w-80 border-r border-border bg-card/30 flex flex-col overflow-hidden",
        selectedExecution ? "hidden md:flex" : "flex"
      )}>
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Execution Runs</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Workflow execution history
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <ExecutionList
            selectedId={selectedExecution?.id ?? initialExecId ?? undefined}
            onSelect={handleSelect}
            onDeleted={(id) => {
              if (selectedExecution?.id === id) setSelectedExecution(null);
            }}
          />
        </div>
      </div>

      {/* Right: Detail view */}
      <div className={cn(
        "flex-1 overflow-hidden",
        selectedExecution ? "flex flex-col" : "hidden md:block"
      )}>
        {selectedExecution ? (
          <ExecutionErrorBoundary
            key={selectedExecution.id}
            onReset={() => setSelectedExecution(null)}
          >
            <ExecutionDetail
              execution={selectedExecution}
              onClose={() => setSelectedExecution(null)}
            />
          </ExecutionErrorBoundary>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mx-auto mb-3 opacity-30">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
              </svg>
              <p className="text-sm">Select an execution to view details</p>
              <p className="text-xs mt-1">Click on a run from the list</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
