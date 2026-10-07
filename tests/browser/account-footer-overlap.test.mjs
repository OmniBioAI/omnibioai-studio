// Run after npm run web:build. Regression test for the global "Report Bug"
// button visually covering the Sidebar's Account footer at the viewport's
// bottom-left corner (both used to be fixed/positioned there at once).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
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
    res.writeHead(200, { "Content-Type": ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" })[extname(file)] || "application/octet-stream" });
    res.end(data);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

test("Report Bug control no longer overlaps the Account footer at a desktop viewport", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  await context.addInitScript(() => localStorage.setItem("omnibioai_access_token", "TEST-ACCOUNT-FOOTER"));
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
    if (url.pathname.startsWith("/_svc/")) return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    return route.continue();
  });

  try {
    await page.goto(`${origin}/studio`);

    // currentUser must actually be non-null for this assertion to mean
    // anything -- the Account footer itself is proof of that (its render
    // condition is `{currentUser && ...}`, see Sidebar.jsx).
    const accountTrigger = page.getByRole("button", { name: "Account menu" });
    await accountTrigger.waitFor();

    const reportBug = page.getByRole("button", { name: /Report Bug/ });
    await reportBug.waitFor();

    const footerBox = await page.locator(".studio-account-footer").boundingBox();
    const bugBox = await reportBug.boundingBox();
    assert.ok(footerBox, "Account footer did not render");
    assert.ok(bugBox, "Report Bug control did not render");

    const intersects =
      footerBox.x < bugBox.x + bugBox.width &&
      footerBox.x + footerBox.width > bugBox.x &&
      footerBox.y < bugBox.y + bugBox.height &&
      footerBox.y + footerBox.height > bugBox.y;
    assert.equal(intersects, false, `Report Bug overlaps the Account footer: ${JSON.stringify({ footerBox, bugBox })}`);

    // The fix moves it to the right edge -- assert it's clearly out of the
    // Sidebar's own left-hand column (200px wide), not just technically
    // non-overlapping by a pixel.
    assert.ok(bugBox.x > 200, `Report Bug is still inside the Sidebar's column: x=${bugBox.x}`);

    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
