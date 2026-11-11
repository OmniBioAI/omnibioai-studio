import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tesApiFetch = vi.fn();
vi.mock("../../src/ui/lib/tesApi", () => ({ tesApiFetch: (...args) => tesApiFetch(...args) }));

import Tools, { hasVerificationData, toolPresentation, toolVerification } from "../../src/ui/pages/Tools";
import Home from "../../src/ui/pages/Home";

const TOOLS = [
  { tool_id: "ensembl_lookup", description: "Gene lookup", http: { url: "https://x" },
    verification: { status: "runnable", tested_at: "2026-11-09", reason: null, run_id: "full_run_20261109" } },
  { tool_id: "fastqc", description: "Read quality control", slurm: { image: "x.sif" },
    verification: { status: "out_of_scope", tested_at: null, reason: "end-to-end verification covers HTTP tools only", run_id: null } },
  { tool_id: "broken_api", description: "Retired endpoint", http: { url: "https://y" },
    verification: { status: "not_working", tested_at: "2026-11-09", reason: "upstream HTTP 404 not found", run_id: "full_run_20261109" } },
  { tool_id: "legacy_tool", description: "No verification block at all", http: { url: "https://z" } },
  { tool_id: "bwa_x86", description: "x86 only aligner", slurm: { image: "docker://quay.io/biocontainers/bwa:0.7.18" },
    verification: { status: "unavailable", tested_at: null, reason: "x86_64-only container image; this host is aarch64", run_id: null } },
];

beforeEach(() => {
  tesApiFetch.mockReset();
  tesApiFetch.mockImplementation(path => {
    if (path === "/api/tools") return Promise.resolve(TOOLS);
    if (path === "/api/tools?status=runnable") return Promise.resolve(TOOLS.filter(t => t.verification?.status === "runnable"));
    if (path === "/api/runs") return Promise.resolve([]);
    return Promise.resolve([]);
  });
});
afterEach(() => { cleanup(); delete window.__OMNIBIOAI_CONFIG__; });

describe("toolVerification", () => {
  it("maps the TES verification block to a badge with a tooltip", () => {
    expect(toolVerification(TOOLS[0])).toMatchObject({ status: "runnable", label: "Runnable", testedAt: "2026-11-09", title: "Tested end to end on 2026-11-09" });
    expect(toolVerification(TOOLS[2])).toMatchObject({ status: "not_working", label: "Not working", title: "Failed end to end on 2026-11-09: upstream HTTP 404 not found" });
    expect(toolVerification(TOOLS[1])).toMatchObject({ status: "out_of_scope", label: null, listedByDefault: true, title: "end-to-end verification covers HTTP tools only" });
    expect(toolVerification(TOOLS[0]).listedByDefault).toBe(true);
    expect(toolVerification(TOOLS[2]).listedByDefault).toBe(false);
  });

  it("maps an unavailable tool to a hidden-by-default Unavailable badge with the backend reason", () => {
    expect(toolVerification(TOOLS[4])).toMatchObject({ status: "unavailable", label: "Unavailable", listedByDefault: false,
      title: "No backend can run this tool right now: x86_64-only container image; this host is aarch64" });
    expect(toolVerification({ tool_id: "x", verification: { status: "unavailable" } }).title).toBe("No backend can run this tool right now");
  });

  it("treats a missing or unknown block as not yet tested", () => {
    expect(toolVerification(TOOLS[3])).toMatchObject({ status: "not_yet_tested", title: "Not yet run end to end" });
    expect(toolVerification({ tool_id: "x", verification: { status: "verified" } }).status).toBe("not_yet_tested");
    expect(toolPresentation(TOOLS[0]).verification.label).toBe("Runnable");
  });
});

describe("Tools page verification badges", () => {
  it("lists runnable HTTP tools and out-of-scope tools by default; badge only for HTTP tools", async () => {
    render(<Tools />);
    await screen.findByText("ensembl_lookup");
    expect(screen.getByText("Showing 2 of 2 tools (1 runnable HTTP tools; 3 not working, not yet tested or unavailable hidden)")).toBeInTheDocument();
    expect(screen.getByText("Runnable")).toHaveAttribute("title", "Tested end to end on 2026-11-09");
    expect(screen.getByText("fastqc")).toBeInTheDocument();          // Slurm tool: listed, no badge
    expect(screen.queryByText("Not yet tested")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".tool-card__badge")).toHaveLength(1);
    expect(screen.queryByText("broken_api")).not.toBeInTheDocument();
    expect(screen.queryByText("legacy_tool")).not.toBeInTheDocument();
    expect(screen.queryByText("bwa_x86")).not.toBeInTheDocument();      // unavailable: hidden by default
    expect(screen.getByRole("checkbox", { name: "Runnable only" })).toBeChecked();
  });

  it("Show all reveals the hidden tools with their badges, including Unavailable", async () => {
    render(<Tools />);
    await screen.findByText("ensembl_lookup");
    fireEvent.click(screen.getByRole("checkbox", { name: "Runnable only" }));
    expect(screen.getByText("Showing 5 of 5 tools (1 runnable HTTP tools)")).toBeInTheDocument();
    expect(screen.getByText("broken_api")).toBeInTheDocument();
    expect(screen.getByText("Not working")).toHaveAttribute("title", "Failed end to end on 2026-11-09: upstream HTTP 404 not found");
    expect(screen.getAllByText("Not yet tested")).toHaveLength(1);   // legacy_tool only; fastqc is out of scope
    expect(screen.getByText("bwa_x86")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toHaveAttribute("title", "No backend can run this tool right now: x86_64-only container image; this host is aarch64");
    expect(document.querySelectorAll(".tool-card__badge")).toHaveLength(4);
    fireEvent.click(screen.getByRole("checkbox", { name: "Runnable only" }));
    expect(screen.getByText(/Showing 2 of 2 tools/)).toBeInTheDocument();
  });

  it("explains an empty default view when no HTTP tool is verified yet", async () => {
    tesApiFetch.mockImplementation(() => Promise.resolve([TOOLS[2], TOOLS[3]]));
    render(<Tools />);
    await screen.findByText("Showing 0 of 0 tools (0 runnable HTTP tools; 2 not working, not yet tested or unavailable hidden)");
    expect(screen.getByText("No runnable tools yet.")).toBeInTheDocument();
    expect(screen.getByText("Show all to browse the 2 tools that are not working, not yet tested or unavailable.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));   // the empty-state action
    expect(screen.getByText("legacy_tool")).toBeInTheDocument();
  });

  it("fails open when TES serves no verification data: every tool listed, no badges, no toggle", async () => {
    tesApiFetch.mockImplementation(() => Promise.resolve([{ tool_id: "fastqc", slurm: {} }, { tool_id: "ensembl_lookup", http: {} }]));
    render(<Tools />);
    await screen.findByText("Showing 2 of 2 tools (verification status unavailable)");
    expect(screen.getByText("fastqc")).toBeInTheDocument();
    expect(screen.getByText("ensembl_lookup")).toBeInTheDocument();
    expect(document.querySelectorAll(".tool-card__badge")).toHaveLength(0);
    expect(screen.queryByRole("checkbox", { name: "Runnable only" })).not.toBeInTheDocument();
    expect(screen.queryByText(/No HTTP tool has passed/)).not.toBeInTheDocument();
    expect(hasVerificationData([{ tool_id: "x" }])).toBe(false);
    expect(hasVerificationData(TOOLS)).toBe(true);
  });
});

describe("Home runnable tool count", () => {
  it("asks TES for runnable tools only and says so", async () => {
    render(<Home currentUser={{ email: "ada@example.test" }} />);
    await waitFor(() => expect(screen.getByText("1 runnable HTTP tool")).toBeInTheDocument());
    expect(tesApiFetch).toHaveBeenCalledWith("/api/tools?status=runnable", expect.anything());
  });

  it("fails open on a TES that ignores the status filter: counts every tool and says 'available'", async () => {
    tesApiFetch.mockImplementation(() => Promise.resolve([{ tool_id: "a", http: {} }, { tool_id: "b", slurm: {} }, { tool_id: "c", http: {} }]));
    render(<Home currentUser={{ email: "ada@example.test" }} />);
    await waitFor(() => expect(screen.getByText("3 tools available")).toBeInTheDocument());
  });

  it("formats a large runnable count", async () => {
    tesApiFetch.mockImplementation(path => Promise.resolve(path === "/api/tools?status=runnable" ? Array.from({ length: 803 }, (_, i) => ({ tool_id: `t${i}`, verification: { status: "runnable" } })) : []));
    render(<Home currentUser={{ email: "ada@example.test" }} />);
    await waitFor(() => expect(screen.getByText("803 runnable HTTP tools")).toBeInTheDocument());
  });
});
