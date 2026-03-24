import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ReactFlowProvider, type Node, type Edge } from "@xyflow/react";
import { api, type Workflow } from "@/lib/api";
import WorkflowCanvas from "@/components/workflow/WorkflowCanvas";
import AgentNode from "@/components/workflow/AgentNode";
import ConditionEdge from "@/components/workflow/ConditionEdge";
import { cn } from "@/lib/utils";

const nodeTypes = { agentNode: AgentNode };
const edgeTypes = { conditionEdge: ConditionEdge };

function TemplateCard({ template }: { template: Workflow }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const cloneMutation = useMutation({
    mutationFn: () => api.workflows.cloneTemplate(template.id),
    onSuccess: (cloned) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      navigate(`/workflows/${cloned.id}`);
    },
  });

  const nodes: Node[] = useMemo(
    () =>
      (template.graph?.nodes ?? []).map((n) => ({
        ...n,
        type: n.type || "agentNode",
        data: n.data as Record<string, unknown>,
      })),
    [template.graph]
  );

  const edges: Edge[] = useMemo(
    () =>
      (template.graph?.edges ?? []).map((e) => ({
        ...e,
        type: e.type || "conditionEdge",
        animated: true,
        data: e.data as Record<string, unknown>,
      })),
    [template.graph]
  );

  const stableNodeTypes = useMemo(() => nodeTypes, []);
  const stableEdgeTypes = useMemo(() => edgeTypes, []);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden hover:border-primary/30 transition-colors">
      {/* Preview */}
      <div className="h-48 bg-background/50 border-b border-border">
        <ReactFlowProvider>
          <WorkflowCanvas
            initialNodes={nodes}
            initialEdges={edges}
            nodeTypes={stableNodeTypes}
            edgeTypes={stableEdgeTypes}
            readOnly
          />
        </ReactFlowProvider>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="text-sm font-semibold">{template.name}</h3>
        {template.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {template.description}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
          <span>{template.graph?.nodes?.length ?? 0} agents</span>
          <span>{template.graph?.edges?.length ?? 0} connections</span>
          <span>Max {template.max_iterations} iterations</span>
        </div>
        <button
          onClick={() => cloneMutation.mutate()}
          disabled={cloneMutation.isPending}
          className={cn(
            "mt-3 w-full px-3 py-2 text-xs font-medium rounded-md transition-colors",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {cloneMutation.isPending ? "Cloning..." : "Use Template"}
        </button>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const { data: templates, isLoading, error } = useQuery({
    queryKey: ["workflow-templates"],
    queryFn: api.workflows.templates,
  });

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Workflow Templates</h2>
        <p className="text-sm text-muted-foreground">
          Pre-built workflow patterns. Clone and customize.
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card h-72 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load templates: {error.message}
        </div>
      )}

      {templates && templates.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto mb-2 opacity-50">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p className="text-sm">No templates available yet.</p>
          <p className="text-xs mt-1">Templates will appear here once seeded.</p>
        </div>
      )}

      {templates && templates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      )}
    </div>
  );
}
