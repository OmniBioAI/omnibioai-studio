import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveRuntimeConfig } from "../browser/runtime-config.mjs";
import { chromiumLaunchOptions } from "../browser/chromium-launch-options.mjs";

// Serves the production web build with fixture users; nothing here ships in
// dist/web. Set UI_QUALITY_SCREENSHOTS_DIR to keep the PR screenshots.
const requireFromUi = createRequire(new URL("../../packages/omnibioai-ui/package.json", import.meta.url));
const { chromium } = requireFromUi("playwright");
const axeSource = requireFromUi("axe-core").source;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const build = resolve(root, "dist/web");
const screenshotDir = process.env.UI_QUALITY_SCREENSHOTS_DIR;

const USERS = {
  admin: { permissions: ["platform.manage_infra", "manage_config", "manage_api_keys", "manage_org"], roles: ["admin"] },
  member: { permissions: [], roles: ["member"] },
};

let server;
let browser;
let origin;

before(async () => {
  await readFile(resolve(build, "index.html"));
  server = createServer(async (request, response) => {
    if (serveRuntimeConfig(request, response)) return;
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    let file = resolve(build, `.${pathname}`);
    if (!file.startsWith(`${build}/`)) return response.writeHead(404).end();
    let data;
    try { data = await readFile(file); }
    catch { file = resolve(build, "index.html"); data = await readFile(file); }
    const type = ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" })[extname(file)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type });
    response.end(data);
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(done => server.close(done));
});

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function fixtureRoute(route, user) {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== origin) return route.abort();
  const path = url.pathname;
  if (request.resourceType() === "document" || path.startsWith("/assets/") || /\.(?:js|css|png|svg|ico|webmanifest)$/.test(path)) return route.continue();
  if (path === "/auth/validate") {
    return json(route, { valid: true, user_id: 7, email: "quality@example.test", roles: user.roles, permissions: user.permissions, org_id: 42, org_role: [], schema_version: 2 });
  }
  if (path === "/me") {
    return json(route, {
      user: { id: 7, email: "quality@example.test", status: "active", created_at: "2025-04-12T00:00:00Z" },
      global_roles: user.roles.map(name => ({ name })), global_permissions: user.permissions,
      organizations: [{ organization_id: 42, organization_name: "Quality Lab", roles: [], effective_permissions: user.permissions }],
    });
  }
  if (path === "/me/preferences") return json(route, { timezone: "UTC", response_style: "balanced", technical_level: "general", preferred_language: null, personal_instructions: "" });
  if (path.endsWith("/subscription")) return json(route, { plan_name: "Research", status: "active" });
  if (path.endsWith("/api/storage/me/usage")) {
    return json(route, {
      owner_type: "USER", owner_id: "7", membership_plan: "plus", quota_mode: "audit", over_quota: false, enforcement_active: false,
      used_bytes: 3_200_000_000, reserved_bytes: 0, quota_bytes: 10_000_000_000, available_bytes: 6_800_000_000, entitlement_status: "fresh",
    });
  }
  if (path.includes("notifications/count")) return json(route, { unread_count: 0 });
  if (path.startsWith("/_svc/")) return json(route, {});
  return json(route, {});
}

async function openDirectory(role, width, theme = "dark") {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme, serviceWorkers: "block" });
  await context.addInitScript(selectedTheme => {
    localStorage.setItem("omnibioai_access_token", "QUALITY-SESSION");
    localStorage.setItem("omnibioai_appearance:7", JSON.stringify({ version: 1, mode: selectedTheme, accent: "teal", density: "comfortable", reducedMotion: "system" }));
  }, theme);
  const page = await context.newPage();
  await page.route("**/*", route => fixtureRoute(route, USERS[role]));
  await page.goto(`${origin}/studio/services`);
  await page.getByRole("heading", { level: 1, name: "All services" }).waitFor();
  await page.locator(".service-card__usage").waitFor();
  if (role === "admin") await page.locator(".service-card__health").waitFor();
  await page.waitForTimeout(100);
  return { context, page };
}

for (const role of ["admin", "member"]) {
  for (const width of [1440, 390]) {
    for (const theme of ["dark", "light"]) {
      test(`All services for ${role} at ${width}px in ${theme} mode`, async () => {
        const { context, page } = await openDirectory(role, width, theme);
        try {
          const groups = await page.locator(".service-group h2").allTextContents();
          assert.deepEqual(groups, role === "admin"
            ? ["Learn", "Your account", "Science and data", "OperationsAdmins only"]
            : ["Learn", "Your account", "Science and data"]);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert.ok(overflow <= 0, `horizontal scroll of ${overflow}px`);
          await page.addScriptTag({ content: axeSource });
          const violations = await page.evaluate(async () => (await window.axe.run(".all-services", {
            runOnly: { type: "rule", values: ["color-contrast", "label", "link-name", "nested-interactive"] },
          })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target.join(" ")) })));
          assert.deepEqual(violations, []);
          if (screenshotDir && theme === "dark") {
            await mkdir(screenshotDir, { recursive: true });
            // The shell scrolls inside its content pane, not the document;
            // grow the viewport by the hidden overflow so the whole page shows.
            const hidden = await page.locator(".all-services").evaluate(element => {
              let pane = element.parentElement;
              while (pane && pane.scrollHeight <= pane.clientHeight) pane = pane.parentElement;
              return pane ? pane.scrollHeight - pane.clientHeight : 0;
            });
            const viewport = page.viewportSize();
            await page.setViewportSize({ width: viewport.width, height: viewport.height + hidden });
            await page.screenshot({ path: join(screenshotDir, `all-services-${role}-${width}.png`), fullPage: true });
          }
        } finally {
          await context.close();
        }
      });
    }
  }
}
