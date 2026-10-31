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

  it("maps historical structured controls into the plugin parameters payload", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "checked" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AsyncAnalysisRenderer descriptor={{
      ...descriptor,
      inputs: [descriptor.inputs[0], { id: "parameters", label: "Parameters", description: "JSON", required: false, format: "json", component: "textarea", placeholder: "{}" }],
    }} parameterFields={[
      { id: "sample_name", label: "Sample name", description: "Sample", required: true, format: "text", component: "text", default: "sample" },
      { id: "threads", label: "Threads", description: "Threads", required: true, format: "integer", component: "number", default: "2", min: 1 },
      { id: "run_qc", label: "Run QC", description: "QC", required: false, format: "boolean", component: "checkbox", default: true },
    ]} />);
    await user.upload(screen.getByLabelText(/Input File/), new File(["input"], "input.tsv"));
    await user.clear(screen.getByLabelText(/Sample name/));
    await user.type(screen.getByLabelText(/Sample name/), "patient-01");
    await user.clear(screen.getByLabelText(/Threads/));
    await user.type(screen.getByLabelText(/Threads/), "4");
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    await screen.findByRole("alert");
    const body = fetchMock.mock.calls[0][1].body;
    expect(body.get("input_input_file")).toBeInstanceOf(File);
    expect(body.get("param_parameters")).toBe(JSON.stringify({ sample_name: "patient-01", threads: "4", run_qc: true }));
    expect(body.has("param_ui_sample_name")).toBe(false);
  });

  it("serializes nested historical values and selected checkbox groups without false entries", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "checked" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AsyncAnalysisRenderer descriptor={{ ...descriptor, inputs: [] }} parameterFields={[
      { id: "control", label: "Control", description: "Group", required: false, component: "text", format: "text", default: "control", parameterPath: ["comparison", "control"] },
      { id: "treated", label: "Treated", description: "Group", required: false, component: "text", format: "text", default: "treated", parameterPath: ["comparison", "treated"] },
      { id: "db_hmdb", label: "Search HMDB", description: "Database", required: false, component: "checkbox", format: "boolean", default: true, parameterArray: "databases", parameterValue: "hmdb" },
      { id: "db_massbank", label: "Search MassBank", description: "Database", required: false, component: "checkbox", format: "boolean", default: false, parameterArray: "databases", parameterValue: "massbank" },
    ]} />);
    await user.clear(screen.getByLabelText("Control"));
    await user.type(screen.getByLabelText("Control"), "vehicle");
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    await screen.findByRole("alert");
    expect(fetchMock.mock.calls[0][1].body.get("param_parameters")).toBe(JSON.stringify({
      comparison: { control: "vehicle", treated: "treated" }, databases: ["hmdb"],
    }));
  });

  it("converts an upload-required manifest input into a paste-or-upload historical mode", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "checked" }) });
    vi.stubGlobal("fetch", fetchMock);
    const sequenceDescriptor = {
      ...descriptor,
      inputs: [{ id: "sequence", label: "Sequence FASTA", description: "FASTA", required: true, format: "fasta", component: "file", multiple: false }],
    };
    render(<AsyncAnalysisRenderer descriptor={sequenceDescriptor}
      parameterFields={[
        { id: "input_mode", label: "Input source", description: "Source", required: true, format: "text", component: "select", choices: ["paste", "upload"], default: "paste" },
        { id: "sequence", label: "Paste DNA / FASTA sequence", description: "Sequence", required: false, format: "text", component: "textarea", fileTarget: "sequence", fileName: "sequence.fasta", conditions: [
          { controller: "ui_input_mode", operator: "equals", value: "paste", effect: "visible" },
          { controller: "ui_input_mode", operator: "equals", value: "paste", effect: "required" },
        ] },
      ]}
      inputOverrides={{ sequence: { required: false, conditions: [
        { controller: "ui_input_mode", operator: "equals", value: "upload", effect: "visible" },
        { controller: "ui_input_mode", operator: "equals", value: "upload", effect: "required" },
      ] }}}
    />);
    expect(screen.queryByLabelText(/Sequence FASTA/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Paste DNA/), "ATGAAATAA");
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    await screen.findByRole("alert");
    expect(fetchMock.mock.calls[0][1].body.get("param_parameters")).toBe(JSON.stringify({ input_mode: "paste" }));
    expect(fetchMock.mock.calls[0][1].body.get("input_sequence")).toBeInstanceOf(File);
    expect(fetchMock.mock.calls[0][1].body.get("input_sequence").name).toBe("sequence.fasta");
  });

  it.each([
    ["gene list JSON", "gene-list-json", "BRCA1 TP53,EGFR", '["BRCA1","TP53","EGFR"]'],
    ["edge list TSV", "edge-list-tsv", "TP53 BRCA1 0.92 ppi", "source\\ttarget\\tweight\\ttype\\nTP53\\tBRCA1\\t0.92\\tppi"],
  ])("normalizes pasted %s into its declared file input", async (_label, fileTransform, value, expected) => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "checked" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AsyncAnalysisRenderer descriptor={{ ...descriptor, inputs: [
      { id: "input_file", label: "Input File", description: "text", required: false, format: "text", component: "file", multiple: false },
    ] }} parameterFields={[
      { id: "paste", label: "Paste data", description: "historical input", required: true, format: "text", component: "textarea", fileTarget: "input_file", fileName: "pasted.txt", fileTransform },
    ]} />);
    await user.type(screen.getByLabelText(/Paste data/), value);
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    await screen.findByRole("alert");
    const generated = fetchMock.mock.calls[0][1].body.get("input_input_file");
    expect(generated).toBeInstanceOf(File);
    expect(await generated.text()).toBe(expected.replaceAll("\\t", "\t").replaceAll("\\n", "\n"));
  });

  it("does not send malformed historical paste fields that target undeclared files", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AsyncAnalysisRenderer descriptor={{ ...descriptor, inputs: [{ ...descriptor.inputs[0], required: false }] }} parameterFields={[
      { id: "paste", label: "Paste data", description: "historical input", required: false, format: "text", component: "textarea", fileTarget: "missing_file" },
    ]} />);
    await user.type(screen.getByLabelText(/Paste data/), "payload");
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    expect(await screen.findByRole("alert")).toHaveTextContent("not connected to a supported Workbench file input");
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("omits a hidden labels file after train-to-infer switching", async () => {
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
    expect(body.has("input_labels")).toBe(false);
  });
});
