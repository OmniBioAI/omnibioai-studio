// Optional isolated browser smoke: node tests/workbench-preview-smoke.mjs
// Uses installed Vite/Playwright/Python dependencies; no production services.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

const studio = fileURLToPath(new URL("..", import.meta.url));
const workbench = process.env.WORKBENCH_SOURCE || path.resolve(studio, "../omnibioai-workbench");
const python = String.raw`
import sys
from pathlib import Path
from django.conf import settings
settings.configure(
    SECRET_KEY="isolated-browser-test-only", DEBUG=True, ALLOWED_HOSTS=["*"],
    BASE_DIR=Path.cwd(), ROOT_URLCONF=__name__, STATIC_URL="/static/",
    INSTALLED_APPS=["django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions"],
    DATABASES={"default":{"ENGINE":"django.db.backends.sqlite3","NAME":":memory:"}},
    TEMPLATES=[{"BACKEND":"django.template.backends.django.DjangoTemplates",
        "DIRS":[str(Path.cwd()/"plugins/home/templates")], "APP_DIRS":True,
        "OPTIONS":{"context_processors":["django.template.context_processors.request"]}}],
)
import django
django.setup()
from django.urls import path, include
from django.http import HttpResponse
from django.core.wsgi import get_wsgi_application
from wsgiref.simple_server import make_server, WSGIRequestHandler
from plugins.home.urls import urlpatterns as home_urls
# Named destinations are needed by the real presentation helper. Execution is
# deliberately unavailable: this harness tests catalog/navigation, not jobs.
def unavailable(request): return HttpResponse(status=501)
urlpatterns=[path("",include((home_urls,"home"))),
    path("ops/",include(([path("",unavailable,name="index")],"ops_dashboard"))),
    path("plugins/dataset_catalog/",include(([path("",unavailable,name="index")],"dataset_catalog")))]
class Quiet(WSGIRequestHandler):
    def log_message(self,*args): pass
server=make_server("127.0.0.1",0,get_wsgi_application(),handler_class=Quiet)
print(server.server_port,flush=True)
server.serve_forever()
`;
const backend = spawn(process.env.PYTHON || "python3", ["-B", "-u", "-c", python], {
  cwd: workbench, stdio: ["ignore", "pipe", "pipe"],
});
let backendErrors = "";
backend.stderr.on("data", chunk => { backendErrors += chunk.toString(); });
let vite, browser;
try {
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Isolated Django startup timed out")), 15000);
    backend.once("error", error => { clearTimeout(timer); reject(error); });
    backend.once("exit", code => { clearTimeout(timer); reject(new Error(`Isolated Django exited ${code}: ${backendErrors}`)); });
    backend.stdout.once("data", chunk => { clearTimeout(timer); resolve(Number(chunk.toString().trim())); });
  });
  assert(Number.isInteger(port) && port > 0);
  vite = await createServer({
    root: studio, configFile: path.join(studio, "vite.config.js"), mode: "web",
    server: { host: "127.0.0.1", port: 5188, strictPort: true, open: false,
      proxy: { "/_svc/workbench": { target: `http://127.0.0.1:${port}`, changeOrigin: true,
        rewrite: value => value.replace(/^\/_svc\/workbench/, "") || "/" } } },
  });
  await vite.listen();
  const origin = "http://127.0.0.1:5188";
  const api = await fetch(`${origin}/_svc/workbench/home/catalog/`);
  assert.equal(api.status, 200);
  const catalog = await api.json();
  const legacy = await fetch(`${origin}/_svc/workbench/`).then(response => response.text());
  const cards = [...legacy.matchAll(/class="app-tile app-card"/g)].length;
  assert.equal(catalog.total_count, cards);
  assert.equal(catalog.total_count, catalog.categories.reduce((sum, category) => sum + category.count, 0));
  assert.equal((await fetch(`${origin}/_svc/workbench/home/catalog/`, { method: "POST" })).status, 405);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("omnibioai_access_token", "isolated-browser-fixture"));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    // Never let this browser test contact IAM, third-party telemetry, or an
    // existing backend from the production-like Vite proxy table.
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/auth/validate") return route.fulfill({ json: {
      valid: true, user_id: "test", email: "preview@example.test", roles: [], permissions: [],
    } });
    if (url.pathname === "/_svc/workbench/ops/") return route.fulfill({
      contentType: "text/html", body: "<p>Legacy application navigation fixture</p>",
    });
    if (url.pathname.startsWith("/_svc/") && !["/_svc/workbench/home/catalog/", "/_svc/workbench/health/"].includes(url.pathname)) return route.abort();
    if (["/auth/", "/api/", "/billing", "/plugins/", "/ops/", "/_tes/"].some(prefix => url.pathname.startsWith(prefix))) return route.abort();
    return route.continue();
  });
  await page.goto(`${origin}/studio`);
  await page.getByRole("button", { name: "Workbench — Application catalog", exact: true }).click();
  await page.getByRole("button", { name: "Open System Health", exact: true }).waitFor();
  assert.equal(await page.locator(".native-workbench-card").count(), cards);
  await page.screenshot({ path: "/tmp/workbench-preview-desktop.png" });
  await page.getByRole("button", { name: /^Dashboard \d+$/ }).click();
  const search = page.getByRole("textbox", { name: "Search applications", exact: true });
  await search.fill("System Health");
  assert.equal(await page.locator(".native-workbench-card").count(), 1);
  await page.getByRole("button", { name: "Open System Health", exact: true }).press("Enter");
  await page.getByTitle("System Health", { exact: true }).waitFor();
  assert.equal(await page.getByTitle("System Health", { exact: true }).getAttribute("src"), "/_svc/workbench/ops/");
  await page.getByRole("button", { name: "← Back to Workbench", exact: true }).click();
  await page.getByRole("button", { name: "Open System Health", exact: true }).waitFor();
  assert.equal(await search.inputValue(), "System Health");
  await search.press("Escape");
  assert.equal(await page.getByRole("button", { name: /^Dashboard \d+$/ }).getAttribute("aria-pressed"), "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^All \d+$/ }).click();
  await page.getByRole("heading", { name: "Workbench", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/workbench-preview-mobile.png" });
  await page.locator(".native-workbench-card").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/workbench-preview-mobile-cards.png" });
  const layout = await page.evaluate(() => ({
    viewport: innerWidth, document: document.documentElement.scrollWidth,
    catalog: document.querySelector(".native-workbench").getBoundingClientRect().width,
    columns: getComputedStyle(document.querySelector(".native-workbench-grid")).gridTemplateColumns,
  }));
  assert(layout.document <= layout.viewport, JSON.stringify(layout));
  assert.equal(layout.columns.split(" ").length, 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "PASS", catalogCards: cards, legacyParity: true,
    proxy: "real Vite proxy to isolated Django", navigation: "ServiceViewer and return",
    mobile: layout, screenshots: ["/tmp/workbench-preview-desktop.png", "/tmp/workbench-preview-mobile.png", "/tmp/workbench-preview-mobile-cards.png"] }, null, 2));
} finally {
  if (browser) await browser.close();
  if (vite) await vite.close();
  if (backend.exitCode === null) { backend.kill("SIGTERM"); await once(backend, "exit"); }
}
