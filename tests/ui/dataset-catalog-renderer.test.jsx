import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DatasetCatalogRenderer, { groupByParent, isReadOnly, middleTruncate } from "../../src/ui/components/workbench/DatasetCatalogRenderer";

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

  it("shows reference-manifest rows as read-only, with no Delete button", async () => {
    const refRow = { id: "ref:homo_sapiens:GRCh38", name: "Homo sapiens GRCh38", category: "reference", type: "reference_assembly",
      version: "GRCh38", status: "present", root_path: "/data/reference/organisms/homo_sapiens/GRCh38", size_human: "880 GB",
      size_bytes: 1, age_days: 1, is_stale: false, source: "reference_manifest", read_only: true, tags: ["reference"] };
    const fetch = vi.fn(async url => {
      if (String(url).includes("/api/list/")) return response({ ...catalog, datasets: [refRow, catalog.datasets[0]] });
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetch);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DatasetCatalogRenderer />);

    const ref = await screen.findByRole("row", { name: "Inspect Homo sapiens GRCh38" });
    expect(within(ref).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(within(ref).getByText("read-only")).toBeInTheDocument();
    expect(within(ref).getByRole("button", { name: "Inspect" })).toBeInTheDocument();
    const user = screen.getByRole("row", { name: "Inspect Human reference" });
    expect(within(user).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(within(user).queryByText("read-only")).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/api/delete/"))).toBe(false);
  });

  it("treats ref: ids as read-only even without the flag", () => {
    expect(isReadOnly({ id: "ref:mus_musculus:GRCm39" })).toBe(true);
    expect(isReadOnly({ id: " REF:x " })).toBe(true);
    expect(isReadOnly({ id: "reference_hg38" })).toBe(false);
    expect(isReadOnly({ id: "custom", read_only: true })).toBe(true);
    expect(isReadOnly({ id: "custom", read_only: "yes" })).toBe(false);
    expect(isReadOnly(null)).toBe(false);
  });

  it("middle-truncates long paths and keeps the tail", () => {
    expect(middleTruncate("/short/path")).toBe("/short/path");
    const long = "/data/reference/organisms/homo_sapiens/GRCh38/indexes/bwa-mem2-2.2.1+primary/genome.fa.bwt.2bit.64";
    const cut = middleTruncate(long);
    expect(cut).toHaveLength(36);
    expect(cut).toContain("…");
    expect(long.startsWith(cut.split("…")[0])).toBe(true);
    expect(long.endsWith(cut.split("…")[1])).toBe(true);
    expect(middleTruncate(null)).toBe("");
  });

  it("groups children under parents that are in the list, and keeps orphans top-level", () => {
    const { roots, children } = groupByParent([
      { id: "a" }, { id: "a:genome:x", parent_id: "a" }, { id: "orphan", parent_id: "missing" }, { id: "self", parent_id: "self" },
    ]);
    expect(roots.map(item => item.id)).toEqual(["a", "orphan", "self"]);
    expect(children.get("a").map(item => item.id)).toEqual(["a:genome:x"]);
  });
});

describe("Dataset Catalog assembly grouping and path cell", () => {
  const asm = { id: "ref:homo_sapiens:GRCh38", name: "Homo sapiens GRCh38", category: "reference", type: "reference_assembly",
    root_path: "/data/reference/organisms/homo_sapiens/GRCh38", source: "reference_manifest", read_only: true, parent_id: null, tags: ["reference"] };
  const kid = (suffix, name, extra = {}) => ({ id: `${asm.id}:${suffix}`, name, category: "reference", type: "reference_index",
    root_path: `/data/reference/organisms/homo_sapiens/GRCh38/indexes/${suffix}/very/long/directory/name/genome.idx`,
    source: "reference_manifest", read_only: true, parent_id: asm.id, tags: [], ...extra });
  const kids = [kid("genome:GRCh38.fa", "GRCh38 genome"), kid("index:bwa-0.7+primary", "GRCh38 bwa index"),
    kid("annotation:gencode_v44", "GRCh38 annotation gencode", { is_stale: true })];
  const listed = { updated_at: "x", kpis: { dataset_count: 5, total_size_human: "880 GB", stale_count: 1 },
    datasets: [asm, ...kids, catalog.datasets[0]] };

  function stubList() {
    vi.stubGlobal("fetch", vi.fn(async url => String(url).includes("/api/list/")
      ? response(listed) : { ok: false, status: 404, json: async () => ({}) }));
  }

  it("shows only assembly and user rows by default and expands children on demand", async () => {
    stubList();
    const user = userEvent.setup();
    render(<DatasetCatalogRenderer />);
    await screen.findByText("Homo sapiens GRCh38");
    expect(screen.getByText("Human reference")).toBeInTheDocument();
    expect(screen.queryByText("GRCh38 genome")).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    // KPIs come from the server and do not change with the view.
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("880 GB")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Show 3 child rows of Homo sapiens GRCh38" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide 3 child rows of Homo sapiens GRCh38" })).toHaveAttribute("aria-expanded", "true");
    const rows = screen.getAllByRole("row").slice(1).map(row => row.getAttribute("aria-label"));
    expect(rows).toEqual(["Inspect Homo sapiens GRCh38", "Inspect GRCh38 genome", "Inspect GRCh38 bwa index",
      "Inspect GRCh38 annotation gencode", "Inspect Human reference"]);
    expect(screen.getByRole("row", { name: "Inspect GRCh38 genome" })).toHaveClass("is-child");
    expect(within(screen.getByRole("row", { name: "Inspect Human reference" })).queryByRole("button", { name: /child rows/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide 3 child rows of Homo sapiens GRCh38" }));
    expect(screen.queryByText("GRCh38 genome")).not.toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("keeps the flat view behind Show all rows", async () => {
    stubList();
    const user = userEvent.setup();
    render(<DatasetCatalogRenderer />);
    await screen.findByText("Homo sapiens GRCh38");
    await user.click(screen.getByRole("checkbox", { name: "Show all rows" }));
    expect(screen.getAllByRole("row")).toHaveLength(6);
    expect(screen.queryByRole("button", { name: /child rows/ })).not.toBeInTheDocument();
    expect(screen.getByRole("row", { name: "Inspect GRCh38 genome" })).not.toHaveClass("is-child");
    expect(screen.getByText("880 GB")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Show all rows" }));
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("opens an assembly by itself when only its children match the filters", async () => {
    stubList();
    const user = userEvent.setup();
    render(<DatasetCatalogRenderer />);
    await screen.findByText("Homo sapiens GRCh38");
    await user.type(screen.getByLabelText("Search datasets"), "bwa");
    expect(screen.getByText("Homo sapiens GRCh38")).toBeInTheDocument();
    expect(screen.getByText("GRCh38 bwa index")).toBeInTheDocument();
    expect(screen.queryByText("GRCh38 genome")).not.toBeInTheDocument();
    expect(screen.queryByText("Human reference")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Hide 1 of 3 child rows of Homo sapiens GRCh38" });
    await user.click(toggle);
    expect(screen.queryByText("GRCh38 bwa index")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    await user.selectOptions(screen.getByLabelText("Filter by freshness"), "stale");
    // The assembly is not stale, but its stale child keeps it listed. It was
    // closed by hand above, and that choice is kept.
    expect(screen.getByText("Homo sapiens GRCh38")).toBeInTheDocument();
    expect(screen.queryByText("GRCh38 annotation gencode")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show 1 of 3 child rows of Homo sapiens GRCh38" }));
    expect(screen.getByText("GRCh38 annotation gencode")).toBeInTheDocument();
    expect(screen.queryByText("GRCh38 genome")).not.toBeInTheDocument();
  });

  it("middle-truncates the path, keeps the full path in the title and copies it", async () => {
    stubList();
    const writeText = vi.fn(async () => {});
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<DatasetCatalogRenderer />);
    await screen.findByText("Homo sapiens GRCh38");
    await user.click(screen.getByRole("checkbox", { name: "Show all rows" }));
    const row = screen.getByRole("row", { name: "Inspect GRCh38 bwa index" });
    const full = kids[1].root_path;
    const code = within(row).getByTitle(full);
    expect(code.textContent).toBe(middleTruncate(full));
    expect(code.textContent).not.toBe(full);
    await user.click(within(row).getByRole("button", { name: "Copy path" }));
    expect(writeText).toHaveBeenCalledWith(full);
    expect(within(row).getByRole("button", { name: "Path copied" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // A path that fits is shown whole.
    const short = catalog.datasets[0].root_path;
    expect(within(screen.getByRole("row", { name: "Inspect Human reference" })).getByTitle(short).textContent).toBe(short);
  });

  it("keyboard on the inner buttons does not open the inspector", async () => {
    stubList();
    const user = userEvent.setup();
    render(<DatasetCatalogRenderer />);
    await screen.findByText("Homo sapiens GRCh38");
    screen.getByRole("button", { name: "Show 3 child rows of Homo sapiens GRCh38" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("GRCh38 genome")).toBeInTheDocument();
  });
});
