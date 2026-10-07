// Run after npm run web:build. Regression test for Ask OmniBioAI opening
// the existing Dev Hub service (same EXTERNAL_NAV_SERVICES mechanism Code
// and Workflows already use) instead of sitting disabled with "Coming soon".
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const { chromium } = createRequire(new URL("../../packages/omnibioai-ui/package.json", import.meta.url))("playwright");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const build = resolve(root, "dist/web");
let server, browser, origin;

before(async () => {
  await readFile(resolve(build, "index.html"));
  server = createServer(async (req, res) => {
    const path = resolve(build, `.${decodeURIComponent(new URL(req.url, "http://localhost").pathname)}`);
    if (!path.startsWith(`${build}/`)) { res.writeHead(404).end(); return; }
    let data, file = path;
    try { data = await readFile(file); }
    catch { file = resolve(build, "index.html"); data = await readFile(file); }
    res.writeHead(200, { "Content-Type": ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css" })[extname(file)] || "application/octet-stream" });
    res.end(data);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(r => server.close(r));
});

test("Ask OmniBioAI opens the Dev Hub service and returns to Studio via the existing back control", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  await context.addInitScript(() => localStorage.setItem("omnibioai_access_token", "TEST-ASK-DEVHUB"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { await route.abort(); return; }
    if (url.pathname === "/auth/validate") {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ valid: true, user_id: 5, email: "manish@omnibioai.org", roles: ["admin"], permissions: [] }),
      });
    }
    // Stand-in for the real Dev Hub app -- this test only proves Studio
    // navigates to it, not Dev Hub's own page content.
    if (url.pathname === "/_svc/devhub" || url.pathname.startsWith("/_svc/devhub/")) {
      return route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>Dev Hub stub</body></html>" });
    }
    if (url.pathname.startsWith("/_svc/")) return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    return route.continue();
  });

  try {
    await page.goto(`${origin}/studio`);

    const ask = page.locator('.studio-sidebar-wrap [data-nav-item="Ask OmniBioAI"]');
    await ask.waitFor();
    assert.equal(await ask.getAttribute("aria-disabled"), null, "Ask OmniBioAI is still rendered as disabled");
    assert.equal(await page.getByText("Coming soon").count(), 0);

    await ask.click();

    const frame = page.locator("iframe");
    await frame.waitFor();
    const src = await frame.getAttribute("src");
    assert.match(src, /\/_svc\/devhub$/, `iframe src does not point at Dev Hub: ${src}`);

    await page.getByRole("button", { name: "← Back to Studio" }).click();
    await page.getByText("studio", { exact: false }).first().waitFor();
    assert.equal(await page.locator("iframe").count(), 0, "Service iframe should be gone after returning to Studio");

    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
