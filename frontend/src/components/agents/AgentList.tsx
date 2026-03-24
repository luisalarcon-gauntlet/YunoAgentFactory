import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Agent } from "@/lib/api";
import AgentCard from "./AgentCard";

interface AgentListProps {
  onEdit: (agent: Agent) => void;
}

export default function AgentList({ onEdit }: AgentListProps) {
  const queryClient = useQueryClient();

  const { data: agents, isLoading, error } = useQuery({
    queryKey: ["agents"],
    queryFn: api.agents.list,
  });

  const deleteMutation = useMutation({
    mutationFn: api.agents.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 animate-pulse h-32" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load agents: {error.message}
      </div>
    );
  }

  if (!agents?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No agents yet. Create your first agent to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          onEdit={onEdit}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      ))}
    </div>
  );
}
