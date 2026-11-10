// Tools page: "Runnable" badges, runnable-only default, "Show all" toggle, and
// the home-page runnable count, against a mocked TES. Set
// TOOLS_SCREENSHOT_DIR=<dir> to write review images (default view, show-all,
// home) at 1440 px and 390 px.
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
  permissions: ["dataset.read"], org_id: 42, org_role: ["org_member"], team_id: null, team_role: null,
  auth_method: "password", idp_org_id: null, schema_version: 2,
};
const identity = {
  user: { id: 7, email: member.email, status: "active" }, global_roles: [], global_permissions: [],
  organizations: [{ organization_id: 42, organization_name: "Northstar Research", roles: ["org_member"], effective_permissions: ["dataset.read"] }],
};
const RUN = { run_id: "full_run_20261109" };
const TOOLS = [
  { tool_id: "ensembl_gene_lookup", description: "Look up an Ensembl gene by symbol", tags: ["annotation"], http: { url: "https://rest.ensembl.org" },
    verification: { status: "runnable", tested_at: "2026-11-09", reason: null, ...RUN } },
  { tool_id: "uniprot_entry_fetch", description: "Fetch a UniProt entry", tags: ["annotation"], http: { url: "https://rest.uniprot.org" },
    verification: { status: "runnable", tested_at: "2026-11-09", reason: null, ...RUN } },
  { tool_id: "string_interaction_partners", description: "Protein interaction partners from STRING", http: { url: "https://string-db.org" },
    verification: { status: "runnable", tested_at: "2026-11-09", reason: null, ...RUN } },
  { tool_id: "retired_gene_api", description: "Endpoint moved to an HTML landing page", http: { url: "https://old.example.org" },
    verification: { status: "not_working", tested_at: "2026-11-09", reason: "upstream HTTP 404 not found", ...RUN } },
  { tool_id: "fastqc", description: "Read quality control", tags: ["qc"], slurm: { image: "/sif/fastqc.sif" },
    verification: { status: "out_of_scope", tested_at: null, reason: "end-to-end verification covers HTTP tools only", run_id: null } },
  { tool_id: "ebi_blast_chain", description: "BLAST job chain through EBI Job Dispatcher", http: { url: "https://www.ebi.ac.uk" },
    verification: { status: "not_yet_tested", tested_at: "2026-11-09", reason: "direct job cap reached", ...RUN } },
];
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
  const requested = [];
  await page.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/auth/validate") return json(member);
    if (url.pathname === "/me") return json(identity);
    if (url.pathname === "/me/preferences") return json({ timezone: "UTC" });
    if (url.pathname === "/_tes/api/tools") {
      requested.push(url.pathname + url.search);
      const status = url.searchParams.get("status");
      return json(status ? TOOLS.filter(t => t.verification.status === status) : TOOLS);
    }
    if (url.pathname === "/_tes/api/runs") return json([]);
    if (url.pathname.startsWith("/_svc/") || url.pathname.startsWith("/billing/") || url.pathname.startsWith("/_tes/")) return json({}, 503);
    if (url.pathname.startsWith("/studio") || url.pathname.startsWith("/assets/") || /\.(js|png|svg|ico|webmanifest)$/.test(url.pathname)) return route.continue();
    return json({}, 404);
  });
  await page.goto(`${origin}${path}`);
  return { context, page, errors, requested };
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
  test(`tools page at ${width}px: runnable by default, badges, show all`, async () => {
    const { context, page, errors } = await open("/studio/tools", width);
    try {
      await page.getByText("Showing 4 of 4 tools (3 runnable HTTP tools; 2 not working or not yet tested hidden)").waitFor();
      const badges = page.locator(".tool-card__badge");
      assert.equal(await badges.count(), 3);
      assert.deepEqual(await badges.allTextContents(), ["Runnable", "Runnable", "Runnable"]);
      assert.equal(await badges.first().getAttribute("title"), "Tested end to end on 2026-11-09");
      assert.equal(await page.getByRole("button", { name: "Runnable only" }).getAttribute("aria-pressed"), "true");
      assert.equal(await page.getByText("retired gene api").count(), 0);
      const fastqcCard = page.locator(".tool-card", { hasText: "fastqc" });
      assert.equal(await fastqcCard.count(), 1, "Slurm tool is listed by default");
      assert.equal(await fastqcCard.locator(".tool-card__badge").count(), 0, "Slurm tool carries no badge");
      await capture(page, ".tools-page", "tools-runnable", width);

      await page.getByRole("button", { name: "Show all" }).click();
      await page.getByText("Showing 6 of 6 tools (3 runnable HTTP tools)").waitFor();
      const labels = await page.locator(".tool-card__badge").allTextContents();
      assert.deepEqual([...labels].sort(), ["Not working", "Not yet tested", "Runnable", "Runnable", "Runnable"]);
      const broken = page.locator(".tool-card", { hasText: "retired gene api" }).locator(".tool-card__badge");
      assert.equal(await broken.textContent(), "Not working");
      assert.equal(await broken.getAttribute("title"), "Failed end to end on 2026-11-09: upstream HTTP 404 not found");
      await capture(page, ".tools-page", "tools-show-all", width);

      await page.getByRole("button", { name: "Runnable only" }).click();
      await page.getByText(/Showing 4 of 4 tools/).waitFor();
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test(`home at ${width}px: counts runnable tools only`, async () => {
    const { context, page, errors, requested } = await open("/studio", width);
    try {
      await page.getByText("3 runnable HTTP tools").waitFor();
      assert.ok(requested.includes("/_tes/api/tools?status=runnable"), `requested: ${requested.join(", ")}`);
      await capture(page, ".studio-home", "home-runnable-count", width);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}
