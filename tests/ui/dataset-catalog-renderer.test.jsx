import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DatasetCatalogRenderer from "../../src/ui/components/workbench/DatasetCatalogRenderer";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const catalog = {
  updated_at: "2026-10-31T12:00:00Z",
  kpis: { dataset_count: 2, total_size_human: "12.4 MB", stale_count: 1 },
  datasets: [
    { id: "reference_hg38", name: "Human reference", category: "reference", type: "fasta", version: "hg38", status: "ready", root_path: "/data/reference/hg38.fa", size_human: "12 MB", size_bytes: 12000000, last_updated_display: "Today", age_days: 0, is_stale: false, source: "local", tags: ["human", "genome"] },
    { id: "annotation_old", name: "Old annotation", category: "annotation", type: "gtf", status: "failed", root_path: "", size_human: "400 KB", size_bytes: 400000, age_days: 180, is_stale: true, tags: [] },
  ],
};

function response(payload = {}) { return { ok: true, json: async () => payload }; }

describe("Dataset Catalog React renderer", () => {
  it("loads KPIs, filters datasets and opens deterministic intelligence", async () => {
    const fetch = vi.fn(async url => {
      if (String(url).includes("/api/list/")) return response(catalog);
      if (String(url).includes("/api/datasets/intelligence/")) return response({
        summary: { rows: 10 }, structure: { columns: 4 }, quality: { missing_values: 0 },
        semantics: ["genomics", "reference"], compatible_plugins: [{ slug: "variant_annotation", name: "Variant Annotation", score: 0.94 }],
      });
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<DatasetCatalogRenderer />);

    expect(await screen.findByText("Human reference")).toBeInTheDocument();
    expect(screen.getByText("12.4 MB")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Filter by category"), "annotation");
    expect(screen.getByText("Old annotation")).toBeInTheDocument();
    expect(screen.queryByText("Human reference")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    const referenceRow = screen.getByRole("row", { name: "Inspect Human reference" });
    await user.click(within(referenceRow).getByRole("button", { name: "Inspect" }));
    expect(await screen.findByRole("dialog", { name: "Dataset Intelligence" })).toBeInTheDocument();
    expect(screen.getByText(/"rows": 10/)).toBeInTheDocument();
    expect(screen.getByText("genomics")).toBeInTheDocument();
    expect(screen.getByText("Variant Annotation")).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => String(url).includes("dataset_id=reference_hg38"))).toBe(true);
  });

  it("registers a dataset and deletes it through the existing Workbench APIs", async () => {
    let current = { ...catalog, datasets: [catalog.datasets[0]] };
    const fetch = vi.fn(async (url, options = {}) => {
      if (String(url).includes("/api/list/")) return response(current);
      if (String(url).includes("/api/create/")) {
        const payload = JSON.parse(options.body);
        expect(payload).toMatchObject({ id: "custom_panel", name: "Custom panel", category: "panel", type: "vcf", root_path: "/data/panel.vcf", tags: "hg38, test" });
        current = { ...current, datasets: [...current.datasets, { ...payload, tags: ["hg38", "test"], is_stale: false, size_human: "—", size_bytes: 0, age_days: 0 }] };
        return response({ status: "ok", id: payload.id });
      }
      if (String(url).includes("/api/delete/")) {
        current = { ...current, datasets: current.datasets.filter(item => !String(url).includes(`/api/delete/${item.id}/`)) };
        return response({ status: "ok", deleted: 1 });
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<DatasetCatalogRenderer />);

    await screen.findByText("Human reference");
    await user.click(screen.getByRole("button", { name: "Add Dataset" }));
    const dialog = screen.getByRole("dialog", { name: "Add Dataset" });
    await user.type(within(dialog).getByLabelText("Dataset ID *"), "custom_panel");
    await user.type(within(dialog).getByLabelText("Name"), "Custom panel");
    await user.type(within(dialog).getByLabelText("Category"), "panel");
    await user.type(within(dialog).getByLabelText("Type"), "vcf");
    await user.type(within(dialog).getByLabelText("Root path"), "/data/panel.vcf");
    await user.type(within(dialog).getByLabelText("Tags (comma-separated)"), "hg38, test");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Custom panel")).toBeInTheDocument();

    const addedRow = screen.getByRole("row", { name: "Inspect Custom panel" });
    await user.click(within(addedRow).getByRole("button", { name: "Delete" }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(fetch.mock.calls.some(([url, options]) => String(url).includes("/api/delete/custom_panel/") && options.method === "POST")).toBe(true));
  });
});
