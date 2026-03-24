import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StepTimeline from "@/components/executions/StepTimeline";
import type { ExecutionStep } from "@/lib/api";

const mockSteps: ExecutionStep[] = [
  {
    id: "step-1",
    execution_id: "exec-1",
    node_id: "node-coder",
    agent_id: "agent-1",
    agent_name: "Coder",
    status: "completed",
    input_data: "Write a calculator",
    output_data: "def add(a, b): return a + b",
    token_count: 150,
    cost_usd: 0.015,
    duration_ms: 2300,
    started_at: "2026-03-24T00:00:00Z",
    completed_at: "2026-03-24T00:00:02Z",
    error_message: null,
    created_at: "2026-03-24T00:00:00Z",
  },
  {
    id: "step-2",
    execution_id: "exec-1",
    node_id: "node-reviewer",
    agent_id: "agent-2",
    agent_name: "Reviewer",
    status: "completed",
    input_data: "def add(a, b): return a + b",
    output_data: "APPROVED: Clean implementation",
    token_count: 80,
    cost_usd: 0.008,
    duration_ms: 1500,
    started_at: "2026-03-24T00:00:03Z",
    completed_at: "2026-03-24T00:00:04Z",
    error_message: null,
    created_at: "2026-03-24T00:00:03Z",
  },
  {
    id: "step-3",
    execution_id: "exec-1",
    node_id: "node-deployer",
    agent_id: "agent-3",
    agent_name: "Deployer",
    status: "failed",
    input_data: "APPROVED code",
    output_data: null,
    token_count: 0,
    cost_usd: 0,
    duration_ms: 500,
    started_at: "2026-03-24T00:00:05Z",
    completed_at: "2026-03-24T00:00:05Z",
    error_message: "Deployment target unreachable",
    created_at: "2026-03-24T00:00:05Z",
  },
];

describe("StepTimeline", () => {
  it("shows empty state when no steps", () => {
    render(<StepTimeline steps={[]} />);
    expect(screen.getByText(/no execution steps/i)).toBeInTheDocument();
  });

  it("renders all steps with agent names", () => {
    render(<StepTimeline steps={mockSteps} />);
    expect(screen.getByText("Coder")).toBeInTheDocument();
    expect(screen.getByText("Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Deployer")).toBeInTheDocument();
  });

  it("displays step status labels", () => {
    render(<StepTimeline steps={mockSteps} />);
    const completedLabels = screen.getAllByText("Completed");
    expect(completedLabels).toHaveLength(2);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("shows error message for failed steps", () => {
    render(<StepTimeline steps={mockSteps} />);
    expect(screen.getByText("Deployment target unreachable")).toBeInTheDocument();
  });

  it("shows output preview for completed steps", () => {
    render(<StepTimeline steps={mockSteps} />);
    expect(screen.getByText(/def add/)).toBeInTheDocument();
    expect(screen.getByText(/APPROVED: Clean implementation/)).toBeInTheDocument();
  });

  it("displays token and cost metrics", () => {
    render(<StepTimeline steps={mockSteps} />);
    expect(screen.getByText("150 tokens")).toBeInTheDocument();
    expect(screen.getByText("80 tokens")).toBeInTheDocument();
  });
});
