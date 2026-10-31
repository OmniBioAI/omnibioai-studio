import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  cancelOrchestratorRun: vi.fn(),
  dryRunOrchestrator: vi.fn(),
  loadOrchestratorArtifacts: vi.fn(),
  loadOrchestratorLog: vi.fn(),
  loadOrchestratorRuns: vi.fn(),
  loadOrchestratorStatus: vi.fn(),
  loadOrchestratorStatusDetail: vi.fn(),
  replayOrchestratorRun: vi.fn(),
  submitOrchestratorRun: vi.fn(),
}));
vi.mock("../../src/ui/lib/orchestratorApi", () => api);

import MultiAgentOrchestratorRenderer from "../../src/ui/components/workbench/MultiAgentOrchestratorRenderer";

beforeEach(() => {
  api.loadOrchestratorRuns.mockResolvedValue({ runs: [] });
  api.loadOrchestratorStatus.mockResolvedValue({ run_id: "run-1", state: "RUNNING", progress: 25, steps: { qc: "running" } });
  api.loadOrchestratorStatusDetail.mockResolvedValue({ ok: true, steps: [{ name: "qc", status: "running" }] });
  api.loadOrchestratorLog.mockResolvedValue({ lines: ["Starting DAG execution"] });
  api.loadOrchestratorArtifacts.mockResolvedValue({ outputs: [] });
  api.submitOrchestratorRun.mockResolvedValue({ ok: true, result: { run_id: "run-1", state: "RUNNING" } });
  api.dryRunOrchestrator.mockResolvedValue({ result: { validation: { valid: true, errors: [], step_count: 1 } } });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

describe("MultiAgentOrchestratorRenderer", () => {
  it("renders a dedicated React DAG composer and history without a legacy service view", async () => {
    render(<MultiAgentOrchestratorRenderer />);
    expect(screen.getByText("Compose DAG")).toBeInTheDocument();
    expect(screen.getByLabelText("Workflow plan (JSON)")).toBeInTheDocument();
    expect(screen.getByText("Execution graph")).toBeInTheDocument();
    expect(await screen.findByText("No orchestrator runs yet.")).toBeInTheDocument();
  });

  it("validates and submits the DAG through the orchestrator JSON API", async () => {
    render(<MultiAgentOrchestratorRenderer />);
    const dag = { steps: [{ step_id: "qc", type: "plugin", plugin_slug: "fastq_qc", depends_on: [], inputs: {} }] };
    fireEvent.change(screen.getByLabelText("Workflow plan (JSON)"), { target: { value: JSON.stringify(dag) } });

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByText("DAG is valid")).toBeInTheDocument();
    expect(api.dryRunOrchestrator).toHaveBeenCalledWith({ dag });

    fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));
    await waitFor(() => expect(api.submitOrchestratorRun).toHaveBeenCalledWith({ dag, modelName: "claude-sonnet-4-5" }));
    expect(await screen.findByText("Run · run-1")).toBeInTheDocument();
    await waitFor(() => expect(api.loadOrchestratorLog).toHaveBeenCalledWith("run-1", expect.objectContaining({ signal: expect.any(AbortSignal) })));
  });

  it("rejects an empty DAG in the browser before making a request", async () => {
    render(<MultiAgentOrchestratorRenderer />);
    fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Add at least one step");
    expect(api.submitOrchestratorRun).not.toHaveBeenCalled();
  });
});
