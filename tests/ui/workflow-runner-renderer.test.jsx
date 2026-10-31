import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkflowRunnerRenderer from "../../src/ui/components/workbench/WorkflowRunnerRenderer";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });
const response = payload => ({ ok: true, json: async () => payload });

describe("Workflow Runner React renderer", () => {
  it("selects a registry workflow, edits inputs, starts it and polls the run workspace", async () => {
    const fetch = vi.fn(async (url, options = {}) => {
      const path = String(url);
      if (path.includes("workflow-catalog/categories")) return response(["rnaseq"]);
      if (path.includes("workflow-catalog/engines")) return response(["wdl"]);
      if (path.includes("workflow-catalog/workflows")) return response([{ id: "wf-42", label: "RNA-seq v2", engine: "wdl" }]);
      if (path.includes("/configure/?format=json&workflow_id=wf-42")) return response({ workflow_id: "wf-42", category: "rnaseq", input_json: { threads: 4 } });
      if (path.includes("/configure/?format=json") && options.method === "POST") return response({ run_id: "run-42", state: "QUEUED" });
      if (path.includes("/run/run-42/tail/")) return response({ run_id: "run-42", status: { state: "COMPLETED", progress: 100, updated_at: "just now" }, lines: ["Workflow completed"] });
      if (path.includes("/api/runs/run-42/files")) return response({ files: ["outputs.normalized.json"] });
      if (path.includes("/api/runs/run-42/outputs/normalized")) return response({ exists: true, relpath: "outputs.normalized.json", size_bytes: 25, preview: '{"status":"COMPLETED"}' });
      return { ok: false, status: 404, json: async () => ({ error: "Not found" }) };
    });
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup(); render(<WorkflowRunnerRenderer />);
    await user.selectOptions(await screen.findByLabelText("Workflow engine"), "wdl");
    await user.selectOptions(await screen.findByLabelText("Workflow (version)"), "wf-42");
    await user.click(screen.getByRole("button", { name: "Continue to inputs" }));
    const input = await screen.findByLabelText("Workflow input JSON");
    await waitFor(() => expect(input).toHaveValue('{\n  "threads": 4\n}'));
    const startButton = screen.getByRole("button", { name: "Start workflow" });
    await waitFor(() => expect(startButton).toBeEnabled());
    await user.click(startButton);
    expect(await screen.findByRole("heading", { name: "Run Workspace" })).toBeInTheDocument();
    expect(await screen.findByText("COMPLETED")).toBeInTheDocument();
    expect(await screen.findByText("outputs.normalized.json")).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url, options]) => String(url).includes("/configure/?format=json") && options.method === "POST" && JSON.parse(options.body).input_json.threads === 4)).toBe(true);
  });
});
