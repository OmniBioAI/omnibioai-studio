// Dataset Catalog polish: middle-truncated Path column with the full path in the
// title and a Copy button, assembly rows with an expand toggle for their child
// genome/index/annotation rows, and the "Show all rows" flat view. Mocked
// Workbench with synthetic rows. Set CATALOG_SCREENSHOT_DIR=<dir> to write
// review images at 1440 px and 390 px.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { serveRuntimeConfig } from "./runtime-config.mjs";
import { readFile, mkdir } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromiumLaunchOptions } from "./chromium-launch-options.mjs";

const { chromium } = createRequire(new URL("../../packages/omnibioai-ui/package.json", import.meta.url))("playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const build = resolve(root, "dist/web");
const screenshots = process.env.CATALOG_SCREENSHOT_DIR && resolve(root, process.env.CATALOG_SCREENSHOT_DIR);

const member = {
  valid: true, user_id: 7, email: "scientist@example.test", roles: ["scientist"],
  permissions: ["dataset.read"], org_id: 42, org_role: ["org_member"], team_id: null, team_role: null,
  auth_method: "password", idp_org_id: null, schema_version: 2,
};
const identity = {
  user: { id: 7, email: member.email, status: "active" }, global_roles: [], global_permissions: [],
  organizations: [{ organization_id: 42, organization_name: "Northstar Research", roles: ["org_member"], effective_permissions: ["dataset.read"] }],
};
// The Workbench dataset_catalog ui-schema, as served.
const DESCRIPTOR = {"schema_version": 2, "plugin": {"slug": "dataset_catalog", "name": "Dataset Catalog", "version": "1.0.1", "description": "Central catalog of datasets: versions, size, freshness, schema, and lineage links", "category": "dashboard"}, "renderer": "query", "native_supported": true, "outputs": [], "capabilities": {"query": true}, "endpoints": {"query": "/plugins/dataset_catalog/api/ui-query/"}, "operations": [{"id": "list_datasets", "label": "List datasets", "inputs": [{"id": "stale_days", "component": "number", "format": "integer", "label": "Stale after days", "description": "Stale after days", "required": false, "default": 180, "min": 1, "max": 36500, "step": 1}], "result": {"presentation": "table", "rows_path": "results", "row_key": "id", "columns": [{"key": "id", "label": "Dataset ID"}, {"key": "name", "label": "Name"}, {"key": "category", "label": "Category"}, {"key": "type", "label": "Type"}, {"key": "version", "label": "Version"}, {"key": "status", "label": "Status"}, {"key": "source", "label": "Source"}, {"key": "size_human", "label": "Size"}, {"key": "last_updated", "label": "Updated"}, {"key": "is_stale", "label": "Stale"}]}}, {"id": "dataset_intelligence", "label": "Inspect dataset", "inputs": [{"id": "path", "component": "text", "format": "text", "label": "Dataset path", "description": "Dataset path", "required": true}, {"id": "dataset_id", "component": "text", "format": "text", "label": "Dataset ID", "description": "Dataset ID", "required": false}], "result": {"presentation": "table", "rows_path": "results", "row_key": "path", "columns": [{"key": "path", "label": "Path"}, {"key": "dataset_id", "label": "Dataset ID"}, {"key": "dataset_type", "label": "Dataset type"}, {"key": "format", "label": "Format"}, {"key": "signature", "label": "Signature"}, {"key": "summary_json", "label": "Summary"}]}}], "default_operation": "list_datasets"};
const REF = "/data/reference/organisms";
const row = (id, name, type, path, extra = {}) => ({
  id, name, category: "reference", type, root_path: path, version: extra.version || "", status: "present", source: "reference_manifest",
  read_only: true, size_human: "—", size_bytes: 0, tags: ["reference"], last_updated_display: "2026-11-14", age_days: 1, is_stale: false,
  parent_id: null, ...extra,
});
function assembly(species, sci, asm, size) {
  const id = `ref:${species}:${asm}`, base = `${REF}/${species}/${asm}`;
  return [
    row(id, `${sci} ${asm}`, "reference_assembly", base, { version: asm, size_human: size }),
    row(`${id}:genome:${asm}.primary_assembly.fa.gz`, `${sci} ${asm} genome ${asm}.primary_assembly.fa.gz`, "reference_genome",
      `${base}/genome/${asm}.primary_assembly.fa.gz`, { parent_id: id, version: asm, size_human: "0.9 GB" }),
    row(`${id}:index:bwa-mem2-2.2.1+primary`, `${sci} ${asm} bwa-mem2 2.2.1 (primary)`, "reference_index",
      `${base}/indexes/bwa-mem2-2.2.1+primary/${asm}.primary_assembly.fa.gz.bwt.2bit.64`, { parent_id: id, version: "2.2.1", size_human: "12.4 GB" }),
    row(`${id}:index:star-2.7.11b+gencode`, `${sci} ${asm} star 2.7.11b (gencode)`, "reference_index",
      `${base}/indexes/star-2.7.11b+gencode/SA`, { parent_id: id, version: "2.7.11b", size_human: "31.0 GB" }),
    row(`${id}:annotation:gencode_v44`, `${sci} ${asm} annotation gencode_v44`, "reference_annotation",
      `${base}/annotation/gencode_v44`, { parent_id: id, version: "gencode_v44", size_human: "1.6 GB", is_stale: true }),
  ];
}
const DATASETS = [
  ...assembly("homo_sapiens", "Homo sapiens", "GRCh38", "880 GB"),
  ...assembly("mus_musculus", "Mus musculus", "GRCm39", "240 GB"),
  { id: "cohort_panel_v3", name: "Cohort panel v3", category: "panel", type: "vcf", version: "v3", status: "ready", source: "upload",
    root_path: "/data/projects/northstar/cohort_panels/2026-q3/cohort_panel_v3.normalized.vcf.gz", size_human: "2.1 GB", size_bytes: 2100000000,
    tags: ["hg38"], last_updated_display: "2026-10-02", age_days: 43, is_stale: false },
];
const LIST = { updated_at: "2026-11-15T00:00:00Z", kpis: { dataset_count: 3, total_size_human: "1.1 TB", stale_count: 2 }, datasets: DATASETS };
let server, browser, origin;

before(async () => {
  await readFile(resolve(build, "index.html"));
  if (screenshots) await mkdir(screenshots, { recursive: true });
  server = createServer(async (req, res) => {
    if (serveRuntimeConfig(req, res)) return;
    const pathname = new URL(req.url, "http://localhost").pathname;
    let file = resolve(build, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(`${build}/`)) { res.writeHead(404).end(); return; }
    let data;
    try { data = await readFile(file); }
    catch { file = resolve(build, "index.html"); data = await readFile(file); }
    res.writeHead(200, { "Content-Type": ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" })[extname(file)] || "application/octet-stream" });
    res.end(data);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function open(width) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: "dark", serviceWorkers: "block" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await context.addInitScript(() => { localStorage.setItem("omnibioai_access_token", "FAKE-SCIENTIST-SESSION"); });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/auth/validate") return json(member);
    if (url.pathname === "/me") return json(identity);
    if (url.pathname === "/me/preferences") return json({ timezone: "UTC" });
    if (url.pathname === "/_svc/workbench/plugins/dataset_catalog/api/ui-schema/") return json(DESCRIPTOR);
    if (url.pathname === "/_svc/workbench/plugins/dataset_catalog/api/list/") return json(LIST);
    if (url.pathname.startsWith("/_svc/") || url.pathname.startsWith("/billing/") || url.pathname.startsWith("/_tes/")) return json({}, 503);
    if (url.pathname.startsWith("/studio") || url.pathname.startsWith("/assets/") || /\.(js|png|svg|ico|webmanifest)$/.test(url.pathname)) return route.continue();
    return json({}, 404);
  });
  await page.goto(`${origin}/studio/data`);
  await page.getByRole("row", { name: "Inspect Homo sapiens GRCh38" }).waitFor();
  return { context, page, errors };
}

async function capture(page, name, width) {
  if (!screenshots) return;
  const extraHeight = await page.locator(".dataset-catalog-page").evaluate(element => {
    let extra = 0;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowY === "auto") extra += Math.max(0, parent.scrollHeight - parent.clientHeight);
    }
    return extra;
  });
  await page.setViewportSize({ width, height: page.viewportSize().height + extraHeight + 24 });
  await page.screenshot({ path: resolve(screenshots, `${name}-${width}.png`), fullPage: true });
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
}

async function assertFits(page) {
  const [scroll, client] = await page.locator(".dataset-catalog-table-wrap").evaluate(el => [el.scrollWidth, el.clientWidth]);
  assert.ok(scroll <= client, `table overflows at 1440px: ${scroll} > ${client}`);
}

const bodyRows = page => page.locator(".dataset-catalog-table tbody tr");

for (const width of [1440, 390]) {
  test(`catalog at ${width}px: assembly rows, expand, show all, path cell`, async () => {
    const { context, page, errors } = await open(width);
    try {
      assert.equal(await bodyRows(page).count(), 3);
      assert.deepEqual((await page.locator(".dataset-catalog-kpis strong").allTextContents()), ["3", "1.1 TB", "2"]);
      await capture(page, "catalog-default", width);

      // Path: one line, middle-truncated, full path in the title; rows do not wrap it.
      const userPath = page.getByRole("row", { name: "Inspect Cohort panel v3" }).locator(".dataset-catalog-path code");
      const full = DATASETS.at(-1).root_path;
      assert.equal(await userPath.getAttribute("title"), full);
      const shown = await userPath.textContent();
      assert.ok(shown.includes("…") && full.endsWith(shown.split("…")[1]), shown);
      const lineHeight = await userPath.evaluate(el => [el.getBoundingClientRect().height, parseFloat(getComputedStyle(el).lineHeight) || 16]);
      assert.ok(lineHeight[0] <= lineHeight[1] * 1.5, `path wraps: ${lineHeight}`);
      assert.ok(await page.locator(".dataset-catalog-path-cell").first().evaluate(el => el.getBoundingClientRect().width >= 280));
      if (width === 1440) {
        await assertFits(page);
        const updated = page.getByRole("row", { name: "Inspect Cohort panel v3" }).locator(".dataset-catalog-nowrap strong").last();
        assert.equal(await updated.textContent(), "2026-10-02");
        assert.ok(await updated.evaluate(el => el.getClientRects().length === 1 && el.getBoundingClientRect().height < 24), "date wraps");
      }

      await page.getByRole("row", { name: "Inspect Cohort panel v3" }).getByRole("button", { name: "Copy path" }).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), full);
      assert.equal(await page.getByRole("dialog").count(), 0);

      await page.getByRole("button", { name: "Show 4 child rows of Homo sapiens GRCh38" }).click();
      assert.equal(await bodyRows(page).count(), 7);
      assert.equal(await page.locator("tr.is-child").count(), 4);
      assert.equal(await page.getByRole("dialog").count(), 0);
      if (width === 1440) await assertFits(page);
      await capture(page, "catalog-expanded", width);

      await page.getByRole("checkbox", { name: "Show all rows" }).check();
      assert.equal(await bodyRows(page).count(), DATASETS.length);
      assert.equal(await page.locator("tr.is-child").count(), 0);
      assert.deepEqual((await page.locator(".dataset-catalog-kpis strong").allTextContents()), ["3", "1.1 TB", "2"]);
      await capture(page, "catalog-show-all", width);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}
