import { useCallback } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { AgentNodeData } from "./AgentNode";

interface NodeConfigPanelProps {
  node: Node<AgentNodeData>;
  edges: Edge[];
  onUpdateNode: (nodeId: string, data: Partial<AgentNodeData>) => void;
  onUpdateEdge: (edgeId: string, data: Record<string, unknown>) => void;
  onClose: () => void;
  onDeleteNode: (nodeId: string) => void;
}

export default function NodeConfigPanel({
  node,
  edges,
  onUpdateNode,
  onUpdateEdge,
  onClose,
  onDeleteNode,
}: NodeConfigPanelProps) {
  const nodeData = node.data as AgentNodeData;
  const outgoingEdges = edges.filter((e) => e.source === node.id);
  const incomingEdges = edges.filter((e) => e.target === node.id);

  const handleInstructionChange = useCallback(
    (value: string) => {
      onUpdateNode(node.id, {
        config: { ...nodeData.config, task_instruction: value },
      });
    },
    [node.id, nodeData.config, onUpdateNode]
  );

  return (
    <div className="w-full md:w-72 h-full border-l border-border bg-card md:bg-card/60 backdrop-blur-sm flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Node Config
        </h3>
        <button
          onClick={onClose}
          aria-label="Close config panel"
          className="text-muted-foreground hover:text-foreground p-2.5 rounded transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4 touch-pan-y">
        {/* Agent info */}
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Agent
          </label>
          <div className="mt-1 px-3 py-2 rounded-lg bg-muted/50 border border-border">
            <p className="text-sm font-medium">{nodeData.label}</p>
            {nodeData.role && (
              <p className="text-xs text-muted-foreground mt-0.5">{nodeData.role}</p>
            )}
          </div>
        </div>

        {/* Task instruction */}
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Task Instruction
          </label>
          <textarea
            value={nodeData.config?.task_instruction ?? ""}
            onChange={(e) => handleInstructionChange(e.target.value)}
            placeholder="Instructions for this agent in the workflow..."
            rows={4}
            className="mt-1 w-full px-3 py-2.5 text-sm rounded-lg bg-muted/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
          />
        </div>

        {/* Outgoing edges */}
        {outgoingEdges.length > 0 && (
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Outgoing Conditions
            </label>
            <div className="mt-1 space-y-2">
              {outgoingEdges.map((edge) => (
                <div key={edge.id} className="flex items-center gap-2">
                  <select
                    value={(edge.data as Record<string, string>)?.condition ?? "always"}
                    onChange={(e) =>
                      onUpdateEdge(edge.id, {
                        ...edge.data,
                        condition: e.target.value,
                        label: e.target.value === "always" ? "" : e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1),
                      })
                    }
                    className="flex-1 px-3 py-2.5 text-xs rounded-md bg-muted/50 border border-border focus:border-primary outline-none"
                  >
                    <option value="always">Always</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="contains">Contains</option>
                  </select>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[60px]">
                    → {(edge.data as Record<string, string>)?.targetLabel ?? edge.target}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Incoming edges */}
        {incomingEdges.length > 0 && (
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Incoming ({incomingEdges.length})
            </label>
            <div className="mt-1 space-y-1">
              {incomingEdges.map((edge) => (
                <div key={edge.id} className="text-xs text-muted-foreground px-2 py-1 bg-muted/30 rounded">
                  {edge.source} → {(edge.data as Record<string, string>)?.condition ?? "always"}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Delete node */}
        <div className="pt-2 border-t border-border">
          <button
            onClick={() => onDeleteNode(node.id)}
            className="w-full px-3 py-2.5 text-xs font-medium rounded-md text-destructive-foreground bg-destructive/80 hover:bg-destructive transition-colors"
          >
            Remove from workflow
          </button>
        </div>
      </div>
    </div>
  );
}
