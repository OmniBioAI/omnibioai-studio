import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import GenericPluginRunner from "../../src/ui/components/GenericPluginRunner";

const descriptor = {
  plugin: { name: "Pilot", version: "1.0", description: "desc", category: "analysis" },
  inputs: [{ id: "input_file", label: "Input File", description: "TSV", required: true, format: "tsv", widget: "file", multiple: false, accept: ".tsv" }],
  endpoints: { submit: "/plugins/pilot/api/run/", status: "/plugins/pilot/api/status/{run_id}/", logs: "/plugins/pilot/api/log/{run_id}/", artifacts: "/plugins/pilot/api/artifacts/{run_id}/", download: "/plugins/pilot/api/file/{run_id}/" },
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("GenericPluginRunner", () => {
  it.each([
    ["alpha_diversity", "otu_table"], ["beta_diversity", "otu_table"],
    ["binding_site_predictor", "structure_pdb"], ["chromatin_accessibility", "peak_count_matrix"],
    ["chromatin_state", "chromatin_state_table"], ["counts_matrix_qc", "counts_matrix"],
    ["gsea_enrichment", "ranked_genes"], ["hic_analysis", "hic_matrix"],
    ["irfinder_analysis", "intron_retention_table"], ["isoform_analysis", "isoform_quant_table"],
    ["mag_quality", "mag_stats"], ["methylation_qc", "methylation_table"],
    ["nanopore_qc", "longread_stats"],
  ])("renders the complete required file contract for %s", (slug, inputId) => {
    render(<GenericPluginRunner descriptor={{
      plugin: { name: slug, version: "1", category: "analysis" },
      inputs: [{ id: inputId, label: inputId, description: "required input", required: true, format: "tsv", widget: "file", multiple: false }],
      endpoints: descriptor.endpoints,
    }} />);
    expect(screen.getByLabelText(new RegExp(inputId))).toBeRequired();
  });

  it("renders required files, submits FormData, polls, and lists downloads", async () => {
    const user = userEvent.setup();
    const file = new File(["a\tb\n"], "input.tsv", { type: "text/tab-separated-values" });
    const status = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run_id: "run-1", status: "RUNNING" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: "COMPLETED", detail: "done" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ lines: ["finished"] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ outputs: [{ path: "out.tsv", label: "Output", type: "file" }] }) });
    vi.stubGlobal("fetch", status);
    render(<GenericPluginRunner descriptor={descriptor} />);
    await user.upload(screen.getByLabelText(/Input File/), file);
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    expect(await screen.findByRole("status")).toHaveTextContent("COMPLETED");
    expect(await screen.findByText("Output")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", expect.stringContaining("path=out.tsv"));
    expect(status.mock.calls[0][1].body).toBeInstanceOf(FormData);
    expect(screen.getByLabelText(/Input File/)).toHaveAttribute("accept", ".tsv");
  });

  it("renders descriptor-driven text controls and submits their parameter names", async () => {
    const user = userEvent.setup();
    const textDescriptor = {
      ...descriptor,
      inputs: [{ id: "ligand_name", label: "Ligand Name", description: "Optional", required: false, format: "txt", widget: "text", multiple: false }],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "validation" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<GenericPluginRunner descriptor={textDescriptor} />);
    await user.type(screen.getByLabelText(/Ligand Name/), "aspirin");
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    await screen.findByRole("alert");
    const body = fetchMock.mock.calls[0][1].body;
    expect(body.get("param_ligand_name")).toBe("aspirin");
  });

  it("shows server validation errors without changing backend semantics", async () => {
    const user = userEvent.setup();
    const file = new File(["bad"], "input.tsv");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "input is invalid" }) }));
    render(<GenericPluginRunner descriptor={descriptor} />);
    await user.upload(screen.getByLabelText(/Input File/), file);
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    expect(await screen.findByRole("alert")).toHaveTextContent("input is invalid");
  });
});
