import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tesApiFetch = vi.fn();
vi.mock("../../src/ui/lib/tesApi", () => ({ tesApiFetch: (...args) => tesApiFetch(...args), tesUrl: path => `/_tes${path}` }));

import ToolDetail from "../../src/ui/pages/tools/ToolDetail";

const HTTP_TOOL = {
  tool_id: "ensembl_lookup", display_name: "Ensembl lookup", description: "Look up a gene by symbol.", tags: ["annotation", "ensembl"],
  http: { method: "GET", url: "https://rest.ensembl.org/lookup/symbol/{species}/{symbol}" },
  inputs: [{ name: "symbol", type: "string", required: true, description: "Gene symbol e.g. BRCA2" }, { name: "species", type: "string", required: false, default: "homo_sapiens" },
    { name: "expand", type: "boolean", required: false }, { name: "limit", type: "integer", required: false, description: "Max records" }],
  response_map: { gene_id: "id", biotype: "biotype" },
  verification: { status: "runnable", tested_at: "2026-11-09", reason: null, run_id: "full_run_20261109" },
  servers: [{ server_id: "enrichment_remote", display_name: "HTTP ToolServer", adapter_type: "http_toolserver", available: true, unavailable_reason: null }],
  example_available: true,
};
const SLURM_TOOL = {
  tool_id: "fastqc", display_name: "FastQC", description: "Quality control for FASTQ files.", tags: ["qc", "slurm"],
  slurm: { image: "/sif/fastqc_arm64.sif", outputs: [{ name: "report_html", pattern: "*_fastqc.html" }], resources: { cpu: 4 } },
  inputs_schema: { properties: { input_file: { type: "string", description: "Path to FASTQ file e.g. /data/sample.fastq.gz" }, threads: { type: "integer", default: 4 } }, required: ["input_file"] },
  outputs_schema: { type: "object" },
  verification: { status: "unavailable", tested_at: null, reason: "slurm_local: sinfo failed: DNS SRV lookup failed", run_id: null },
  servers: [{ server_id: "slurm_local", display_name: "Local Slurm (DGX)", adapter_type: "slurm", available: false, unavailable_reason: "sinfo failed: DNS SRV lookup failed" }],
  example_available: false,
};

function mock(routes) {
  tesApiFetch.mockImplementation((path, options = {}) => {
    const handler = routes[`${options.method || "GET"} ${path}`];
    return handler ? Promise.resolve(handler(options)) : Promise.reject(new Error("TES request failed (404)"));
  });
}

beforeEach(() => { tesApiFetch.mockReset(); });
afterEach(() => cleanup());

describe("ToolDetail", () => {
  it("renders description, generated form, outputs, backends, verification and curl for a runnable HTTP tool", async () => {
    mock({ "GET /api/tools/ensembl_lookup": () => HTTP_TOOL });
    render(<ToolDetail toolId="ensembl_lookup" onBack={() => {}} />);
    await screen.findByRole("heading", { level: 2, name: "Ensembl lookup" });
    expect(screen.getByText("Look up a gene by symbol.")).toBeInTheDocument();
    expect(screen.getByText("symbol").parentElement).toHaveTextContent("*");
    expect(screen.getByLabelText(/^species/)).toHaveValue("homo_sapiens");
    expect(screen.getByLabelText(/^expand/)).toHaveAttribute("type", "checkbox");
    expect(screen.getByLabelText(/^limit/)).toHaveAttribute("type", "number");
    expect(screen.getByText("gene_id")).toBeInTheDocument();                      // outputs from response_map
    expect(screen.getByText("HTTP · HTTP ToolServer")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Tested end to end on 2026-11-09 (run full_run_20261109)")).toBeInTheDocument();
    const curl = screen.getByText(/curl -sS -X POST/).textContent;
    expect(curl).toContain("Bearer $OMNIBIOAI_TOKEN");
    expect(curl).toContain("/_tes/api/runs/submit");
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Fill example" })).toBeInTheDocument();
  });

  it("validates before submitting, submits the coerced inputs and hands the run id on", async () => {
    const submitted = [];
    const onRunSubmitted = vi.fn();
    mock({
      "GET /api/tools/ensembl_lookup": () => HTTP_TOOL,
      "POST /api/runs/submit": options => { submitted.push(JSON.parse(options.body)); return { ok: true, run_id: "run-123", server_id: "enrichment_remote" }; },
    });
    render(<ToolDetail toolId="ensembl_lookup" onBack={() => {}} onRunSubmitted={onRunSubmitted} />);
    await screen.findByRole("heading", { level: 2, name: "Ensembl lookup" });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("Required.")).toBeInTheDocument();
    expect(submitted).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(/^symbol/), { target: { value: "BRCA2" } });
    fireEvent.change(screen.getByLabelText(/^limit/), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("Must be a whole number.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^limit/), { target: { value: "10" } });
    fireEvent.click(screen.getByLabelText(/^expand/));
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(onRunSubmitted).toHaveBeenCalledWith("run-123"));
    expect(submitted).toEqual([{ tool_id: "ensembl_lookup", inputs: { symbol: "BRCA2", species: "homo_sapiens", expand: true, limit: 10 } }]);
  });

  it("shows TES validation errors next to the fields", async () => {
    mock({
      "GET /api/tools/ensembl_lookup": () => HTTP_TOOL,
      "POST /api/runs/submit": () => ({ ok: false, error: { code: "VALIDATION_FAILED", details: { ok: false, errors: [{ field: "symbol", message: "'symbol' is required." }, { code: "X", message: "rate limited" }] } } }),
    });
    render(<ToolDetail toolId="ensembl_lookup" onBack={() => {}} />);
    await screen.findByRole("heading", { level: 2, name: "Ensembl lookup" });
    fireEvent.change(screen.getByLabelText(/^symbol/), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("'symbol' is required.")).toBeInTheDocument();
    expect(screen.getByText("rate limited")).toBeInTheDocument();
  });

  it("Fill example loads the recorded inputs; a missing example says so", async () => {
    mock({ "GET /api/tools/ensembl_lookup": () => HTTP_TOOL, "GET /api/tools/ensembl_lookup/example": () => ({ tool_id: "ensembl_lookup", inputs: { symbol: "TP53", limit: 3 }, verified_at: "2026-11-09" }) });
    render(<ToolDetail toolId="ensembl_lookup" onBack={() => {}} />);
    await screen.findByRole("heading", { level: 2, name: "Ensembl lookup" });
    fireEvent.click(screen.getByRole("button", { name: "Fill example" }));
    await waitFor(() => expect(screen.getByLabelText(/^symbol/)).toHaveValue("TP53"));
    expect(screen.getByLabelText(/^limit/)).toHaveValue(3);
    expect(screen.getByText("Filled with the inputs that passed end to end on 2026-11-09.")).toBeInTheDocument();
    cleanup();
    mock({ "GET /api/tools/ensembl_lookup": () => HTTP_TOOL });
    render(<ToolDetail toolId="ensembl_lookup" onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Fill example" }));
    expect(await screen.findByText("No passing example is recorded for this tool.")).toBeInTheDocument();
  });

  it("unavailable Slurm tool: reason, disabled Run, schema form, slurm outputs, unavailable backend", async () => {
    mock({ "GET /api/tools/fastqc": () => SLURM_TOOL });
    render(<ToolDetail toolId="fastqc" onBack={() => {}} />);
    await screen.findByRole("heading", { level: 2, name: "FastQC" });
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByText("Unavailable.")).toBeInTheDocument();
    expect(screen.getAllByText(/slurm_local: sinfo failed: DNS SRV lookup failed/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/^input_file/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^threads/)).toHaveValue(4);
    expect(screen.getByText("report_html")).toBeInTheDocument();
    expect(screen.getByText("Slurm · Local Slurm (DGX)")).toBeInTheDocument();
    expect(screen.getByText("Unavailable: sinfo failed: DNS SRV lookup failed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fill example" })).not.toBeInTheDocument();
  });

  it("not-working tool: disabled Run with the failure reason", async () => {
    mock({ "GET /api/tools/broken": () => ({ ...HTTP_TOOL, tool_id: "broken", display_name: "Broken", verification: { status: "not_working", tested_at: "2026-11-09", reason: "upstream HTTP 404 not found", run_id: "r" }, example_available: false }) });
    render(<ToolDetail toolId="broken" onBack={() => {}} />);
    await screen.findByRole("heading", { level: 2, name: "Broken" });
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByText(/failed its last end-to-end run on 2026-11-09: upstream HTTP 404 not found/)).toBeInTheDocument();
  });

  it("copies the curl with the token placeholder only", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    mock({ "GET /api/tools/ensembl_lookup": () => HTTP_TOOL });
    render(<ToolDetail toolId="ensembl_lookup" onBack={() => {}} />);
    await screen.findByRole("heading", { level: 2, name: "Ensembl lookup" });
    fireEvent.click(screen.getByRole("button", { name: "Copy curl" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("$OMNIBIOAI_TOKEN");
    expect(writeText.mock.calls[0][0]).not.toMatch(/FAKE|eyJ/);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("falls back to the catalog entry when the per-tool endpoint is missing, and reports unknown tools", async () => {
    mock({});
    render(<ToolDetail toolId="ensembl_lookup" fallbackTool={{ ...HTTP_TOOL, servers: undefined, example_available: undefined }} servers={[{ server_id: "enrichment_remote", display_name: "HTTP ToolServer", adapter_type: "http_toolserver", available: true, capabilities: { tools: [{ tool_id: "ensembl_lookup" }] } }]} onBack={() => {}} />);
    await screen.findByRole("heading", { level: 2, name: "Ensembl lookup" });
    expect(screen.getByText("HTTP · HTTP ToolServer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fill example" })).not.toBeInTheDocument();
    cleanup();
    const onBack = vi.fn();
    render(<ToolDetail toolId="nope" onBack={onBack} />);
    expect(await screen.findByText("This tool is not in the catalog.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to Tools" }));
    expect(onBack).toHaveBeenCalled();
  });
});
