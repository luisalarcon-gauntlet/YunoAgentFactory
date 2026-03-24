import { useState } from "react";
import AgentList from "@/components/agents/AgentList";
import type { Agent } from "@/lib/api";

export default function AgentsPage() {
  const [_editingAgent, setEditingAgent] = useState<Agent | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Agents</h2>
          <p className="text-sm text-muted-foreground">Manage your AI agents</p>
        </div>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
          Create Agent
        </button>
      </div>
      <AgentList onEdit={setEditingAgent} />
    </div>
  );
}
