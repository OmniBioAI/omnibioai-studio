import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: "user-7-token", version: 1, perms: ["biorepo.read", "biorepo.write"] }));
vi.mock("../../src/ui/lib/session", () => ({
  getToken: () => session.token,
  getSessionVersion: () => session.version,
  isElectron: () => false,
  hasPermission: permission => session.perms.includes(permission),
  onSessionChange: () => () => {},
}));
vi.mock("../../src/ui/pages/PluginPage", () => ({ default: ({ slug }) => <div>plugin {slug}</div> }));
import {
  BiorepoError, createDataset, downloadUrl, getLineage, searchDatasets, uploadFile,
} from "../../src/ui/lib/biorepoApi";
import BioRepository from "../../src/ui/components/biorepo/BioRepository";
import DatasetDetail from "../../src/ui/components/biorepo/DatasetDetail";
import IngestForm from "../../src/ui/components/biorepo/IngestForm";
import AdminCapacity from "../../src/ui/components/biorepo/AdminCapacity";
import { runsFromGraph } from "../../src/ui/components/biorepo/LineageView";
import { errorText, formatBytes } from "../../src/ui/components/biorepo/messages";
import DataHub from "../../src/ui/pages/DataHub";

const API = "/_svc/workbench/api/biorepo/v1";
const DS = "ds_01JCZ7Y3K8Q9W2E4R6T8Y0V2X4";
const DS_IN = "ds_01JCZ7Y3K8Q9W2E4R6T8Y0V2AA";
const FO = "fo_01JCZ7Y3K8Q9W2E4R6T8Y0V2F1";
const SHA = "a".repeat(64);
const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const dataset = (over = {}) => ({
  id: DS, project: 3, type: "transcriptomics", title: "Liver RNA-seq", visibility: "tenant", owner_id: "7",
  tags: ["liver"], latest_version: 1, created_at: "2026-11-14T08:00:00Z", updated_at: "2026-11-14T09:00:00Z",
  facets: { organism_taxid: 9606, assay: "bulk", reference_build: "GRCh38" }, description: "Counts", samples: [], ...over,
});
const version = (over = {}) => ({
  version: 1, status: "ready", status_detail: "", created_by: "7", created_at: "2026-11-14T08:00:00Z",
  sealed_at: "2026-11-14T08:05:00Z", changelog: "first", metadata: { assay: "bulk" }, validation: { issues: [] },
  backup_class: "raw", backup_class_reason: "upload default", storage_class: "primary", total_bytes: 2048,
  drs_bundle_uri: `drs://drs.omnibioai.org/bv_${DS.slice(3)}_1`,
  files: [{ path: "counts.tsv", size: 2048, sha256: SHA, md5: null, format: "tsv", registered_in_place: true,
    drift_state: "ok", drs_id: FO, drs_uri: `drs://drs.omnibioai.org/${FO}` }], ...over,
});
const graph = {
  dataset: DS, depth: 1, truncated: false,
  nodes: [{ id: `${DS}@v1`, kind: "version", status: "ready", backup_class: "derived" },
    { id: "workflow_run:wr-1", kind: "workflow_run", workflow_id: "rnaseq", workflow_version: "3.14.0", pinned: true },
    { id: `${DS_IN}@v2`, kind: "version", status: "ready", backup_class: "raw" },
    { id: "hidden:1", kind: "version", hidden: true }],
  edges: [{ from: `${DS_IN}@v2`, to: "workflow_run:wr-1", role: "input" },
    { from: "hidden:1", to: "workflow_run:wr-1", role: "input" },
    { from: "workflow_run:wr-1", to: `${DS}@v1`, role: "output" }],
};

let routes;
const calls = [];
beforeEach(() => {
  session.token = "user-7-token"; session.version = 1; session.perms = ["biorepo.read", "biorepo.write"];
  calls.length = 0;
  routes = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
    const method = options.method || "GET";
    calls.push({ url: String(url), method, options });
    for (const [match, handler] of routes) if (match(String(url), method)) return handler(String(url), options);
    throw new Error(`unexpected ${method} ${url}`);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const on = (method, test, handler) => routes.push([(url, m) => m === method && test(url), handler]);
const path = url => url.replace(API, "").split("?")[0];

describe("biorepoApi", () => {
  it("searches through the workbench route with the bearer token and only known filters", async () => {
    on("GET", url => url.startsWith(`${API}/search?`), () => reply({ total: 0, results: [], facets: {} }));
    await searchDatasets({ q: " liver ", assay: "bulk", owner: "", evil: "x" }, { page: 2, pageSize: 10 });
    const [{ url, options }] = calls;
    expect(url).toBe(`${API}/search?q=liver&assay=bulk&page=2&page_size=10`);
    expect(options).toEqual(expect.objectContaining({ credentials: "same-origin", cache: "no-store" }));
    expect(options.headers.Authorization).toBe("Bearer user-7-token");
  });

  it("maps API errors to codes and refuses invalid ids before any request", async () => {
    on("GET", url => url.includes("/lineage"), () => reply({ error: { code: "DATASET_NOT_FOUND", message: "dataset not found" } }, 404));
    await expect(getLineage(DS, 2)).rejects.toMatchObject({ code: "DATASET_NOT_FOUND", status: 404 });
    expect(() => getLineage("../etc", 1)).toThrow(BiorepoError);
    expect(() => getLineage(DS, 9)).toThrow(BiorepoError);
    expect(() => createDataset({ project: "x", type: "generic", title: "t" })).toThrow(BiorepoError);
    on("GET", url => url.includes("/search"), () => reply({}, 401));
    await expect(searchDatasets()).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("drops a response that arrives after the session changed", async () => {
    on("GET", () => true, async () => { session.version = 2; return reply({ total: 0 }); });
    await expect(searchDatasets()).rejects.toMatchObject({ code: "stale" });
  });

  it("uploads in Content-Range chunks no larger than the server allows and completes", async () => {
    const id = "11111111-2222-4333-8444-555555555555";
    on("POST", url => url.endsWith("/versions/1/uploads"), () => reply({ upload_id: id, received_bytes: 0, max_chunk_bytes: 4 }, 201));
    on("PUT", url => url.endsWith(`/uploads/${id}`), (url, options) => {
      const [, , end] = /bytes (\d+)-(\d+)\/(\d+)/.exec(options.headers["Content-Range"]);
      return reply({ received_bytes: Number(end) + 1 });
    });
    on("POST", url => url.endsWith(`/uploads/${id}/complete`), () => reply({ path: "a.txt", drs_id: FO }, 201));
    const progress = [];
    const file = new File(["0123456789"], "a.txt");
    await uploadFile(DS, 1, file, "a.txt", { onProgress: n => progress.push(n) });
    expect(calls.filter(c => c.method === "PUT").map(c => c.options.headers["Content-Range"]))
      .toEqual(["bytes 0-3/10", "bytes 4-7/10", "bytes 8-9/10"]);
    expect(progress).toEqual([4, 8, 10]);
    expect(JSON.parse(calls[0].options.body)).toEqual({ path: "a.txt", size: 10 });
  });

  it("accepts only a signed BioRepository download link", async () => {
    on("POST", () => true, () => reply({ url: "https://webstudio.omnibioai.org/api/biorepo/v1/download/tok" }));
    expect(await downloadUrl(FO)).toBe("https://webstudio.omnibioai.org/api/biorepo/v1/download/tok");
    routes = [];
    on("POST", () => true, () => reply({ url: "https://evil.example/phish" }));
    await expect(downloadUrl(FO)).rejects.toMatchObject({ code: "invalid" });
    routes = [];
    on("POST", () => true, () => reply({ url: "javascript:alert(1)" }));
    await expect(downloadUrl(FO)).rejects.toMatchObject({ code: "invalid" });
    expect(() => downloadUrl("fo_bad")).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("Repository browse", () => {
  it("lists datasets with facets, filters by a facet and opens a dataset", async () => {
    on("GET", url => url.startsWith(`${API}/search?`), url => reply({
      total: 1, page: 1, page_size: 25, results: [dataset()],
      facets: { type: [{ value: "transcriptomics", count: 1 }], assay: [{ value: "bulk", count: 1 }] },
      _url: url,
    }));
    on("GET", url => path(url) === `/datasets/${DS}`, () => reply(dataset()));
    on("GET", url => path(url) === `/datasets/${DS}/versions`, () => reply({ versions: [version()] }));
    on("GET", url => path(url) === `/datasets/${DS}/versions/1`, () => reply(version()));
    on("GET", url => path(url) === `/datasets/${DS}/lineage`, () => reply({ ...graph, nodes: [], edges: [] }));
    render(<BioRepository />);
    const row = (await screen.findByRole("button", { name: "Liver RNA-seq" })).closest("tr");
    expect(within(row).getByText("bulk · GRCh38")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /bulk 1/ }));
    await waitFor(() => expect(calls.some(c => c.url.includes("assay=bulk"))).toBe(true));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search datasets" }), { target: { value: "liver" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(calls.some(c => c.url.includes("q=liver&assay=bulk"))).toBe(true));
    fireEvent.click(await screen.findByRole("button", { name: "Liver RNA-seq" }));
    expect(await screen.findByRole("heading", { name: "Liver RNA-seq" })).toBeInTheDocument();
    expect(window.location.search).toBe(`?dataset=${DS}`);
    fireEvent.click(screen.getByRole("button", { name: "← Repository" }));
    expect(await screen.findByRole("search")).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("shows an error with retry, and hides New dataset without biorepo.write", async () => {
    session.perms = ["biorepo.read"];
    let fail = true;
    on("GET", () => true, () => (fail ? reply({}, 503) : reply({ total: 0, results: [], facets: {} })));
    render(<BioRepository />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t search the repository");
    expect(screen.queryByRole("button", { name: "New dataset" })).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No datasets match.")).toBeInTheDocument();
  });
});

describe("Dataset detail", () => {
  function serveDataset(v = version()) {
    on("GET", url => path(url) === `/datasets/${DS}`, () => reply(dataset()));
    on("GET", url => path(url) === `/datasets/${DS}/versions`, () => reply({ versions: [v] }));
    on("GET", url => path(url) === `/datasets/${DS}/versions/1`, () => reply(v));
    on("GET", url => path(url) === `/datasets/${DS}/lineage`, () => reply(graph));
  }

  it("shows files with checksums and DRS URIs, copies a DRS URI and downloads through a fresh signed link", async () => {
    serveDataset();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign, search: "" });
    on("POST", url => url.endsWith(`/files/${FO}/download-url`), () => reply({ url: "http://localhost/api/biorepo/v1/download/t1" }));
    render(<DatasetDetail datasetId={DS} onBack={() => {}} onOpenDataset={() => {}} canWrite />);
    const row = (await screen.findByRole("rowheader", { name: /counts\.tsv/ })).closest("tr");
    expect(within(row).getByText(`${SHA.slice(0, 12)}…`)).toHaveAttribute("title", SHA);
    expect(within(row).getByText("in place")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Copy DRS URI of counts.tsv" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`drs://drs.omnibioai.org/${FO}`));
    fireEvent.click(within(row).getByRole("button", { name: "Download counts.tsv" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("http://localhost/api/biorepo/v1/download/t1"));
    expect(screen.getByText("raw · backed up")).toHaveAttribute("title", "upload default");
  });

  it("shows lineage by run, hides what the caller can't see, and refetches with more hops", async () => {
    serveDataset();
    const openDataset = vi.fn();
    render(<DatasetDetail datasetId={DS} onBack={() => {}} onOpenDataset={openDataset} canWrite />);
    const lineage = await screen.findByRole("region", { name: "Lineage" });
    expect(within(lineage).getByText("Workflow run wr-1")).toBeInTheDocument();
    expect(within(lineage).getByText(/rnaseq @ 3\.14\.0 · pinned/)).toBeInTheDocument();
    expect(within(lineage).getByText("a version you can’t see")).toBeInTheDocument();
    fireEvent.click(within(lineage).getByRole("button", { name: `${DS_IN} v2` }));
    expect(openDataset).toHaveBeenCalledWith(DS_IN);
    fireEvent.change(within(lineage).getByRole("combobox", { name: "Run hops" }), { target: { value: "3" } });
    await waitFor(() => expect(calls.some(c => c.url.endsWith("/lineage?depth=3"))).toBe(true));
  });

  it("shows what regenerating a derived version needs", async () => {
    serveDataset(version({
      backup_class: "derived", backup_class_reason: "every input is a ready raw DRS version and the workflow is pinned",
      regeneration: { run_kind: "workflow_run", run_id: "wr-1", workflow_id: "rnaseq", workflow_version: "3.14.0",
        workflow_version_pinned: true, inputs: [{ dataset: DS_IN, version: 2, status: "ready",
          drs_uri: "drs://drs.omnibioai.org/bv_x_2", files: [{ path: "r1.fq", drs_uri: "drs://h/fo_1", sha256: SHA }] },
        { hidden: true }] },
    }));
    render(<DatasetDetail datasetId={DS} onBack={() => {}} onOpenDataset={() => {}} canWrite />);
    const regen = await screen.findByRole("region", { name: "To regenerate this version" });
    expect(regen).toHaveTextContent("Run rnaseq @ 3.14.0 (workflow run wr-1) on:");
    expect(regen).toHaveTextContent("drs://drs.omnibioai.org/bv_x_2");
    expect(regen).toHaveTextContent("drs://h/fo_1");
    expect(regen).toHaveTextContent("an input version you can’t see");
    expect(screen.getByText("derived · not backed up")).toBeInTheDocument();
  });

  it("reports a dataset it can't open", async () => {
    on("GET", () => true, () => reply({ error: { code: "DATASET_NOT_FOUND" } }, 404));
    render(<DatasetDetail datasetId={DS} onBack={() => {}} onOpenDataset={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("doesn’t exist or isn’t shared with you");
  });

  it("offers to finish a version that is still being prepared", async () => {
    serveDataset(version({ status: "ingesting", sealed_at: null, files: [] }));
    render(<DatasetDetail datasetId={DS} onBack={() => {}} onOpenDataset={() => {}} canWrite />);
    expect(await screen.findByRole("heading", { name: "Add files to version 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New version" })).toBeNull();
  });
});

describe("Ingest form", () => {
  beforeEach(() => {
    on("GET", url => url.includes("/api/projects/"), () => reply({ projects: [
      { id: 3, name: "Liver", description: "", status: "active", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }] }));
  });

  it("registers NAS data in place for a new dataset, then seals; a retry does not create a second dataset", async () => {
    let registerFails = true;
    on("POST", url => path(url) === "/datasets", () => reply(dataset({ latest_version: null }), 201));
    on("POST", url => path(url) === `/datasets/${DS}/versions`, () => reply(version({ status: "ingesting" }), 201));
    on("POST", url => path(url) === `/datasets/${DS}/versions/1/register`, () => (registerFails
      ? reply({ error: { code: "PATH_NOT_ALLOWED", message: "x" } }, 403) : reply({ registered: 2, files: [] }, 201)));
    on("POST", url => path(url) === `/datasets/${DS}/versions/1/seal`, () => reply(version({ status: "ingesting" }), 202));
    const onDone = vi.fn();
    render(<IngestForm onDone={onDone} />);
    await screen.findByRole("option", { name: "Liver" });
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Liver counts" } });
    fireEvent.click(screen.getByRole("radio", { name: /Register data already on the NAS/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Path in your folders" }), { target: { value: "tenant_7/runs/out" } });
    fireEvent.click(screen.getByRole("button", { name: "Add files and seal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("only register data inside your own tenant");
    registerFails = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(DS));
    expect(calls.filter(c => c.method === "POST" && path(c.url) === "/datasets")).toHaveLength(1);
    expect(calls.filter(c => c.method === "POST" && path(c.url) === `/datasets/${DS}/versions`)).toHaveLength(1);
    expect(JSON.parse(calls.find(c => path(c.url) === "/datasets").options.body))
      .toEqual({ project: 3, type: "generic", title: "Liver counts", description: "", visibility: "private", tags: [] });
    expect(JSON.parse(calls.find(c => c.url.endsWith("/register")).options.body))
      .toEqual({ source_path: "tenant_7/runs/out", prefix: "" });
  });

  it("uploads chosen files into a new version of an existing dataset", async () => {
    const id = "11111111-2222-4333-8444-555555555555";
    on("POST", url => path(url) === `/datasets/${DS}/versions`, () => reply(version({ version: 2, status: "ingesting" }), 201));
    on("POST", url => path(url) === `/datasets/${DS}/versions/2/uploads`, () => reply({ upload_id: id, received_bytes: 0 }, 201));
    on("PUT", () => true, () => reply({ received_bytes: 3 }));
    on("POST", url => url.endsWith("/complete"), () => reply({}, 201));
    on("POST", url => url.endsWith("/versions/2/seal"), () => reply({}, 202));
    const onDone = vi.fn();
    render(<IngestForm datasetId={DS} onDone={onDone} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("Files to upload"), { target: { files: [new File(["abc"], "x.tsv")] } });
    expect(screen.getByText(/x\.tsv · 3 B/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add files and seal" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(DS));
    expect(calls.some(c => c.url.includes("/api/projects/"))).toBe(false);
  });
});

describe("Admin capacity and the Data page", () => {
  it("shows volumes and backup state in TiB", async () => {
    on("GET", url => url.endsWith("/admin/capacity"), () => reply({
      units: "TiB", thresholds_pct: { warn: [75, 85], hard_stop: 90 },
      volumes: [{ id: "primary", class: "primary", capacity_tib: 58.2, used_tib: 2.8, free_tib: 55.4, used_pct: 4.81,
        level: "ok", repository_uploaded_tib: 0.001 }],
      backup: { raw_tib: 0.5, capacity_tib: 23.6, raw_pct: 2.12, state: "NOT PROTECTED", reason: "no backup status configured" },
      archive: { enabled: false, state: "not installed" },
    }));
    render(<AdminCapacity />);
    const row = (await screen.findByRole("rowheader", { name: "primary" })).closest("tr");
    expect(within(row).getByText("58.20 TiB")).toBeInTheDocument();
    expect(within(row).getByText("OK")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Backup: NOT PROTECTED" })).toBeInTheDocument();
    expect(screen.getByText("no backup status configured")).toBeInTheDocument();
    expect(screen.getByText("Archive: not installed.")).toBeInTheDocument();
  });

  it("shows a forbidden capacity view as an error", async () => {
    on("GET", () => true, () => reply({ error: { code: "FORBIDDEN", message: "biorepo.admin is required" } }, 403));
    render(<AdminCapacity />);
    expect(await screen.findByRole("alert")).toHaveTextContent("don’t have permission");
  });

  it("adds a Repository tab, and a Capacity tab only for biorepo.admin", async () => {
    render(<DataHub />);
    expect(screen.getByRole("tab", { name: "Repository" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Capacity" })).toBeNull();
    expect(screen.getByText("plugin dataset_catalog")).toBeInTheDocument();
    cleanup();
    session.perms = ["biorepo.admin"];
    on("GET", () => true, () => reply({ total: 0, results: [], facets: {} }));
    window.history.replaceState({}, "", `/studio/data?dataset=${DS}`);
    on("GET", () => false, () => reply({}));
    render(<DataHub />);
    expect(screen.getByRole("tab", { name: "Capacity" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Repository" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("helpers", () => {
  it("formats sizes in binary units and maps error codes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(3 * 1024 ** 4)).toBe("3.0 TiB");
    expect(formatBytes(-1)).toBe("—");
    expect(errorText({ code: "INVALID_FIELD", message: "title is required" })).toBe("title is required");
    expect(errorText({ code: "PATH_NOT_ALLOWED", message: "internal detail" })).toMatch(/own tenant/);
    expect(errorText({ code: "SOMETHING_NEW" })).toMatch(/unavailable/);
  });

  it("groups a lineage graph by run", () => {
    const [run] = runsFromGraph(graph);
    expect(run.run.id).toBe("workflow_run:wr-1");
    expect(run.inputs.map(n => n.id)).toEqual([`${DS_IN}@v2`, "hidden:1"]);
    expect(run.outputs.map(n => n.id)).toEqual([`${DS}@v1`]);
  });
});
