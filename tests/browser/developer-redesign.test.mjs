// Build first: npm run web:build
// Capture review images: DEVELOPER_SCREENSHOT_DIR=docs/reviews/developer-page node --test tests/browser/developer-redesign.test.mjs
// All API responses are fixtures. No request reaches a backend or telemetry service.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const { chromium } = createRequire(new URL("../../packages/omnibioai-ui/package.json", import.meta.url))("playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const build = resolve(root, "dist/web");
const screenshots = process.env.DEVELOPER_SCREENSHOT_DIR && resolve(root, process.env.DEVELOPER_SCREENSHOT_DIR);
const FAKE_KEY = "omni_sk_live_7f3a" + "FAKE".repeat(9);
const member = {
  valid: true, user_id: 7, email: "developer@example.test", roles: ["scientist"],
  permissions: ["dataset.read"], org_id: 42, org_role: ["org_member"], team_id: null, team_role: null,
  auth_method: "password", idp_org_id: null, schema_version: 2,
};
const identity = {
  user: { id: 7, email: member.email, status: "active" }, global_roles: [], global_permissions: [],
  organizations: [{ organization_id: 42, organization_name: "Northstar Research", roles: ["org_member"], effective_permissions: ["dataset.read"] }],
};
const keyRows = [
  { id: 1, name: "notebook", key_prefix: "omni_sk_live_7f3a", scopes: ["literature:read"], status: "active", created_at: "2026-10-18T10:00:00", last_used_at: "2026-10-21T10:00:00", expires_at: "2027-10-18T10:00:00", test: false },
  { id: 2, name: "mcp-client", key_prefix: "omni_sk_live_8c2d", scopes: ["literature:read"], status: "active", created_at: "2026-10-18T10:00:00", last_used_at: null, expires_at: null, test: false },
  { id: 3, name: "old-script", key_prefix: "omni_sk_live_9b4e", scopes: ["literature:read"], status: "revoked", created_at: "2026-09-24T10:00:00", last_used_at: "2026-10-18T12:00:00", expires_at: null, test: false },
];
const usage = {
  plan_name: "Free", as_of: "2026-10-21T12:00:00Z",
  limits: [{ service: "api", action: "completed", resource: "literature.answer", unit: "answers", period: "monthly", included: 100, used: 0, remaining: 100, percentage_used: 0 }],
};
let server, browser, origin;

before(async () => {
  await readFile(resolve(build, "index.html"));
  if (screenshots) await mkdir(screenshots, { recursive: true });
  server = createServer(async (req, res) => {
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
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function openDeveloper({ width, empty = false, billingFailure = false }) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: "dark", serviceWorkers: "block" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await context.addInitScript(() => localStorage.setItem("omnibioai_access_token", "FAKE-DEVELOPER-SESSION"));
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-10-21T12:00:00Z"));
  const errors = [], outbound = [];
  let rows = empty ? [] : keyRows.map(row => ({ ...row }));
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    outbound.push(`${request.url()} ${request.postData() || ""}`);
    if (url.origin !== origin) return route.abort();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/auth/validate") return json(member);
    if (url.pathname === "/me") return json(identity);
    if (url.pathname === "/me/preferences") return json({ timezone: "UTC" });
    if (url.pathname === "/billing/organizations/42/subscription/usage-limits") return json(billingFailure ? { detail: "Forbidden" } : usage, billingFailure ? 403 : 200);
    if (url.pathname === "/me/api-keys") {
      if (request.method() === "POST") {
        const { name } = request.postDataJSON();
        const row = { ...keyRows[0], id: 4, name, created_at: "2026-10-21T12:00:00", last_used_at: null, expires_at: null };
        rows = [row, ...rows];
        return json({ id: row.id, name, key_prefix: row.key_prefix, scopes: row.scopes, expires_at: row.expires_at, test: false, key: FAKE_KEY }, 201);
      }
      return json(rows);
    }
    if (url.pathname.startsWith("/me/api-keys/") && request.method() === "DELETE") {
      const id = Number(url.pathname.split("/").at(-1));
      rows = rows.map(row => row.id === id ? { ...row, status: "revoked" } : row);
      return route.fulfill({ status: 204 });
    }
    if (url.pathname.startsWith("/_svc/") || url.pathname.startsWith("/billing/")) return json({}, 503);
    if (url.pathname === "/studio" || url.pathname.startsWith("/assets/") || /\.(js|png|svg|ico|webmanifest)$/.test(url.pathname)) return route.continue();
    return json({}, 404);
  });
  await page.goto(`${origin}/studio`);
  if (width === 390) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog", { name: "Navigation", exact: true });
    await drawer.locator('[data-nav-item="Developer"]').click();
    await drawer.waitFor({ state: "hidden" });
    await page.waitForTimeout(300); // allow the drawer's 250ms exit transition to finish before capture
  } else {
    await page.locator('.studio-sidebar-wrap [data-nav-item="Developer"]').click();
  }
  await page.getByRole("heading", { name: "API keys", exact: true }).waitFor();
  await page.getByText("in Northstar Research · usage is billed to this organization").waitFor();
  if (empty) await page.getByText("No API keys yet.").waitFor();
  else await page.getByRole("rowheader", { name: "notebook", exact: true }).waitFor();
  return { context, page, errors, outbound };
}

async function capture(page, name, width) {
  if (!screenshots) return;
  // The app scrolls inside its shell. Expand height (never width or styles) so
  // the full review image includes all cards, including below the phone fold.
  const extraHeight = await page.locator(".developer-page").evaluate(element => {
    let extra = 0;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowY === "auto") extra += Math.max(0, parent.scrollHeight - parent.clientHeight);
    }
    return extra;
  });
  await page.setViewportSize({ width, height: page.viewportSize().height + extraHeight + 24 });
  await page.locator(".developer-page").evaluate(element => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) parent.scrollTop = 0;
  });
  await page.screenshot({ path: resolve(screenshots, `${name}-${width}.png`), fullPage: true });
}

for (const width of [1440, 390]) {
  for (const state of ["keys", "empty", "new-key"]) {
    test(`${state} at ${width}px: responsive layout and review image`, async () => {
      const { context, page, errors, outbound } = await openDeveloper({ width, empty: state !== "keys" });
      try {
        if (state === "new-key") {
          await page.getByLabel("Key name", { exact: true }).fill("research-notebook");
          await page.getByRole("button", { name: "Create key", exact: true }).click();
          await page.getByTestId("new-key").waitFor();
          await page.getByText("New", { exact: true }).waitFor();
          assert.equal(await page.getByTestId("new-key").textContent(), FAKE_KEY);
          assert.equal(await page.getByRole("button", { name: "Done", exact: true }).isDisabled(), true);
          assert.equal(await page.getByText(FAKE_KEY, { exact: true }).count(), 1);
          assert.equal(await page.getByRole("tabpanel").textContent().then(text => text.includes(FAKE_KEY)), false);
        }
        const layout = await page.locator(".developer-page").evaluate(element => {
          window.scrollTo(9999, 0);
          const pageScrollX = window.scrollX;
          window.scrollTo(0, 0);
          const grid = element.querySelector(".developer-grid");
          const [left, right] = [...grid.children].map(child => child.getBoundingClientRect());
          const input = element.querySelector("#developer-key-name"), create = element.querySelector('[type="submit"]');
          const table = element.querySelector(".developer-table-scroll");
          return { left: { x: left.x, y: left.y, width: left.width }, right: { x: right.x, y: right.y, width: right.width },
            inputHeight: input.getBoundingClientRect().height, buttonHeight: create.getBoundingClientRect().height,
            pageWidth: document.documentElement.scrollWidth, pageScrollX, tableScrolls: table ? table.scrollWidth > table.clientWidth : null,
            tableOverflow: table ? getComputedStyle(table).overflowX : null,
            whiteSpace: getComputedStyle(element.querySelector(".developer-example")).whiteSpace };
        });
        assert.equal(layout.inputHeight, 44); assert.equal(layout.buttonHeight, 44);
        assert.equal(layout.whiteSpace, "pre"); assert.equal(layout.pageScrollX, 0, `Page must not scroll horizontally: ${JSON.stringify(layout)}`);
        if (width === 1440) {
          assert.ok(Math.abs(layout.left.y - layout.right.y) < 1, "Cards should have two columns");
          assert.ok(Math.abs(layout.left.width / layout.right.width - 1.5) < 0.05, "Columns should be about 60/40");
        } else {
          assert.ok(layout.right.y > layout.left.y, "Cards should stack on phones");
          if (state !== "empty") assert.equal(layout.tableScrolls, true);
        }
        await capture(page, state, width);
        if (state === "new-key") {
          await page.getByRole("button", { name: "Copy key", exact: true }).click();
          assert.equal(await page.evaluate(() => navigator.clipboard.readText()), FAKE_KEY);
          await page.getByRole("checkbox", { name: "I’ve saved this key somewhere safe" }).check();
          await page.getByRole("button", { name: "Done", exact: true }).click();
          assert.equal(await page.getByTestId("new-key").count(), 0);
          for (const tab of ["Python", "MCP", "cURL"]) {
            await page.getByRole("tab", { name: tab, exact: true }).click();
            assert.equal((await page.content()).includes(FAKE_KEY), false);
          }
          const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
          assert.equal(JSON.stringify(storage).includes(FAKE_KEY), false);
          assert.equal(storage.local.omnibioai_access_token, "FAKE-DEVELOPER-SESSION");
          assert.equal(JSON.stringify(storage.local).includes(FAKE_KEY), false);
          assert.equal(JSON.stringify(storage.session).includes(FAKE_KEY), false);
          await page.evaluate(() => window.dispatchEvent(new CustomEvent("navigate", { detail: 7 })));
          await page.evaluate(() => window.dispatchEvent(new CustomEvent("navigate", { detail: 14 })));
          await page.getByRole("heading", { name: "API keys", exact: true }).waitFor();
          assert.equal(await page.getByTestId("new-key").count(), 0);
        }
        assert.equal(outbound.some(request => request.includes(FAKE_KEY)), false, "Secret must not be sent to logs or telemetry");
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }
}

test("billing denial is silent; tabs and copy work in the built app", async () => {
  const { context, page, errors } = await openDeveloper({ width: 1440, billingFailure: true });
  try {
    assert.equal(await page.locator(".developer-usage").count(), 0);
    assert.equal(await page.locator(".developer-page").getByRole("alert").count(), 0);
    await page.getByRole("tab", { name: "cURL", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.getByRole("tab", { name: "Python", exact: true }).getAttribute("aria-selected"), "true");
    await page.getByRole("button", { name: "Copy Python example", exact: true }).click();
    assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes('os.environ["OMNIBIOAI_API_KEY"]'));
    await page.getByRole("button", { name: "Revoke key notebook", exact: true }).click();
    await page.getByRole("heading", { name: "Revoke ‘notebook’?", exact: true }).waitFor();
    await page.getByRole("button", { name: "Confirm revoke key notebook", exact: true }).click();
    await page.getByRole("button", { name: "Revoke key notebook", exact: true }).waitFor({ state: "detached" });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
