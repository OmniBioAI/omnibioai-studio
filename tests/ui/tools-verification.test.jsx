import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tesApiFetch = vi.fn();
vi.mock("../../src/ui/lib/tesApi", () => ({ tesApiFetch: (...args) => tesApiFetch(...args) }));

import Tools, { toolPresentation, toolVerification } from "../../src/ui/pages/Tools";
import Home from "../../src/ui/pages/Home";

const TOOLS = [
  { tool_id: "ensembl_lookup", description: "Gene lookup", http: { url: "https://x" },
    verification: { status: "runnable", tested_at: "2026-11-09", reason: null, run_id: "full_run_20261109" } },
  { tool_id: "fastqc", description: "Read quality control", slurm: { image: "x.sif" },
    verification: { status: "not_yet_tested", tested_at: null, reason: "end-to-end verification covers HTTP tools only", run_id: null } },
  { tool_id: "broken_api", description: "Retired endpoint", http: { url: "https://y" },
    verification: { status: "not_working", tested_at: "2026-11-09", reason: "upstream HTTP 404 not found", run_id: "full_run_20261109" } },
  { tool_id: "legacy_tool", description: "No verification block at all", http: { url: "https://z" } },
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
    expect(toolVerification(TOOLS[1])).toMatchObject({ status: "not_yet_tested", label: "Not yet tested", title: "end-to-end verification covers HTTP tools only" });
  });

  it("treats a missing or unknown block as not yet tested", () => {
    expect(toolVerification(TOOLS[3])).toMatchObject({ status: "not_yet_tested", title: "Not yet run end to end" });
    expect(toolVerification({ tool_id: "x", verification: { status: "verified" } }).status).toBe("not_yet_tested");
    expect(toolPresentation(TOOLS[0]).verification.label).toBe("Runnable");
  });
});

describe("Tools page verification badges", () => {
  it("shows only runnable tools by default, with the tested-on tooltip", async () => {
    render(<Tools />);
    await screen.findByText("ensembl lookup");
    expect(screen.getByText("Showing 1 of 1 runnable tools")).toBeInTheDocument();
    const badge = screen.getByText("Runnable");
    expect(badge).toHaveAttribute("title", "Tested end to end on 2026-11-09");
    expect(screen.queryByText("fastqc")).not.toBeInTheDocument();
    expect(screen.queryByText("broken api")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Runnable only" })).toHaveAttribute("aria-pressed", "true");
  });

  it("Show all reveals the other tools with their badges", async () => {
    render(<Tools />);
    await screen.findByText("ensembl lookup");
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText("Showing 4 of 4 tools (1 runnable)")).toBeInTheDocument();
    expect(screen.getByText("broken api")).toBeInTheDocument();
    expect(screen.getByText("Not working")).toHaveAttribute("title", "Failed end to end on 2026-11-09: upstream HTTP 404 not found");
    expect(screen.getAllByText("Not yet tested")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Runnable only" }));
    expect(screen.getByText("Showing 1 of 1 runnable tools")).toBeInTheDocument();
  });

  it("explains an empty default view when nothing is verified yet", async () => {
    tesApiFetch.mockImplementation(() => Promise.resolve([TOOLS[1], TOOLS[3]]));
    render(<Tools />);
    await screen.findByText("Showing 0 of 0 runnable tools");
    expect(screen.getByText(/No tool has passed an end-to-end run yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText("legacy tool")).toBeInTheDocument();
  });
});

describe("Home runnable tool count", () => {
  it("asks TES for runnable tools only and says so", async () => {
    render(<Home currentUser={{ email: "ada@example.test" }} />);
    await waitFor(() => expect(screen.getByText("1 runnable tool")).toBeInTheDocument());
    expect(tesApiFetch).toHaveBeenCalledWith("/api/tools?status=runnable", expect.anything());
  });

  it("formats a large runnable count", async () => {
    tesApiFetch.mockImplementation(path => Promise.resolve(path === "/api/tools?status=runnable" ? Array.from({ length: 803 }, (_, i) => ({ tool_id: `t${i}` })) : []));
    render(<Home currentUser={{ email: "ada@example.test" }} />);
    await waitFor(() => expect(screen.getByText("803 runnable tools")).toBeInTheDocument());
  });
});
