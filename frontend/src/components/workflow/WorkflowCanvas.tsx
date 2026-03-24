import { useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type OnConnect,
  type NodeTypes,
  type EdgeTypes,
  BackgroundVariant,
  ConnectionLineType,
  type OnNodesChange,
  type OnEdgesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export interface WorkflowCanvasProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  nodeTypes?: NodeTypes;
  edgeTypes?: EdgeTypes;
  onNodesChange?: OnNodesChange;
  onEdgesChange?: OnEdgesChange;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  onPaneClick?: () => void;
  readOnly?: boolean;
  nodes?: Node[];
  edges?: Edge[];
  setNodes?: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges?: React.Dispatch<React.SetStateAction<Edge[]>>;
}

const defaultNodes: Node[] = [];
const defaultEdges: Edge[] = [];

export default function WorkflowCanvas({
  initialNodes,
  initialEdges,
  nodeTypes,
  edgeTypes,
  onNodesChange: externalOnNodesChange,
  onEdgesChange: externalOnEdgesChange,
  onNodeClick,
  onPaneClick,
  readOnly = false,
  nodes: controlledNodes,
  edges: controlledEdges,
  setEdges: controlledSetEdges,
}: WorkflowCanvasProps) {
  const [internalNodes, , onInternalNodesChange] = useNodesState(
    initialNodes ?? defaultNodes
  );
  const [internalEdges, setInternalEdges, onInternalEdgesChange] = useEdgesState(
    initialEdges ?? defaultEdges
  );

  const nodes = controlledNodes ?? internalNodes;
  const edges = controlledEdges ?? internalEdges;
  const setEdges = controlledSetEdges ?? setInternalEdges;

  const onNodesChange: OnNodesChange = externalOnNodesChange ?? onInternalNodesChange;
  const onEdgesChange: OnEdgesChange = externalOnEdgesChange ?? onInternalEdgesChange;

  const onConnect: OnConnect = useCallback(
    (params) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "conditionEdge",
            data: { condition: "always", label: "" },
            animated: true,
          },
          eds
        )
      );
    },
    [setEdges]
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode={readOnly ? null : "Delete"}
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: "conditionEdge",
          animated: true,
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="hsl(217.2 32.6% 25%)"
        />
        {!readOnly && (
          <>
            <Controls
              className="!bg-card !border-border !rounded-lg !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!fill-foreground [&>button:hover]:!bg-accent"
            />
            <MiniMap
              className="!bg-card !border-border !rounded-lg"
              nodeColor="hsl(220, 70%, 50%)"
              maskColor="hsla(222.2, 84%, 4.9%, 0.7)"
            />
          </>
        )}
      </ReactFlow>
    </div>
  );
}
