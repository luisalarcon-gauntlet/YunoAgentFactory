import { useState } from "react";
import AgentList from "@/components/agents/AgentList";
import AgentForm from "@/components/agents/AgentForm";
import type { Agent } from "@/lib/api";

export default function AgentsPage() {
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showForm, setShowForm] = useState(false);

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setShowForm(true);
  };

  const handleCreate = () => {
    setEditingAgent(null);
    setShowForm(true);
  };

  const handleClose = () => {
    setShowForm(false);
    setEditingAgent(null);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-semibold">Agents</h2>
          <p className="text-sm text-muted-foreground">Manage your AI agents</p>
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Create Agent
        </button>
      </div>
      <AgentList onEdit={handleEdit} />
      {showForm && (
        <AgentForm agent={editingAgent} onClose={handleClose} />
      )}
    </div>
  );
}
