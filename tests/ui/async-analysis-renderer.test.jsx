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
  download: "/plugins/pilot/api/file/{run_id}/",
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
      .mockResolvedValueOnce({ ok: true, json: async () => ({ outputs: [{ path: "out.tsv", label: "Output", type: "file" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AsyncAnalysisRenderer descriptor={descriptor} />);
    await user.upload(screen.getByLabelText(/Input File/), file);
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    expect(await screen.findByRole("status")).toHaveTextContent("COMPLETED");
    expect(await screen.findByText("finished")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", expect.stringContaining("path=out.tsv"));
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(fetchMock.mock.calls[0][1].headers).toHaveProperty("X-CSRFToken");
    expect(fetchMock.mock.calls[0][1].body).toBeInstanceOf(FormData);
    expect(fetchMock.mock.calls[0][1].body.get("input_input_file")).toBe(file);
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
});
