import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { nativePluginRequest, csrfToken, pluginEndpoint } = vi.hoisted(() => ({ nativePluginRequest: vi.fn(), csrfToken: vi.fn(() => "csrf"), pluginEndpoint: vi.fn(path => path) }));
vi.mock("../../src/ui/lib/nativePluginApi", () => ({ nativePluginRequest }));
vi.mock("../../src/ui/lib/pluginApi", () => ({ csrfToken, pluginEndpoint }));

import { PipelineDashboardRenderer, WorkflowExplorerRenderer, WorkflowRegistryAdminRenderer, WorkflowSchedulerRenderer, WorkflowValidatorRenderer } from "../../src/ui/components/workbench/PipelinePluginReactRenderers";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Pipeline-category React plugin renderers", () => {
  it("validates source and renders severity-filterable findings", async () => {
    nativePluginRequest.mockResolvedValue({ status: "warnings", workflow_language: "wdl", errors: [{ rule_id: "E1", category: "syntax", message: "Broken token", line: 4 }], warnings: [], info: [], report_id: "rep-1", duration_ms: 8 });
    render(<WorkflowValidatorRenderer />);
    fireEvent.change(screen.getByLabelText("Workflow source"), { target: { value: "workflow test {}" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate workflow" }));
    expect(await screen.findByText(/1 errors/)).toBeInTheDocument();
    expect(screen.getByText("Broken token")).toBeInTheDocument();
    expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/workflow_validator/validate/", expect.objectContaining({ method: "POST", body: expect.objectContaining({ content: "workflow test {}", language: "wdl" }) }));
  });

  it("loads scheduler data and submits an explicit schedule through the JSON API", async () => {
    nativePluginRequest.mockImplementation(async path => path.includes("api/scheduler/status")
      ? { active_schedules: 1 } : { schedules: [] });
    render(<WorkflowSchedulerRenderer />);
    await screen.findByText("Schedules");
    fireEvent.click(screen.getByRole("button", { name: /new schedule/i }));
    fireEvent.change(screen.getByLabelText("Schedule name"), { target: { value: "Nightly run" } });
    fireEvent.change(screen.getByLabelText("Workflow ID"), { target: { value: "wf-1" } });
    nativePluginRequest.mockImplementation(async (path, options) => options?.method === "POST" ? { schedule: { id: 1 } } : path.includes("api/scheduler/status") ? { active_schedules: 1 } : { schedules: [] });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/workflow_scheduler/api/schedules", expect.objectContaining({ method: "POST", body: expect.objectContaining({ name: "Nightly run", workflow_id: "wf-1" }) })));
  });

  it("loads the staff-only workflow run history", async () => {
    nativePluginRequest.mockResolvedValue({ runs: [{ run_id: "run-1", workflow_name: "rnaseq", engine: "nextflow", state: "COMPLETED", start_time: "2026-10-30T00:00:00Z" }] });
    render(<WorkflowExplorerRenderer />);
    expect(await screen.findByText("rnaseq")).toBeInTheDocument();
    expect(nativePluginRequest).toHaveBeenCalledWith("/dashboard/workflows/api/runs/?limit=100");
  });

  it("loads owner-scoped pipeline dashboard data", async () => {
    nativePluginRequest.mockResolvedValue({ pipelines: [{ pipeline_run_id: "pipe-1", overall_state: "COMPLETED", steps: [], state_counts: { COMPLETED: 2 } }], n_pipelines: 1, total_steps: 2 });
    render(<PipelineDashboardRenderer />);
    expect(await screen.findByText("pipe-1")).toBeInTheDocument();
  });

  it("loads registry records from the staff JSON API", async () => {
    nativePluginRequest.mockResolvedValue({ records: [{ id: 5, enabled: true, object_id: "obj-1", manifest: { category: "rnaseq", engine: "nextflow", name: "rnaseq-v1", display_name: "RNA-seq", version: "1.0.0" } }] });
    render(<WorkflowRegistryAdminRenderer />);
    expect(await screen.findByText("RNA-seq")).toBeInTheDocument();
    expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/workflow_registry_admin/api/registry/");
  });
});
