import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AsyncAnalysisRenderer from "../../src/ui/components/workbench/AsyncAnalysisRenderer";

const endpoints = {
  submit: "/plugins/pilot/api/run/",
  status: "/plugins/pilot/api/status/{run_id}/",
  logs: "/plugins/pilot/api/log/{run_id}/",
  artifacts: "/plugins/pilot/api/artifacts/{run_id}/",
  download: "/plugins/pilot/api/ui-artifacts/{run_id}/{artifact_id}/download/",
};

const descriptor = {
  schema_version: 1,
  plugin: { slug: "pilot", name: "Pilot", version: "1", description: "desc", category: "analysis" },
  renderer: "async_analysis",
  native_supported: true,
  inputs: [{ id: "input_file", label: "Input File", description: "TSV", required: true, format: "tsv", component: "file", multiple: false, accept: ".tsv" }],
  outputs: [{ id: "output", label: "Output", description: "artifact", format: "tsv" }],
  capabilities: { submit: true, status: true, logs: true, artifacts: true, downloads: true },
  endpoints,
  artifacts: { presentation: "list", max_items: 100 },
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("AsyncAnalysisRenderer", () => {
  it("preserves submission, CSRF, polling, logs, terminal artifacts, and downloads", async () => {
    const user = userEvent.setup();
    const file = new File(["a\tb\n"], "input.tsv", { type: "text/tab-separated-values" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run_id: "run-1", status: "RUNNING" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: "COMPLETED", detail: "done" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ lines: ["finished"] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ artifacts: [{ artifact_id: `art_${"A".repeat(43)}`, display_name: "out.tsv", label: "Output", kind: "table", media_type: "text/tab-separated-values", size_bytes: 42 }] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AsyncAnalysisRenderer descriptor={descriptor} />);
    await user.upload(screen.getByLabelText(/Input File/), file);
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    expect(await screen.findByRole("status")).toHaveTextContent("COMPLETED");
    expect(await screen.findByText("finished")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download out.tsv" })).toHaveAttribute("href", expect.stringContaining(`/api/ui-artifacts/run-1/art_${"A".repeat(43)}/download/`));
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(fetchMock.mock.calls[0][1].headers).toHaveProperty("X-CSRFToken");
    expect(fetchMock.mock.calls[0][1].body).toBeInstanceOf(FormData);
    expect(fetchMock.mock.calls[0][1].body.get("input_input_file")).toBe(file);
  });

  it("treats a cancelled run as terminal instead of polling forever", async () => {
    const user = userEvent.setup();
    const file = new File(["a"], "input.tsv");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run_id: "run-1", status: "RUNNING" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: "CANCELLED", detail: "Cancelled by user" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ lines: ["cancelled"] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AsyncAnalysisRenderer descriptor={descriptor} />);
    await user.upload(screen.getByLabelText(/Input File/), file);
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    expect(await screen.findByRole("status")).toHaveTextContent("CANCELLED: Cancelled by user");
    expect(await screen.findByText("cancelled")).toBeInTheDocument();
    // Terminal: submit + one status poll + one log poll, no artifacts fetch and no further polling.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("supports file plus text and textarea parameter naming", async () => {
    const user = userEvent.setup();
    const textDescriptor = {
      ...descriptor,
      inputs: [
        descriptor.inputs[0],
        { id: "ligand_smiles", label: "SMILES", description: "Optional", required: false, format: "txt", component: "text" },
        { id: "notes", label: "Notes", description: "Optional", required: false, format: "txt", component: "textarea" },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "validation" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AsyncAnalysisRenderer descriptor={textDescriptor} />);
    await user.upload(screen.getByLabelText(/Input File/), new File(["input"], "input.tsv"));
    await user.type(screen.getByLabelText("SMILES"), "CCO");
    await user.type(screen.getByLabelText("Notes"), "note");
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    await screen.findByRole("alert");
    const body = fetchMock.mock.calls[0][1].body;
    expect(body.get("param_ligand_smiles")).toBe("CCO");
    expect(body.get("param_notes")).toBe("note");
  });

  it("reports required-field, network, malformed-run, and terminal failures safely", async () => {
    const user = userEvent.setup();
    render(<AsyncAnalysisRenderer descriptor={descriptor} />);
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Input File is required.");

    const file = new File(["bad"], "input.tsv");
    const fetchMock = vi.fn().mockRejectedValue(new Error("network unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    await user.upload(screen.getByLabelText(/Input File/), file);
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    expect(await screen.findByRole("alert")).toHaveTextContent("network unavailable");
  });

  it("retains and submits a hidden labels file after train-to-infer switching", async () => {
    const user = userEvent.setup();
    const conditionalDescriptor = {
      ...descriptor,
      inputs: [
        { id: "mode", label: "Mode", description: "Mode", required: true, format: "text", component: "select", choices: ["infer", "train"], default: "infer" },
        descriptor.inputs[0],
        { id: "labels", label: "Labels", description: "Training labels", required: false, format: "csv", component: "file", conditions: [
          { controller: "mode", operator: "equals", value: "train", effect: "visible" },
          { controller: "mode", operator: "equals", value: "train", effect: "required" },
        ] },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "checked" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AsyncAnalysisRenderer descriptor={conditionalDescriptor} />);
    await user.upload(screen.getByLabelText(/Input File/), new File(["input"], "input.tsv"));
    await user.selectOptions(screen.getByLabelText(/Mode/), "train");
    await user.upload(screen.getByLabelText(/Labels/), new File(["labels"], "labels.csv"));
    await user.selectOptions(screen.getByLabelText(/Mode/), "infer");
    expect(screen.queryByLabelText(/Labels/)).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    await screen.findByRole("alert");
    const body = fetchMock.mock.calls[0][1].body;
    expect(body.get("input_mode")).toBe("infer");
    expect(body.get("input_labels")).toBeInstanceOf(File);
    expect(body.get("input_labels").name).toBe("labels.csv");
  });
});
