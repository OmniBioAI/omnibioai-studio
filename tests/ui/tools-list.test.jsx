import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const RUNS = [
  { run_id: "r1", tool_id: "ensembl_lookup", state: "COMPLETED" }, { run_id: "r2", tool_id: "uniprot_lookup", state: "RUNNING" }, { run_id: "r3", tool_id: "fastqc", state: "FAILED" },
];

beforeEach(() => {
  window.history.replaceState({}, "", "/studio/tools");
  tesApiFetch.mockReset();
  tesApiFetch.mockImplementation(path => {
    if (path === "/api/tools") return Promise.resolve(TOOLS);
    if (path === "/api/servers") return Promise.resolve(SERVERS);
    if (path === "/api/runs") return Promise.resolve(RUNS);
    return Promise.reject(new Error("TES request failed (404)"));
  });
});
afterEach(() => { cleanup(); window.history.replaceState({}, "", "/studio"); });

describe("Tools list", () => {
  it("renders the header count, backend strip with counts and unavailable state, and one filter row", async () => {
    render(<Tools />);
    await screen.findByText("ensembl_lookup");
    expect(screen.getByRole("heading", { level: 2, name: "Tools" })).toBeInTheDocument();
    expect(screen.getByText("5 tools · 2 runnable HTTP tools")).toBeInTheDocument();
    const strip = screen.getByRole("list", { name: "Tools per backend" });
    const items = within(strip).getAllByRole("listitem");
    expect(items.map(item => item.textContent.replace(/\s+/g, " ").trim())).toEqual(["HTTP 3", "Slurm 2 unavailable", "AWS Batch 0", "Azure Batch 0", "GCP Batch 0", "Kubernetes 0", "Local 0"]);
    expect(items[1]).toHaveAttribute("title", "Slurm backend unavailable");
    expect(screen.getByRole("search", { name: "Filter tools" })).toBeInTheDocument();
    const runsOn = screen.getByRole("group", { name: "Runs on" });
    expect(within(runsOn).getAllByRole("button").map(b => b.textContent)).toEqual(["All", "HTTP", "Slurm"]);
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue("All");
    expect(screen.getByRole("checkbox", { name: "Runnable only" })).toBeChecked();
    expect(screen.getByRole("status", { name: "Tools shown" })).toHaveTextContent("2 / 5");
    expect(screen.getByText("Showing 2 of 2 tools (2 runnable HTTP tools; 3 not working, not yet tested or unavailable hidden)")).toBeInTheDocument();
    expect(screen.queryByText(/registered with TES|live from/)).not.toBeInTheDocument();
  });

  it("side panel: run views with counts link to Jobs, backends show online or unavailable, Submit Run opens the form", async () => {
    const onOpenJobs = vi.fn();
    render(<Tools onOpenJobs={onOpenJobs} />);
    await screen.findByText("ensembl_lookup");
    const side = screen.getByRole("complementary", { name: "Runs and backends" });
    expect(within(side).getByRole("link", { name: /^All/ })).toHaveTextContent("All3");
    expect(within(side).getByRole("link", { name: /^Running/ })).toHaveAttribute("href", "/studio/jobs?state=running");
    expect(within(side).getByRole("link", { name: /^Failed/ })).toHaveTextContent("Failed1");
    fireEvent.click(within(side).getByRole("link", { name: /^Completed/ }));
    expect(onOpenJobs).toHaveBeenCalledTimes(1);
    expect(`${window.location.pathname}${window.location.search}`).toBe("/studio/jobs?state=completed");
    window.history.replaceState({}, "", "/studio/tools");
    expect(within(side).getByText("HTTP ToolServer").closest("li")).toHaveClass("is-online");
    expect(within(side).getByText("Local Slurm (DGX)").closest("li")).toHaveClass("is-unavailable");
    expect(within(side).getByText("Local Slurm (DGX)").closest("li")).toHaveTextContent("unavailable");
    expect(within(side).getByText("Local Slurm (DGX)").closest("li")).toHaveAttribute("title", "sinfo failed: DNS SRV lookup failed");
    fireEvent.click(within(side).getByRole("button", { name: "+ Submit Run" }));
    expect(onOpenJobs).toHaveBeenCalledTimes(2);
    expect(`${window.location.pathname}${window.location.search}`).toBe("/studio/jobs?submit=1");
    window.history.replaceState({}, "", "/studio/tools");
    expect(within(side).getByText("1 running")).toBeInTheDocument();
  });

  it("cards are links to the detail page with monospace id, description, category, backend badges, chevron and status badge", async () => {
    render(<Tools />);
    const card = (await screen.findByRole("link", { name: "Ensembl lookup, runnable" }));
    expect(card).toHaveAttribute("href", "/studio/tools/ensembl_lookup");
    expect(card.querySelector(".tool-card__name")).toHaveTextContent("ensembl_lookup");
    expect(card.querySelector(".tool-card__description")).toHaveTextContent("Gene lookup by symbol");
    expect(card.querySelector(".tool-card__category")).toHaveTextContent("Annotation");
    expect(card.querySelector(".backend-badge--http")).toHaveTextContent("HTTP");
    expect(card.querySelector(".tool-card__chevron")).toBeInTheDocument();
    expect(card.querySelector(".tool-card__badge")).toHaveTextContent("Runnable");
  });

  it("show all reveals unavailable Slurm tools with their badge and backend counts", async () => {
    render(<Tools />);
    await screen.findByText("ensembl_lookup");
    fireEvent.click(screen.getByRole("checkbox", { name: "Runnable only" }));
    expect(screen.getByText("Showing 5 of 5 tools (2 runnable HTTP tools)")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Tools shown" })).toHaveTextContent("5 / 5");
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getAllByText("Unavailable")[0]).toHaveAttribute("title", "No backend can run this tool right now: slurm_local: sinfo failed: DNS SRV lookup failed");
  });

  it("explains an empty Slurm view by the backend being down and offers Show all", async () => {
    render(<Tools />);
    await screen.findByText("ensembl_lookup");
    fireEvent.click(screen.getByRole("button", { name: "Slurm" }));
    expect(screen.getByText("No runnable Slurm tools yet: the Slurm backend isn't available.")).toBeInTheDocument();
    expect(screen.getByText("Show all to browse them.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByRole("checkbox", { name: "Runnable only" })).not.toBeChecked();
    expect(screen.getByRole("link", { name: "FastQC, unavailable" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "MultiQC, unavailable" })).toBeInTheDocument();
  });

  it("search and category filter, with a clear-search empty state", async () => {
    render(<Tools />);
    await screen.findByText("ensembl_lookup");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search tools" }), { target: { value: "uniprot" } });
    expect(screen.getByText("Showing 1 of 2 tools (2 runnable HTTP tools; 3 not working, not yet tested or unavailable hidden)")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search tools" }), { target: { value: "zzz" } });
    expect(screen.getByText("No tools match “zzz”.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "QC" } });
    expect(screen.getByText("No runnable QC tools yet.")).toBeInTheDocument();
  });

  it("fails open without verification data: all tools, no badges, no toggle", async () => {
    tesApiFetch.mockImplementation(path => Promise.resolve(path === "/api/tools" ? TOOLS.map(({ verification, ...t }) => t) : []));
    render(<Tools />);
    await screen.findByText("Showing 5 of 5 tools (verification status unavailable)");
    expect(document.querySelectorAll(".tool-card__badge")).toHaveLength(0);
    expect(screen.queryByRole("checkbox", { name: "Runnable only" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Tools shown" })).toHaveTextContent("5 / 5");
  });

  it("opens the detail page on card click, runs the tool into Jobs, and returns with the back button", async () => {
    const onOpenJobs = vi.fn();
    tesApiFetch.mockImplementation((path, options = {}) => {
      if (path === "/api/tools") return Promise.resolve(TOOLS);
      if (path === "/api/servers") return Promise.resolve(SERVERS);
      if (path === "/api/runs") return Promise.resolve(RUNS);
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
    await waitFor(() => expect(onOpenJobs).toHaveBeenCalled());
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
    expect(document.querySelector(".tool-detail__blocker")).toHaveTextContent("slurm_local: sinfo failed: DNS SRV lookup failed");
  });
});
