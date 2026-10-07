import React from "react";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadExploreResources } = vi.hoisted(() => ({ loadExploreResources: vi.fn() }));
vi.mock("../../src/ui/lib/exploreApi", () => ({ loadExploreResources }));
import Explore from "../../src/ui/pages/Explore";

const resources = [
  { id: "tool:fastqc", type: "tool", name: "FastQC", description: "Quality control for sequencing reads", tags: ["quality-control", "sequencing"], destination: { kind: "navigate", page: 9, label: "Open Jobs" }, source: "tes-tool-registry" },
  { id: "service:rna", type: "service", name: "RNA Analysis", description: "RNA analysis workbench", tags: ["RNA-seq"], destination: { kind: "service", url: "/_svc/workbench/plugins/rna/", label: "RNA Analysis" }, source: "workbench-catalog" },
  { id: "capability:rna", type: "capability", name: "RNA-seq", description: "RNA analysis workbench", tags: ["transcriptomics"], destination: { kind: "service", url: "/_svc/workbench/plugins/rna/", label: "RNA Analysis" }, source: "workbench-catalog" },
];

beforeEach(() => loadExploreResources.mockResolvedValue({ resources, failures: [] }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Explore page", () => {
  it("replaces the placeholder with the heading, subtitle, search and filters", async () => {
    render(<Explore />);
    expect(screen.getByRole("heading", { name: "Explore" })).toBeInTheDocument();
    expect(screen.getByText("Discover tools, workflows, services, domains and scientific capabilities across OmniBioAI.")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search OmniBioAI" })).toHaveAttribute("placeholder", "Search OmniBioAI...");
    for (const label of ["All", "Tools", "Workflows", "Services", "Domains", "Capabilities"]) expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    expect(screen.queryByText(/being prepared/i)).not.toBeInTheDocument();
  });

  it("renders canonical resources and searches name, description and tags", async () => {
    render(<Explore />);
    expect(await screen.findByRole("heading", { name: "FastQC" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "sequencing" } });
    expect(screen.getByRole("heading", { name: "FastQC" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "RNA Analysis" })).not.toBeInTheDocument();
  });

  it("composes category filtering with search and marks the active filter", async () => {
    render(<Explore />);
    await screen.findByRole("heading", { name: "FastQC" });
    fireEvent.click(screen.getByRole("button", { name: /^Services/ }));
    expect(screen.getByRole("button", { name: /^Services/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "RNA Analysis" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "FastQC" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing" } });
    expect(screen.getByText(/No results found for "missing"/)).toBeInTheDocument();
  });

  it("supports empty search as the default discovery view", async () => {
    render(<Explore />);
    await screen.findByRole("heading", { name: "FastQC" });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "RNA" } });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "   " } });
    expect(screen.getByRole("heading", { name: "FastQC" })).toBeInTheDocument();
  });

  it("shows loading, complete error and partial source states", async () => {
    let resolve;
    loadExploreResources.mockReturnValueOnce(new Promise(next => { resolve = next; }));
    render(<Explore />);
    expect(screen.getByRole("status")).toHaveTextContent(/Loading discovery sources/);
    resolve({ resources: [], failures: ["some applications"] });
    await waitFor(() => expect(screen.getByText(/No resources are available/)).toBeInTheDocument());
    expect(screen.getByText(/some applications/)).toBeInTheDocument();

    cleanup();
    loadExploreResources.mockRejectedValueOnce(new Error("private backend detail"));
    render(<Explore />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Discovery sources are temporarily unavailable.");
    expect(screen.queryByText(/private backend detail/)).not.toBeInTheDocument();
  });

  it("opens the canonical destination supplied by the source adapter", async () => {
    const onOpen = vi.fn();
    render(<Explore onOpen={onOpen} />);
    await screen.findByRole("heading", { name: "FastQC" });
    fireEvent.click(screen.getByRole("button", { name: "Open FastQC" }));
    expect(onOpen).toHaveBeenCalledWith(resources[0].destination, resources[0]);
  });
});
