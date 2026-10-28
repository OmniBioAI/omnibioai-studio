// Run after npm run web:build. Proves OAuth callback navigations bypass the
// generated Workbox navigation fallback and reach the router with their query.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromiumLaunchOptions } from "./chromium-launch-options.mjs";

const { chromium } = createRequire(new URL("../../packages/omnibioai-ui/package.json", import.meta.url))("playwright");
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const build = resolve(root, "dist/web");
const callbackPath = "/auth/google/callback?code=x&state=y";
const callbackRequests = [];
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
let server, browser, origin;

before(async () => {
  await readFile(resolve(build, "index.html"));
  const worker = await readFile(resolve(build, "sw.js"), "utf8");
  assert.match(worker, /omnibioai-studio-web-v2/, "the worker cache version must be bumped");
  server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/auth/google/callback") {
      callbackRequests.push(req.url);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!doctype html><title>Network callback</title><p>AUTH_CALLBACK_NETWORK</p>");
      return;
    }
    const path = resolve(build, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(`${build}/`)) { res.writeHead(404).end(); return; }
    let file = path, data;
    try { data = await readFile(file); }
    catch { file = resolve(build, "index.html"); data = await readFile(file); }
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
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

test("OAuth callback navigation bypasses the service worker and preserves its query", async () => {
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/studio`);
    await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/");
      return registration?.active?.state === "activated";
    });
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    const response = await page.goto(`${origin}${callbackPath}`);
    assert.equal(response.status(), 200);
    assert.match(await page.locator("body").innerText(), /AUTH_CALLBACK_NETWORK/);
    assert.ok(callbackRequests.includes(callbackPath), `router did not receive the original query; received: ${callbackRequests.join(", ")}`);
    assert.equal(new URL(page.url()).search, "?code=x&state=y");
  } finally {
    await context.close();
  }
});
