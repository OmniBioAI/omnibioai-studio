// Run after npm run web:build. Grafana itself is stubbed: this verifies the
// production Studio shell gives every Metrics iframe the resolved UI theme.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromiumLaunchOptions } from "./chromium-launch-options.mjs";

const { chromium } = createRequire(new URL("../../packages/omnibioai-ui/package.json", import.meta.url))("playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const build = resolve(root, "dist/web");
let server, browser, origin;

before(async () => {
  await readFile(resolve(build, "index.html"));
  server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (pathname.startsWith("/_svc/monitor/")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!doctype html><title>Grafana fixture</title>");
      return;
    }
    const path = resolve(build, `.${pathname}`);
    if (!path.startsWith(`${build}/`)) { res.writeHead(404).end(); return; }
    let data, file = path;
    try { data = await readFile(file); }
    catch { file = resolve(build, "index.html"); data = await readFile(file); }
    res.writeHead(200, { "Content-Type": ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" })[extname(file)] || "application/octet-stream" });
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

for (const theme of ["light", "dark"]) {
  test(`Metrics iframe uses Studio's ${theme} theme`, async () => {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.addInitScript(({ appearance }) => {
      localStorage.setItem("omnibioai_access_token", "TEST-GRAFANA-THEME");
      localStorage.setItem("omnibioai_appearance:anonymous", JSON.stringify(appearance));
      localStorage.setItem("omnibioai_appearance:7", JSON.stringify(appearance));
    }, { appearance: { version: 1, mode: theme, accent: "teal", density: "comfortable", reducedMotion: "system" } });
    const page = await context.newPage();
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/auth/validate") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ valid: true, user_id: 7, email: "grafana@example.test", roles: [], permissions: [] }),
        });
      }
      if (url.pathname === "/me") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: 7, email: "grafana@example.test" }, organizations: [] }) });
      }
      if (url.origin !== origin) return route.abort();
      return route.continue();
    });

    try {
      await page.goto(`${origin}/studio`);
      await page.getByRole("button", { name: "Metrics — Grafana dashboard" }).click();
      const src = await page.locator('iframe[title="Metrics"]').getAttribute("src");
      assert.equal(new URL(src, origin).searchParams.get("theme"), theme);
    } finally {
      await context.close();
    }
  });
}
