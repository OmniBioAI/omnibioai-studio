import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tesApiFetch = vi.fn();
vi.mock("../../src/ui/lib/tesApi", () => ({ tesApiFetch: (...args) => tesApiFetch(...args), tesUrl: path => `/_tes${path}` }));

import Tools from "../../src/ui/pages/Tools";

const RUN = { tested_at: "2026-11-09", reason: null, run_id: "full_run_20261109" };
const TOOLS = [
  { tool_id: "ensembl_lookup", display_name: "Ensembl lookup", description: "Gene lookup by symbol", tags: ["annotation"], http: { url: "https://x" }, verification: { status: "runnable", ...RUN } },
  { tool_id: "uniprot_lookup", display_name: "UniProt lookup", description: "Protein entry", tags: ["annotation"], http: { url: "https://y" }, verification: { status: "runnable", ...RUN } },
  { tool_id: "fastqc", display_name: "FastQC", description: "Read quality control", tags: ["qc"], slurm: { image: "/sif/fastqc_arm64.sif" }, verification: { status: "unavailable", tested_at: null, reason: "slurm_local: sinfo failed: DNS SRV lookup failed", run_id: null } },
  { tool_id: "multiqc", display_name: "MultiQC", description: "Aggregate QC reports", tags: ["qc"], slurm: { image: "/sif/multiqc_arm64.sif" }, verification: { status: "unavailable", tested_at: null, reason: "slurm_local: sinfo failed: DNS SRV lookup failed", run_id: null } },
  { tool_id: "broken_api", display_name: "Broken API", description: "Retired endpoint", http: { url: "https://z" }, verification: { status: "not_working", ...RUN, reason: "upstream HTTP 404 not found" } },
];
const SERVERS = [
  { server_id: "enrichment_remote", display_name: "HTTP ToolServer", adapter_type: "http_toolserver", available: true, unavailable_reason: null, capabilities: { tools: [{ tool_id: "ensembl_lookup" }, { tool_id: "uniprot_lookup" }, { tool_id: "broken_api" }] } },
  { server_id: "slurm_local", display_name: "Local Slurm (DGX)", adapter_type: "slurm", available: false, unavailable_reason: "sinfo failed: DNS SRV lookup failed", capabilities: { tools: [{ tool_id: "fastqc" }, { tool_id: "multiqc" }] } },
];

beforeEach(() => {
  window.history.replaceState({}, "", "/studio/tools");
  tesApiFetch.mockReset();
  tesApiFetch.mockImplementation(path => {
    if (path === "/api/tools") return Promise.resolve(TOOLS);
    if (path === "/api/servers") return Promise.resolve(SERVERS);
    return Promise.reject(new Error("TES request failed (404)"));
  });
});
afterEach(() => { cleanup(); window.history.replaceState({}, "", "/studio"); });

describe("Tools list", () => {
  it("renders one filter row with backend counts and the runnable-only default", async () => {
    render(<Tools />);
    await screen.findByText("Ensembl lookup");
    expect(screen.getByRole("search", { name: "Filter tools" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("All");
    const runsOn = screen.getByRole("group", { name: "Runs on" });
    expect(runsOn).toHaveTextContent("Any 2");
    expect(runsOn).toHaveTextContent("HTTP 2");
    expect(runsOn.querySelector("[aria-pressed=true]")).toHaveTextContent("Any");
    expect(screen.queryByText("Slurm", { selector: "button" })).not.toBeInTheDocument();    // no runnable Slurm tool in the default view
    expect(screen.getByText("Showing 2 of 2 tools (2 runnable HTTP tools; 3 not working, not yet tested or unavailable hidden)")).toBeInTheDocument();
    expect(screen.queryByText(/registered with TES/)).not.toBeInTheDocument();
    expect(screen.getByText("Browse tools and run them on the available backends")).toBeInTheDocument();
  });

  it("cards are links to the detail page and carry name, description, category, backends and badge", async () => {
    render(<Tools />);
    const card = (await screen.findByRole("link", { name: "Ensembl lookup, runnable" }));
    expect(card).toHaveAttribute("href", "/studio/tools/ensembl_lookup");
    expect(card).toHaveTextContent("Gene lookup by symbol");
    expect(card).toHaveTextContent("Annotation");
    expect(card).toHaveTextContent("HTTP");
    expect(card.querySelector(".tool-card__badge")).toHaveTextContent("Runnable");
  });

  it("show all reveals unavailable Slurm tools with their badge and backend counts", async () => {
    render(<Tools />);
    await screen.findByText("Ensembl lookup");
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText("Showing 5 of 5 tools (2 runnable HTTP tools)")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Runs on" })).toHaveTextContent("Slurm 2");
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getAllByText("Unavailable")[0]).toHaveAttribute("title", "No backend can run this tool right now: slurm_local: sinfo failed: DNS SRV lookup failed");
  });

  it("explains an empty Slurm view by the backend being down and offers Show all", async () => {
    render(<Tools />);
    await screen.findByText("Ensembl lookup");
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    fireEvent.click(screen.getByRole("button", { name: /^Slurm/ }));
    fireEvent.click(screen.getByRole("button", { name: "Runnable only" }));
    expect(screen.getByText("No runnable Slurm tools yet: the Slurm backend isn't available.")).toBeInTheDocument();
    expect(screen.getByText("Show all to browse them.")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Show all" })[1]);
    expect(screen.getByText("FastQC")).toBeInTheDocument();
    expect(screen.getByText("MultiQC")).toBeInTheDocument();
  });

  it("search and category filter, with a clear-search empty state", async () => {
    render(<Tools />);
    await screen.findByText("Ensembl lookup");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search tools" }), { target: { value: "uniprot" } });
    expect(screen.getByText("Showing 1 of 2 tools (2 runnable HTTP tools; 3 not working, not yet tested or unavailable hidden)")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search tools" }), { target: { value: "zzz" } });
    expect(screen.getByText("No tools match “zzz”.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "QC" } });
    expect(screen.getByText("No runnable QC tools yet.")).toBeInTheDocument();
  });

  it("fails open without verification data: all tools, no badges, no toggle", async () => {
    tesApiFetch.mockImplementation(path => Promise.resolve(path === "/api/tools" ? TOOLS.map(({ verification, ...t }) => t) : []));
    render(<Tools />);
    await screen.findByText("Showing 5 of 5 tools (verification status unavailable)");
    expect(document.querySelectorAll(".tool-card__badge")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Show all" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Runs on" })).toHaveTextContent("Slurm 2");
  });

  it("opens the detail page on card click, runs the tool into Jobs, and returns with the back button", async () => {
    const onOpenJobs = vi.fn();
    tesApiFetch.mockImplementation((path, options = {}) => {
      if (path === "/api/tools") return Promise.resolve(TOOLS);
      if (path === "/api/servers") return Promise.resolve(SERVERS);
      if (path === "/api/tools/ensembl_lookup") return Promise.resolve({ ...TOOLS[0], inputs: [{ name: "symbol", type: "string", required: true }], servers: [SERVERS[0]], example_available: false });
      if (path === "/api/runs/submit" && options.method === "POST") return Promise.resolve({ ok: true, run_id: "run-1", server_id: "enrichment_remote" });
      return Promise.reject(new Error("TES request failed (404)"));
    });
    render(<Tools onOpenJobs={onOpenJobs} />);
    fireEvent.click(await screen.findByRole("link", { name: "Ensembl lookup, runnable" }));
    expect(window.location.pathname).toBe("/studio/tools/ensembl_lookup");
    await screen.findByRole("heading", { level: 2, name: "Ensembl lookup" });
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText(/^symbol/), { target: { value: "BRCA2" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(onOpenJobs).toHaveBeenCalledWith("run-1"));
    expect(`${window.location.pathname}${window.location.search}`).toBe("/studio/jobs?run=run-1");
    window.history.replaceState({}, "", "/studio/tools/ensembl_lookup");
    fireEvent.click(screen.getByRole("button", { name: "← All tools" }));
    expect(window.location.pathname).toBe("/studio/tools");
    await screen.findByRole("link", { name: "Ensembl lookup, runnable" });
  });

  it("renders the detail page directly from /studio/tools/:toolId", async () => {
    window.history.replaceState({}, "", "/studio/tools/fastqc");
    tesApiFetch.mockImplementation(path => {
      if (path === "/api/tools/fastqc") return Promise.resolve({ ...TOOLS[2], inputs_schema: { properties: { input_file: { type: "string" } }, required: ["input_file"] }, servers: [SERVERS[1]], example_available: false });
      if (path === "/api/tools") return Promise.resolve(TOOLS);
      return Promise.resolve([]);
    });
    render(<Tools />);
    await screen.findByRole("heading", { level: 2, name: "FastQC" });
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByText(/slurm_local: sinfo failed: DNS SRV lookup failed/, { selector: ".tool-detail__blocker" })).toBeInTheDocument();
  });
});
