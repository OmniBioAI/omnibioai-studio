// Run after:
//   npm run web:build                                   (in omnibioai-studio)
//   npm run build                                       (in omnibioai-dev-hub/omnibioai-dev-hub-ui)
// End-to-end regression for Ask OmniBioAI: Studio's EXTERNAL_NAV_SERVICES
// opens /_svc/devhub?view=chat (same mechanism Code/Workflows already use),
// and Dev Hub's own deep-link contract (its App.tsx reads ?view= once at
// mount) must land directly on the Ask OmniBioAI / chat page -- no second
// click inside Dev Hub required. Serves both apps' real built bundles
// (not stubs) side by side on one origin, same path-prefix split nginx
// itself uses in production (Dev Hub's own vite `base` is "/_svc/devhub",
// so its asset hrefs are already absolute under that prefix).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const { chromium } = createRequire(new URL("../../packages/omnibioai-ui/package.json", import.meta.url))("playwright");

const studioRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const studioBuild = resolve(studioRoot, "dist/web");
const devhubBuild = resolve(studioRoot, "../omnibioai-dev-hub/omnibioai-dev-hub-ui/dist");
const CONTENT_TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
let server, browser, origin;

async function serveFrom(buildDir, pathname, res) {
  const path = resolve(buildDir, `.${decodeURIComponent(pathname)}`);
  if (!path.startsWith(`${buildDir}/`) && path !== buildDir) { res.writeHead(404).end(); return; }
  let data, file = path;
  try { data = await readFile(file); }
  catch { file = resolve(buildDir, "index.html"); data = await readFile(file); }
  res.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(file)] || "application/octet-stream" });
  res.end(data);
}

before(async () => {
  await readFile(resolve(studioBuild, "index.html"));
  await readFile(resolve(devhubBuild, "index.html"));
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/_svc/devhub" || pathname.startsWith("/_svc/devhub/")) {
      // Dev Hub's own `base: "/_svc/devhub"` build emits asset hrefs
      // already prefixed with it, but the build output on disk is still
      // rooted at dist/ -- same prefix-stripping nginx's own rewrite does
      // before proxying to the dev-hub container.
      const stripped = pathname.slice("/_svc/devhub".length) || "/";
      return serveFrom(devhubBuild, stripped, res);
    }
    return serveFrom(studioBuild, pathname, res);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(r => server.close(r));
});

test("Ask OmniBioAI opens Dev Hub's real Ask OmniBioAI page directly, with no extra Dev Hub click, and returns to Studio", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  await context.addInitScript(() => localStorage.setItem("omnibioai_access_token", "TEST-ASK-DEVHUB"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { await route.abort(); return; }
    if (url.pathname === "/auth/validate") {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ valid: true, user_id: 5, email: "manish@omnibioai.org", roles: ["admin"], permissions: [] }),
      });
    }
    if (url.pathname.startsWith("/_svc/") && !url.pathname.startsWith("/_svc/devhub")) {
      return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    }
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
    assert.match(src, /\/_svc\/devhub\?view=chat$/, `iframe src is not Dev Hub's chat deep link: ${src}`);

    // The real Dev Hub bundle, inside that iframe, must show Ask OmniBioAI's
    // own chat content immediately -- no click on Dev Hub's own "Ask
    // OmniBioAI" nav item required.
    const devhubFrame = page.frameLocator("iframe");
    await devhubFrame.getByPlaceholder(/Ask OmniBioAI\.\.\./).waitFor();
    await devhubFrame.getByText(/Hello! I'm Ask OmniBioAI\./).waitFor();

    await page.getByRole("button", { name: "← Back to Studio" }).click();
    await page.getByText("studio", { exact: false }).first().waitFor();
    assert.equal(await page.locator("iframe").count(), 0, "Service iframe should be gone after returning to Studio");

    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
