import { useCallback, useState, useMemo, useRef, type DragEvent } from "react";
import { useParams } from "react-router-dom";
import {
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  ReactFlowProvider,
} from "@xyflow/react";
import WorkflowCanvas from "@/components/workflow/WorkflowCanvas";
import AgentNode from "@/components/workflow/AgentNode";
import ConditionEdge from "@/components/workflow/ConditionEdge";
import AgentPalette from "@/components/workflow/AgentPalette";
import NodeConfigPanel from "@/components/workflow/NodeConfigPanel";
import type { Agent } from "@/lib/api";
import type { AgentNodeData } from "@/components/workflow/AgentNode";

const nodeTypes = { agentNode: AgentNode };
const edgeTypes = { conditionEdge: ConditionEdge };

let nodeIdCounter = 0;
function getNextNodeId() {
  return `node-${++nodeIdCounter}`;
}

function WorkflowBuilderInner() {
  const { id } = useParams<{ id?: string }>();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [workflowName, setWorkflowName] = useState(id ? "Loading..." : "Untitled Workflow");

  // Will be used in commit 33
  void id;

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Drag and drop from palette
  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const agentJson = event.dataTransfer.getData("application/yuno-agent");
      if (!agentJson) return;

      const agent: Agent = JSON.parse(agentJson);
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node<AgentNodeData> = {
        id: getNextNodeId(),
        type: "agentNode",
        position,
        data: {
          label: agent.name,
          role: agent.role,
          agent_id: agent.id,
          status: "idle",
          channels: agent.channels,
          model: agent.model,
          config: { task_instruction: "" },
        },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes]
  );

  // Node config panel handlers
  const onUpdateNode = useCallback(
    (nodeId: string, data: Partial<AgentNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
        )
      );
    },
    [setNodes]
  );

  const onUpdateEdge = useCallback(
    (edgeId: string, data: Record<string, unknown>) => {
      setEdges((eds) =>
        eds.map((e) => (e.id === edgeId ? { ...e, data } : e))
      );
    },
    [setEdges]
  );

  const onDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      setSelectedNode(null);
    },
    [setNodes, setEdges]
  );

  const stableNodeTypes = useMemo(() => nodeTypes, []);
  const stableEdgeTypes = useMemo(() => edgeTypes, []);

  return (
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
          <span className="text-xs text-muted-foreground">
            {nodes.length} node{nodes.length !== 1 ? "s" : ""} · {edges.length} edge{edges.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 text-xs font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
            Save
          </button>
          <button
            disabled={nodes.length === 0}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Run
          </button>
        </div>
      </div>

      {/* Main area: palette + canvas + config panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Agent palette */}
        <AgentPalette />

        {/* Center: Canvas */}
        <div
          ref={reactFlowWrapper}
          className="flex-1 relative"
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <WorkflowCanvas
            nodes={nodes}
            edges={edges}
            setNodes={setNodes}
            setEdges={setEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={stableNodeTypes}
            edgeTypes={stableEdgeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
          />
        </div>

        {/* Right: Node config panel */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode as Node<AgentNodeData>}
            edges={edges}
            onUpdateNode={onUpdateNode}
            onUpdateEdge={onUpdateEdge}
            onClose={() => setSelectedNode(null)}
            onDeleteNode={onDeleteNode}
          />
        )}
      </div>
    </div>
  );
}

export default function WorkflowBuilderPage() {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner />
    </ReactFlowProvider>
  );
}
