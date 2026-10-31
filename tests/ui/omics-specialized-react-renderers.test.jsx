import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";
import { ProteomicsReactRenderer, SingleCellLoomViewerReactRenderer } from "../../src/ui/components/workbench/OmicsSpecializedReactRenderers";
import { pluginEndpoint } from "../../src/ui/lib/pluginApi";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

describe("specialized omics React workspaces", () => {
  it("registers LOOM and Proteomics to their interactive React workflows", () => {
    expect(resolveWorkbenchRenderer("async_analysis", "single_cell_loom_viewer")).toBe(SingleCellLoomViewerReactRenderer);
    expect(resolveWorkbenchRenderer("async_analysis", "proteomics")).toBe(ProteomicsReactRenderer);
    expect(() => pluginEndpoint("/plugins/proteomics/api/ui/run/run-123/execute/")).not.toThrow();
    expect(() => pluginEndpoint("/plugins/proteomics/api/ui/run/run-123/status/")).not.toThrow();
  });

  it("browses registered LOOM/AnnData objects and exposes the major viewer actions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      ok: true, count: 1, objects: [{ id: "a1", display_name: "cells.h5ad", path: "work/cells.h5ad", format: "h5ad", tags: [] }],
    })));
    render(<SingleCellLoomViewerReactRenderer/>);
    expect(await screen.findByRole("option", { name: "cells.h5ad · h5ad" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load object" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Upload .loom/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh objects" })).toBeInTheDocument();
  });

  it("loads a dataset, resolves a gene, and exports entered annotations through the LOOM APIs", async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.includes("/api/objects/")) return jsonResponse({ ok: true, objects: [{ id: "a1", display_name: "cells.loom", path: "work/cells.loom", format: "loom" }] });
      if (url.includes("/api/load/")) return jsonResponse({ ok: true, dataset: { path: "work/cells.loom", format: "loom", n_cells: 2, n_genes: 2, embedding_key: "X_umap" }, plot: { x: [0, 1], y: [1, 0], plot_indices: [0, 1], cell_ids: ["c1", "c2"] } });
      if (url.includes("/api/gene/")) return jsonResponse({ ok: true, gene: "GENE1", values: [0, 4] });
      if (url.includes("/api/annotations/export/")) return jsonResponse({ ok: true, annotation_path: "work/annotations.json", object: { display_name: "annotations.json" } });
      throw new Error(`Unexpected API request: ${url} ${options.method || "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SingleCellLoomViewerReactRenderer/>);
    await screen.findByRole("option", { name: "cells.loom · loom" });
    fireEvent.click(screen.getByRole("button", { name: "Load object" }));
    expect(await screen.findByText("Loaded 2 cells and 2 genes.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Gene lookup"), { target: { value: "GENE1" } });
    fireEvent.click(screen.getByRole("button", { name: "Find gene" }));
    expect(await screen.findByText("GENE1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Annotations (JSON)"), { target: { value: '{"cell_annotations":{"c1":"T cell"}}' } });
    fireEvent.click(screen.getByRole("button", { name: "Validate and export annotations" }));
    expect(await screen.findByText(/Annotations exported as annotations.json/)).toBeInTheDocument();
    const exportCall = fetchMock.mock.calls.find(([url]) => url.includes("/api/annotations/export/"));
    expect(JSON.parse(exportCall[1].body)).toEqual({ dataset_path: "work/cells.loom", annotations: { cell_annotations: { c1: "T cell" } } });
  });

  it("presents Proteomics upload/object modes and its preserved four-step workflow", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true, objects: [] })));
    render(<ProteomicsReactRenderer/>);
    expect(await screen.findByText("1 · Load and preview data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload files" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workbench objects" })).toBeInTheDocument();
    expect(screen.getByText("Cohorts")).toBeInTheDocument();
    expect(screen.getByText("Configure")).toBeInTheDocument();
    expect(screen.getByText("Run")).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/plugins/proteomics/api/ui/objects/"), expect.any(Object)));
  });
});
