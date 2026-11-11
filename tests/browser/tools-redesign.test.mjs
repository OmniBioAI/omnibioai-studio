// Tools redesign: compact filter row with backend counts, clickable cards, the
// tool detail page (/studio/tools/:toolId) with a generated inputs form, Fill
// example, Run → Jobs, and the disabled state for an unavailable Slurm tool, plus
// the filter-aware empty states. Mocked TES. Set TOOLS_SCREENSHOT_DIR=<dir> to
// write review images at 1440 px and 390 px.
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
const screenshots = process.env.TOOLS_SCREENSHOT_DIR && resolve(root, process.env.TOOLS_SCREENSHOT_DIR);

const member = {
  valid: true, user_id: 7, email: "scientist@example.test", roles: ["scientist"],
  permissions: ["dataset.read", "workflow.execute"], org_id: 42, org_role: ["org_member"], team_id: null, team_role: null,
  auth_method: "password", idp_org_id: null, schema_version: 2,
};
const identity = {
  user: { id: 7, email: member.email, status: "active" }, global_roles: [], global_permissions: [],
  organizations: [{ organization_id: 42, organization_name: "Northstar Research", roles: ["org_member"], effective_permissions: ["dataset.read"] }],
};
const RUN = { tested_at: "2026-11-09", reason: null, run_id: "full_run_20261109" };
const SLURM_DOWN = "slurm_local: sinfo failed: DNS SRV lookup failed";
const SERVERS = [
  { server_id: "enrichment_remote", display_name: "HTTP ToolServer", adapter_type: "http_toolserver", storage_classification: "external", available: true, unavailable_reason: null },
  { server_id: "slurm_local", display_name: "Local Slurm (DGX)", adapter_type: "slurm", storage_classification: "scratch", available: false, unavailable_reason: "sinfo failed: DNS SRV lookup failed" },
];
const TOOLS = [
  { tool_id: "ensembl_gene_lookup", display_name: "Ensembl gene lookup", description: "Look up an Ensembl gene by symbol and species.", tags: ["annotation", "ensembl"],
    http: { method: "GET", url: "https://rest.ensembl.org/lookup/symbol/{species}/{symbol}" },
    inputs: [{ name: "symbol", type: "string", required: true, description: "Gene symbol e.g. BRCA2" }, { name: "species", type: "string", required: false, default: "homo_sapiens" }, { name: "expand", type: "boolean", required: false, description: "Include transcripts" }],
    response_map: { gene_id: "id", biotype: "biotype", display_name: "display_name" },
    verification: { status: "runnable", ...RUN } },
  { tool_id: "uniprot_entry_fetch", display_name: "UniProt entry", description: "Fetch a UniProt entry by accession.", tags: ["annotation"], http: { url: "https://rest.uniprot.org" },
    inputs: [{ name: "accession", type: "string", required: true }], verification: { status: "runnable", ...RUN } },
  { tool_id: "string_interaction_partners", display_name: "STRING partners", description: "Protein interaction partners from STRING.", tags: ["annotation"], http: { url: "https://string-db.org" },
    inputs: [{ name: "identifiers", type: "string", required: true }], verification: { status: "runnable", ...RUN } },
  { tool_id: "retired_gene_api", display_name: "Retired gene API", description: "Endpoint moved to an HTML landing page.", http: { url: "https://old.example.org" },
    inputs: [{ name: "gene", type: "string", required: true }], verification: { status: "not_working", ...RUN, reason: "upstream HTTP 404 not found" } },
  { tool_id: "fastqc", display_name: "FastQC", description: "Quality control report for FASTQ reads.", tags: ["qc", "sequencing", "slurm"],
    slurm: { image: "/sif/fastqc_arm64.sif", command: ["fastqc"], outputs: [{ name: "report_html", pattern: "*_fastqc.html" }, { name: "report_zip", pattern: "*_fastqc.zip" }], resources: { cpu: 4, ram_gb: 8 } },
    inputs_schema: { properties: { input_file: { type: "string", description: "Path to FASTQ file e.g. /data/sample.fastq.gz" }, threads: { type: "integer", default: 4 } }, required: ["input_file"] },
    outputs_schema: { type: "object" }, verification: { status: "unavailable", tested_at: null, reason: SLURM_DOWN, run_id: null } },
  { tool_id: "multiqc", display_name: "MultiQC", description: "Aggregate QC results into one report.", tags: ["qc", "slurm"], slurm: { image: "/sif/multiqc_arm64.sif", command: ["multiqc"] },
    inputs_schema: { properties: { input_dir: { type: "string" } }, required: ["input_dir"] }, verification: { status: "unavailable", tested_at: null, reason: SLURM_DOWN, run_id: null } },
  { tool_id: "ebi_blast_chain", display_name: "EBI BLAST chain", description: "BLAST job chain through EBI Job Dispatcher.", http: { url: "https://www.ebi.ac.uk" },
    inputs: [{ name: "sequence", type: "string", required: true }], verification: { status: "not_yet_tested", ...RUN, reason: "direct job cap reached" } },
];
const detailOf = id => {
  const tool = TOOLS.find(t => t.tool_id === id);
  if (!tool) return null;
  const servers = tool.http ? [SERVERS[0]] : [SERVERS[1]];
  return { ...tool, servers, example_available: id === "ensembl_gene_lookup" };
};
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

async function open(path, width) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: "dark", serviceWorkers: "block" });
  await context.addInitScript(() => { localStorage.setItem("omnibioai_access_token", "FAKE-SCIENTIST-SESSION"); });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  const submissions = [];
  const runs = [];
  await page.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/auth/validate") return json(member);
    if (url.pathname === "/me") return json(identity);
    if (url.pathname === "/me/preferences") return json({ timezone: "UTC" });
    if (url.pathname === "/_tes/api/tools") {
      const status = url.searchParams.get("status");
      return json(status ? TOOLS.filter(t => t.verification.status === status) : TOOLS);
    }
    if (url.pathname === "/_tes/api/servers") return json(SERVERS);
    const example = /^\/_tes\/api\/tools\/([a-z0-9_]+)\/example$/.exec(url.pathname);
    if (example) return example[1] === "ensembl_gene_lookup"
      ? json({ tool_id: example[1], inputs: { symbol: "BRCA2", species: "homo_sapiens", expand: true }, verified_at: "2026-11-09", run_id: "full_run_20261109", source: "verification" })
      : json({ detail: { code: "NO_EXAMPLE" } }, 404);
    const detail = /^\/_tes\/api\/tools\/([a-z0-9_]+)$/.exec(url.pathname);
    if (detail) { const body = detailOf(detail[1]); return body ? json(body) : json({ detail: "tool not found" }, 404); }
    if (url.pathname === "/_tes/api/runs/submit" && request.method() === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      submissions.push(body);
      runs.push({ run_id: "run-browser-1", tool_id: body.tool_id, server_id: "enrichment_remote", state: "QUEUED", created_epoch: 1793900000, updated_epoch: 1793900000, inputs: body.inputs });
      return json({ ok: true, run_id: "run-browser-1", server_id: "enrichment_remote", remote_run_id: null });
    }
    if (url.pathname === "/_tes/api/runs") return json(runs);
    if (url.pathname === "/_tes/api/runs/run-browser-1") return json(runs[0]);
    if (url.pathname === "/_tes/api/runs/run-browser-1/logs") return json({ run_id: "run-browser-1", logs: ["(submit in progress)"] });
    if (url.pathname.startsWith("/_svc/") || url.pathname.startsWith("/billing/") || url.pathname.startsWith("/_tes/")) return json({}, 503);
    if (url.pathname.startsWith("/studio") || url.pathname.startsWith("/assets/") || /\.(js|png|svg|ico|webmanifest)$/.test(url.pathname)) return route.continue();
    return json({}, 404);
  });
  await page.goto(`${origin}${path}`);
  return { context, page, errors, submissions };
}

async function capture(page, selector, name, width) {
  if (!screenshots) return;
  const extraHeight = await page.locator(selector).evaluate(element => {
    let extra = 0;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowY === "auto") extra += Math.max(0, parent.scrollHeight - parent.clientHeight);
    }
    return extra;
  });
  await page.setViewportSize({ width, height: page.viewportSize().height + extraHeight + 24 });
  await page.locator(selector).evaluate(element => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) parent.scrollTop = 0;
  });
  await page.screenshot({ path: resolve(screenshots, `${name}-${width}.png`), fullPage: true });
}

for (const width of [1440, 390]) {
  test(`tools list at ${width}px: backend strip, single filter row, dense cards, side panel`, async () => {
    const { context, page, errors } = await open("/studio/tools", width);
    try {
      await page.getByText("Showing 3 of 3 tools (3 runnable HTTP tools; 4 not working, not yet tested or unavailable hidden)").waitFor();
      assert.equal(await page.getByText("7 tools · 3 runnable HTTP tools").count(), 1);
      const strip = page.getByRole("list", { name: "Tools per backend" });
      const stats = (await strip.getByRole("listitem").allTextContents()).map(t => t.replace(/\s+/g, " ").trim());
      assert.deepEqual(stats, ["HTTP 5", "Slurm 2 unavailable", "AWS Batch 0", "Azure Batch 0", "GCP Batch 0", "Kubernetes 0", "Local 0"]);
      assert.equal(await page.getByRole("status", { name: "Tools shown" }).textContent(), "3 / 7");
      assert.equal(await page.getByRole("checkbox", { name: "Runnable only" }).isChecked(), true);
      assert.equal(await page.getByText("registered with TES").count(), 0);
      assert.equal(await page.getByText("live from").count(), 0);
      const card = page.getByRole("link", { name: "Ensembl gene lookup, runnable" });
      assert.equal(await card.getAttribute("href"), "/studio/tools/ensembl_gene_lookup");
      assert.equal(await card.locator(".tool-card__name").textContent(), "ensembl_gene_lookup");
      assert.equal(await card.locator(".backend-badge--http").textContent(), "HTTP");
      assert.equal(await card.locator(".tool-card__badge").textContent(), "Runnable");
      assert.equal(await card.locator(".tool-card__chevron").count(), 1);
      if (width === 1440) {
        const columns = await page.locator(".tools-docs__grid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
        assert.equal(columns, 5, `expected 5 columns at 1440px, got ${columns}`);
      }
      const side = page.getByRole("complementary", { name: "Runs and backends" });
      assert.equal(await side.getByRole("link", { name: /^All/ }).textContent(), "All0");
      assert.equal(await side.getByRole("link", { name: /^Running/ }).getAttribute("href"), "/studio/jobs?state=running");
      assert.match(await side.getByText("Local Slurm (DGX)").locator("..").textContent(), /unavailable/);
      assert.match(await side.getByText("HTTP ToolServer").locator("..").textContent(), /online/);
      assert.equal(await side.getByRole("button", { name: "+ Submit Run" }).count(), 1);
      await capture(page, ".tools-page", "tools-list", width);

      await page.getByRole("checkbox", { name: "Runnable only" }).uncheck();
      await page.getByText("Showing 7 of 7 tools (3 runnable HTTP tools)").waitFor();
      assert.equal(await page.getByRole("status", { name: "Tools shown" }).textContent(), "7 / 7");
      const unavailable = page.locator(".tool-card__badge--unavailable");
      assert.equal(await unavailable.count(), 2);
      assert.equal(await unavailable.first().getAttribute("title"), `No backend can run this tool right now: ${SLURM_DOWN}`);
      await capture(page, ".tools-page", "tools-list-show-all", width);

      await side.getByRole("button", { name: "+ Submit Run" }).click();
      await page.waitForFunction(() => `${location.pathname}${location.search}` === "/studio/jobs?submit=1");
      await page.getByRole("button", { name: "Submit", exact: true }).waitFor();
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test(`tools list at ${width}px: empty state explains that the Slurm backend is down`, async () => {
    const { context, page, errors } = await open("/studio/tools", width);
    try {
      await page.getByText(/Showing 3 of 3 tools/).waitFor();
      await page.getByRole("group", { name: "Runs on" }).getByRole("button", { name: "Slurm" }).click();
      await page.getByText("No runnable Slurm tools yet: the Slurm backend isn't available.").waitFor();
      await page.getByText("Show all to browse them.").waitFor();
      await capture(page, ".tools-page", "tools-empty-slurm", width);
      await page.locator(".tools-empty").getByRole("button", { name: "Show all" }).click();
      await page.getByRole("link", { name: "FastQC, unavailable" }).waitFor();
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test(`tool detail at ${width}px: runnable HTTP tool, Fill example, Run lands in Jobs`, async () => {
    const { context, page, errors, submissions } = await open("/studio/tools/ensembl_gene_lookup", width);
    try {
      await page.getByRole("heading", { level: 2, name: "Ensembl gene lookup" }).waitFor();
      assert.equal(await page.getByText("Look up an Ensembl gene by symbol and species.").count(), 1);
      assert.equal(await page.getByLabel(/^species/).inputValue(), "homo_sapiens");
      assert.equal(await page.getByText("HTTP · HTTP ToolServer").count(), 1);
      assert.equal(await page.getByText("Tested end to end on 2026-11-09 (run full_run_20261109)").count(), 1);
      assert.equal(await page.getByText("gene_id").count(), 1);
      const curl = await page.locator(".tool-detail__curl").textContent();
      assert.match(curl, /Bearer \$OMNIBIOAI_TOKEN/);
      assert.doesNotMatch(curl, /FAKE-SCIENTIST-SESSION/);
      assert.equal(await page.getByRole("button", { name: "Run" }).isEnabled(), true);
      await page.getByRole("button", { name: "Fill example" }).click();
      await page.getByText("Filled with the inputs that passed end to end on 2026-11-09.").waitFor();
      assert.equal(await page.getByLabel(/^symbol/).inputValue(), "BRCA2");
      assert.equal(await page.getByLabel(/^expand/).isChecked(), true);
      await capture(page, ".tools-page", "tool-detail-http-runnable", width);

      await page.getByRole("button", { name: "Run" }).click();
      // pushState navigation: no load event, so wait on the location itself.
      await page.waitForFunction(() => `${location.pathname}${location.search}` === "/studio/jobs?run=run-browser-1");
      assert.deepEqual(submissions, [{ tool_id: "ensembl_gene_lookup", inputs: { symbol: "BRCA2", species: "homo_sapiens", expand: true } }]);
      await page.getByText("Run Detail").waitFor();          // Jobs opened the linked run
      await page.getByText("ensembl_gene_lookup").first().waitFor();
      await capture(page, ".jobs-main-grid", "jobs-after-run", width);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test(`tool detail at ${width}px: unavailable Slurm tool shows the reason and a disabled Run`, async () => {
    const { context, page, errors } = await open("/studio/tools/fastqc", width);
    try {
      await page.getByRole("heading", { level: 2, name: "FastQC" }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Run" }).isDisabled(), true);
      assert.match(await page.locator(".tool-detail__blocker").textContent(), new RegExp(`Unavailable\\. ${SLURM_DOWN}`));
      assert.equal(await page.getByText("Slurm · Local Slurm (DGX)").count(), 1);
      assert.equal(await page.getByText("Unavailable: sinfo failed: DNS SRV lookup failed").count(), 1);
      assert.equal(await page.getByLabel(/^threads/).inputValue(), "4");
      assert.equal(await page.getByText("report_html").count(), 1);
      assert.equal(await page.getByRole("button", { name: "Fill example" }).count(), 0);
      await capture(page, ".tools-page", "tool-detail-slurm-unavailable", width);
      await page.getByRole("button", { name: "← All tools" }).click();
      await page.waitForFunction(() => location.pathname === "/studio/tools");
      await page.getByText(/Showing 3 of 3 tools/).waitFor();
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}
