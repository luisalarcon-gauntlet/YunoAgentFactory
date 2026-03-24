import { useCallback, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  ReactFlowProvider,
} from "@xyflow/react";
import WorkflowCanvas from "@/components/workflow/WorkflowCanvas";
import AgentNode from "@/components/workflow/AgentNode";
import ConditionEdge from "@/components/workflow/ConditionEdge";

const nodeTypes = { agentNode: AgentNode };
const edgeTypes = { conditionEdge: ConditionEdge };

export default function WorkflowBuilderPage() {
  const { id } = useParams<{ id?: string }>();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [workflowName, setWorkflowName] = useState(id ? "Loading..." : "Untitled Workflow");

  // Will be used in commits 32-33
  void onNodesChange;
  void onEdgesChange;
  void selectedNode;
  void id;

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Stable references (defined outside component as constants)
  const stableNodeTypes = useMemo(() => nodeTypes, []);
  const stableEdgeTypes = useMemo(() => edgeTypes, []);

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-[calc(100vh-0px)] -m-6">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/80 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              className="bg-transparent text-sm font-semibold border-none outline-none focus:ring-1 focus:ring-primary rounded px-2 py-1 w-64"
              placeholder="Workflow name"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 text-xs font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
              Save
            </button>
            <button className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              Run
            </button>
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex-1 relative">
          <WorkflowCanvas
            nodes={nodes}
            edges={edges}
            setNodes={setNodes}
            setEdges={setEdges}
            nodeTypes={stableNodeTypes}
            edgeTypes={stableEdgeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
          />
        </div>
      </div>
    </ReactFlowProvider>
  );
}
