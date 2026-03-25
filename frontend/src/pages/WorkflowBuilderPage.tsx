import { useCallback, useState, useMemo, useRef, useEffect, type DragEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  ReactFlowProvider,
} from "@xyflow/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import WorkflowCanvas from "@/components/workflow/WorkflowCanvas";
import AgentNode from "@/components/workflow/AgentNode";
import ConditionEdge from "@/components/workflow/ConditionEdge";
import AgentPalette from "@/components/workflow/AgentPalette";
import NodeConfigPanel from "@/components/workflow/NodeConfigPanel";
import RunWorkflowModal from "@/components/workflow/RunWorkflowModal";
import { api, type Agent, type WorkflowGraph } from "@/lib/api";
import type { AgentNodeData } from "@/components/workflow/AgentNode";

const nodeTypes = { agentNode: AgentNode };
const edgeTypes = { conditionEdge: ConditionEdge };

let nodeIdCounter = 0;
function getNextNodeId() {
  return `node-${++nodeIdCounter}`;
}

function serializeGraph(nodes: Node[], edges: Edge[]): WorkflowGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type ?? "agentNode",
      position: n.position,
      data: n.data as Record<string, unknown>,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      data: e.data as Record<string, unknown>,
    })),
  };
}

function WorkflowBuilderInner() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [workflowName, setWorkflowName] = useState("Untitled Workflow");
  const [workflowDesc, setWorkflowDesc] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [runModalOpen, setRunModalOpen] = useState(false);

  // Load existing workflow
  const { data: workflow } = useQuery({
    queryKey: ["workflow", id],
    queryFn: () => api.workflows.get(id!),
    enabled: !!id,
  });

  // Apply loaded workflow to canvas
  useEffect(() => {
    if (!workflow) return;
    setWorkflowName(workflow.name);
    setWorkflowDesc(workflow.description ?? "");
    if (workflow.graph?.nodes) {
      const loaded = workflow.graph.nodes.map((n) => ({
        ...n,
        data: n.data as AgentNodeData,
      }));
      setNodes(loaded);
      // Track highest node id
      loaded.forEach((n) => {
        const match = n.id.match(/node-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num >= nodeIdCounter) nodeIdCounter = num;
        }
      });
    }
    if (workflow.graph?.edges) {
      setEdges(
        workflow.graph.edges.map((e) => ({
          ...e,
          animated: true,
        }))
      );
    }
  }, [workflow, setNodes, setEdges]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const graph = serializeGraph(nodes, edges);
      if (id) {
        return api.workflows.update(id, { name: workflowName, description: workflowDesc || undefined, graph });
      }
      return api.workflows.create({ name: workflowName, description: workflowDesc || undefined, graph });
    },
    onSuccess: (result) => {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
      if (!id && result) {
        navigate(`/workflows/${result.id}`, { replace: true });
      }
    },
    onError: () => {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  // Run mutation
  const runMutation = useMutation({
    mutationFn: async (input: string) => {
      // Save first if needed
      let workflowId = id;
      if (!workflowId) {
        const graph = serializeGraph(nodes, edges);
        const created = await api.workflows.create({ name: workflowName, description: workflowDesc || undefined, graph });
        workflowId = created.id;
        navigate(`/workflows/${created.id}`, { replace: true });
      }
      return api.executions.run(workflowId, input);
    },
    onSuccess: (execution) => {
      setRunModalOpen(false);
      if (execution) {
        navigate(`/runs?execution=${execution.id}`);
      }
    },
  });

  const handleSave = useCallback(() => {
    setSaveStatus("saving");
    saveMutation.mutate();
  }, [saveMutation]);

  const handleRun = useCallback(() => {
    setRunModalOpen(true);
  }, []);

  const handleRunSubmit = useCallback(
    (input: string) => {
      runMutation.mutate(input);
    },
    [runMutation]
  );

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

  const saveLabel = saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Error" : "Save";

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
          <input
            type="text"
            value={workflowDesc}
            onChange={(e) => setWorkflowDesc(e.target.value)}
            className="bg-transparent text-xs text-muted-foreground border-none outline-none focus:ring-1 focus:ring-primary rounded px-2 py-1 w-48"
            placeholder="Description (optional)"
          />
          <span className="text-xs text-muted-foreground">
            {nodes.length} node{nodes.length !== 1 ? "s" : ""} · {edges.length} edge{edges.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            {saveLabel}
          </button>
          <button
            onClick={handleRun}
            disabled={nodes.length === 0 || runMutation.isPending}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {runMutation.isPending ? "Starting..." : "Run"}
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

      {/* Run workflow modal */}
      <RunWorkflowModal
        open={runModalOpen}
        loading={runMutation.isPending}
        onClose={() => setRunModalOpen(false)}
        onRun={handleRunSubmit}
      />
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
