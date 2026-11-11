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

// Every card against the targets the flat list opened on main. Plain clicks must
// load the same document as main (admin cards also move the address bar to their
// agreed admin route path); modified clicks are left to the browser.
const THEMED = "?obai_theme=light&obai_accent=teal&obai_density=comfortable&obai_motion=system";
const CARD_TARGETS = [
  ["Getting started", { iframe: `/_svc/docs/user/getting-started/${THEMED}` }, "/_svc/docs/user/getting-started/"],
  ["Video tutorials", { iframe: "/_svc/videos/" }, "/_svc/videos"],
  ["Membership and storage", { path: "/studio/account/membership-storage" }, "/studio/account/membership-storage"],
  ["Billing", { path: "/studio/account/organization/billing" }, "/studio/account/organization/billing"],
  ["API keys", { path: "/studio/account/organization/api-keys" }, "/studio/account/organization/api-keys"],
  ["LIMS", { iframe: `/_svc/lims/${THEMED}` }, "/_svc/lims/"],
  ["Model registry", { iframe: `/_svc/modelregistry${THEMED}` }, "/_svc/modelregistry"],
  ["Dev Hub", { iframe: `/_svc/devhub${THEMED}` }, "/_svc/devhub"],
  ["Admin console", { tab: "https://admin.omnibioai.org/?obai_theme=dark" }, "https://admin.omnibioai.org/?obai_theme=dark"],
  ["Control center", { iframe: `/_svc/control/${THEMED}`, path: "/studio/admin/runtime/control-center" }, "/studio/admin/runtime/control-center"],
  ["Platform health", { iframe: `https://control.omnibioai.org/${THEMED}`, path: "/studio/admin/runtime/platform-health" }, "/studio/admin/runtime/platform-health"],
  ["Metrics", { iframe: "/_svc/monitor/d/omnibioai-services/omnibioai-services?kiosk=tv&refresh=30s&from=now-1h&to=now&theme=light", path: "/studio/admin/runtime/metrics" }, "/studio/admin/runtime/metrics"],
  ["Neo4j browser", { iframe: `/neo4j/browser/${THEMED}`, path: "/studio/admin/runtime/neo4j" }, "/studio/admin/runtime/neo4j"],
  ["Tool images", { iframe: `/_svc/toolimages${THEMED}`, path: "/studio/admin/runtime/tool-images" }, "/studio/admin/runtime/tool-images"],
];

async function clickCard(title, modifiers) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", serviceWorkers: "block" });
  await context.addInitScript(() => localStorage.setItem("omnibioai_access_token", "QUALITY-SESSION"));
  await context.route("**/*", route => fixtureRoute(route, USERS.admin));
  const page = await context.newPage();
  await page.goto(`${origin}/studio/services`);
  await page.getByRole("heading", { level: 1, name: "All services" }).waitFor();
  const documents = [];
  context.on("request", request => {
    if (request.resourceType() !== "document") return;
    let kind = "tab";
    try { kind = request.frame().parentFrame() ? "iframe" : "main"; } catch { /* a new tab's frame does not exist yet */ }
    documents.push({ kind, url: request.url().replace(origin, "") });
  });
  const link = page.getByRole("link", { name: new RegExp(`^${title}`) });
  const href = await link.getAttribute("href");
  await link.click({ modifiers });
  await page.waitForTimeout(500);
  const path = await page.evaluate(() => location.pathname);
  await context.close();
  return { href, path, documents };
}

// Modified clicks belong to the browser: Studio must leave the event's default
// action alone and must not navigate in-app. What the browser then does with the
// href (new tab, background tab, nothing) differs between Chromium builds, so it
// is deliberately not asserted.
const MODIFIED_CLICKS = [["Ctrl-click", { modifiers: ["Control"] }], ["Cmd-click", { modifiers: ["Meta"] }], ["middle-click", { button: "middle" }]];

async function modifiedClicks(title) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", serviceWorkers: "block" });
  await context.addInitScript(() => localStorage.setItem("omnibioai_access_token", "QUALITY-SESSION"));
  await context.route("**/*", route => fixtureRoute(route, USERS.admin));
  const page = await context.newPage();
  await page.goto(`${origin}/studio/services`);
  await page.getByRole("heading", { level: 1, name: "All services" }).waitFor();
  // Window bubble-phase listeners run after React's root listener, so they see
  // whether Studio called preventDefault() and whether it sent an in-app event.
  await page.evaluate(() => {
    window.__cardClicks = [];
    const record = event => window.__cardClicks.push({ type: event.type, defaultPrevented: event.defaultPrevented });
    for (const type of ["click", "auxclick", "navigate", "open-service"]) window.addEventListener(type, record);
    // Registered after `record`, so Studio's decision is captured first; then the
    // browser's own action is cancelled so every Chromium build behaves the same.
    for (const type of ["click", "auxclick"]) window.addEventListener(type, event => event.preventDefault());
  });
  const link = page.getByRole("link", { name: new RegExp(`^${title}`) });
  const results = [];
  for (const [label, options] of MODIFIED_CLICKS) {
    await page.evaluate(() => { window.__cardClicks.length = 0; });
    await link.click(options);
    results.push({
      label,
      tag: await link.evaluate(element => element.tagName),
      href: await link.getAttribute("href"),
      events: await page.evaluate(() => window.__cardClicks.slice()),
      path: await page.evaluate(() => location.pathname),
      embedded: await page.locator("iframe").count(),
    });
  }
  await context.close();
  return results;
}

for (const [title, plain, href] of CARD_TARGETS) {
  test(`${title} opens main's target on click and leaves modified clicks to the browser`, async () => {
    const clicked = await clickCard(title, []);
    assert.equal(clicked.href, href);
    const expected = [];
    if (plain.iframe) expected.push({ kind: "iframe", url: plain.iframe });
    if (plain.tab) expected.push({ kind: "tab", url: plain.tab });
    assert.deepEqual(clicked.documents, expected);
    assert.equal(clicked.path, plain.path || "/studio/services");

    for (const result of await modifiedClicks(title)) {
      assert.equal(result.tag, "A", result.label);
      assert.equal(result.href, href, result.label);
      const type = result.label === "middle-click" ? "auxclick" : "click";
      assert.deepEqual(result.events, [{ type, defaultPrevented: false }], result.label);
      assert.equal(result.path, "/studio/services", result.label);
      assert.equal(result.embedded, 0, result.label);
    }
  });
}
