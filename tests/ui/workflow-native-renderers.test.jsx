import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { builder, compiler } = vi.hoisted(() => ({
  builder: {
    palette: vi.fn(), list: vi.fn(), get: vi.fn(), save: vi.fn(), remove: vi.fn(),
    execute: vi.fn(), execution: vi.fn(), cancel: vi.fn(),
  },
  compiler: { compileWorkflow: vi.fn(), compileSkills: vi.fn() },
}));
vi.mock("../../src/ui/lib/workflowNativeApi", () => ({ workflowBuilderApi: builder, workflowCompilerApi: compiler }));

import { WorkflowBuilderRenderer, WorkflowCompilerRenderer } from "../../src/ui/components/workbench/WorkflowNativeRenderers";

beforeEach(() => {
  builder.palette.mockResolvedValue({ items: [{ slug: "fastq_qc" }] });
  builder.list.mockResolvedValue({ workflows: [] });
  builder.save.mockResolvedValue({ ok: true });
  builder.execute.mockResolvedValue({ ok: true, exec_id: "exec-1", status: "COMPLETED" });
  compiler.compileSkills.mockResolvedValue({ status: "success", result: { steps: [{ id: "qc" }] } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("workflow-native React renderers", () => {
  it("saves and executes an owner-scoped workflow definition", async () => {
    render(<WorkflowBuilderRenderer />);
    expect(await screen.findByText("1 plugins available")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nodes, edges, and metadata (JSON)"), { target: { value: JSON.stringify({ nodes: [{ id: "qc", type: "plugin:fastq_qc" }], edges: [], metadata: {} }) } });
    fireEvent.click(screen.getByRole("button", { name: "Save and execute" }));
    await waitFor(() => expect(builder.save).toHaveBeenCalled());
    expect(builder.execute).toHaveBeenCalledWith("Untitled workflow");
    expect(await screen.findByText("Execution · exec-1")).toBeInTheDocument();
  });

  it("compiles SKILL.md text and renders the structured result", async () => {
    render(<WorkflowCompilerRenderer />);
    fireEvent.change(screen.getByLabelText("Scientific protocol"), { target: { value: "# QC protocol\nRun FastQC." } });
    fireEvent.click(screen.getByRole("button", { name: "Compile" }));
    await waitFor(() => expect(compiler.compileSkills).toHaveBeenCalledWith(["# QC protocol\nRun FastQC."]));
    expect(await screen.findByText(/"id": "qc"/)).toBeInTheDocument();
  });
});
