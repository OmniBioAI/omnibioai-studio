import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const requireFromUi = createRequire(new URL("../../packages/omnibioai-ui/package.json", import.meta.url));
const { chromium } = requireFromUi("playwright");
const axeSource = requireFromUi("axe-core").source;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const build = resolve(root, "dist/web");

const ACCOUNT_PAGES = [
  ["Profile", "/studio/account/profile"],
  ["Security", "/studio/account/security"],
  ["Preferences", "/studio/account/preferences"],
  ["Privacy & data", "/studio/account/privacy-data"],
  ["Membership & storage", "/studio/account/membership-storage"],
  ["Billing", "/studio/account/organization/billing"],
  ["Usage", "/studio/account/organization/usage"],
  ["API keys", "/studio/account/organization/api-keys"],
  ["Members & roles", "/studio/account/organization/members-roles"],
  ["Help & support", "/studio/account/help"],
];

// An expected failure still runs. It fails this suite if the check starts
// passing, forcing the fixing PR to remove the issue ID instead of leaving a
// permanent skip behind.
const EXPECTED_FAILURES = {
  // Populated only with findings reproduced by this suite. Keep issue IDs
  // beside the narrowest page/check combination that demonstrates them.
  ...Object.fromEntries(ACCOUNT_PAGES.flatMap(([pageName]) => [1440, 390].map(width => [`${pageName}|${width}|axe`, "N8"]))),
  ...Object.fromEntries(ACCOUNT_PAGES.flatMap(([pageName]) => [1440, 390].map(width => [`${pageName}|${width}|targets`, "#8"]))),
  ...Object.fromEntries(ACCOUNT_PAGES.flatMap(([pageName]) => [1440, 390].map(width => [`${pageName}|${width}|focus`, "#2"]))),
};

const member = {
  valid: true, user_id: 7, email: "quality@example.test", roles: ["admin"],
  permissions: ["manage_roles", "manage_billing"], org_id: 42,
  org_role: ["org_admin"], schema_version: 2,
};
const identity = {
  user: { id: 7, email: member.email, status: "active", created_at: "2025-04-12T00:00:00Z" },
  global_roles: [{ name: "admin" }], global_permissions: ["manage_roles"],
  organizations: [{ organization_id: 42, organization_name: "Quality Lab", roles: ["org_admin"], effective_permissions: ["manage_roles", "manage_billing"] }],
};

let server;
let browser;
let origin;

before(async () => {
  await readFile(resolve(build, "index.html"));
  server = createServer(async (request, response) => {
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
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(done => server.close(done));
});

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function fixtureRoute(route, counters) {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== origin) return route.abort();
  const path = url.pathname;
  if (request.resourceType() === "document" || path.startsWith("/assets/") || /\.(?:js|css|png|svg|ico|webmanifest)$/.test(path)) return route.continue();
  if (path === "/auth/validate") return json(route, member);
  if (path === "/me") return json(route, identity);
  if (path === "/me/preferences") return json(route, { timezone: "UTC", response_style: "balanced", technical_level: "general", preferred_language: null, personal_instructions: "" });
  if (path === "/users/me/mfa/devices" && request.method() === "GET") return json(route, []);
  if (path === "/users/me/mfa/totp/enroll") {
    counters.enroll += 1;
    return json(route, { device_id: 91, otpauth_uri: "otpauth://totp/Quality?secret=QUALITYFIXTURE&algorithm=SHA1&digits=6&period=30" });
  }
  if (path === "/sessions") return json(route, []);
  if (path === "/me/api-keys") {
    if (request.method() === "POST") counters.createKey += 1;
    return json(route, request.method() === "POST" ? { id: 3, name: "quality", key_prefix: "omni_sk_test", key: "TEST-ONLY-KEY", status: "active" } : [], request.method() === "POST" ? 201 : 200);
  }
  if (path === "/roles") return json(route, []);
  if (path === "/billing/me/membership") return json(route, { plan: "free", status: "active" });
  if (path === "/billing/me/entitlements") return json(route, { features: [] });
  if (path.endsWith("/subscription")) return json(route, { plan_name: "Research", status: "active", billing_interval: "monthly", currency: "usd", start_date: "2026-01-01", renewal_date: "2027-01-01", features: [] });
  if (path.endsWith("/subscription/usage-limits")) return json(route, { plan_name: "Research", limits: [] });
  if (path.endsWith("/payment-method")) return json(route, { stripe_enabled: true, can_manage: true, has_payment_method: false, card: null });
  if (path.endsWith("/summary")) return json(route, { current_period: null, current_usage_cost: 0, currency: "usd", invoice_count: 0, outstanding_amount: 0 });
  if (path.endsWith("/invoices")) return json(route, { invoices: [], total_count: 0 });
  if (path.endsWith("/usage")) return json(route, { services: [], period_start: "2026-10-01", period_end: "2026-10-31" });
  if (path.endsWith("/cost-history")) return json(route, { history: [], currency: "usd" });
  if (path.endsWith("/cost-breakdown")) return json(route, { breakdown: {}, currency: "usd" });
  if (path.includes("notifications/metadata")) return json(route, { categories: [], severities: [] });
  if (path.includes("notifications/preferences")) return json(route, { email_enabled: false, in_app_enabled: true, categories: {} });
  if (path.includes("notifications/count")) return json(route, { unread_count: 0 });
  if (path.includes("notifications/notifications")) return json(route, { results: [], count: 0 });
  if (path.includes("/storage/")) return json(route, { used_bytes: 0, reserved_bytes: 0, quota_bytes: 1_000_000_000, membership: "free", quota_mode: "audit" });
  if (path.startsWith("/_svc/")) return json(route, {}, 503);
  return json(route, {});
}

async function openAccountPage(path, width) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: "dark", serviceWorkers: "block" });
  await context.addInitScript(() => localStorage.setItem("omnibioai_access_token", "QUALITY-SESSION"));
  const counters = { enroll: 0, createKey: 0 };
  const page = await context.newPage();
  await page.route("**/*", route => fixtureRoute(route, counters));
  await page.goto(`${origin}${path}`);
  await page.locator("h1").waitFor();
  await page.waitForTimeout(50);
  return { context, page, counters };
}

function checkResult(pageName, width, check, failures) {
  const key = `${pageName}|${width}|${check}`;
  const issue = EXPECTED_FAILURES[key];
  if (issue) {
    assert.ok(failures.length, `${issue} now passes for ${key}; remove its expected-failure annotation`);
    return;
  }
  assert.deepEqual(failures, [], `${key}: ${JSON.stringify(failures, null, 2)}`);
}

async function axeFailures(page) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => window.axe.run(document, {
    runOnly: { type: "rule", values: ["color-contrast", "label", "button-name"] },
  }));
  return result.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target.join(" ")) }));
}

async function targetFailures(page) {
  return page.evaluate(() => [...document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"]')]
    .filter(element => {
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0 && !element.disabled;
    })
    .map(element => {
      const box = element.getBoundingClientRect();
      return { name: element.getAttribute("aria-label") || element.textContent.trim().slice(0, 50) || element.id, width: Math.round(box.width), height: Math.round(box.height) };
    })
    .filter(box => box.width < 44 || box.height < 44));
}

async function thirtyStepFocusWalk(page) {
  const failures = [];
  await page.locator("body").focus();
  for (let step = 1; step <= 30; step += 1) {
    await page.keyboard.press("Tab");
    const state = await page.evaluate(() => {
      const element = document.activeElement;
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      return {
        name: element.getAttribute("aria-label") || element.textContent.trim().slice(0, 60) || element.id || element.tagName,
        visible: box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight,
        ring: (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none",
      };
    });
    if (!state.visible || !state.ring) failures.push({ step, ...state });
  }
  return failures;
}

for (const [pageName, path] of ACCOUNT_PAGES) {
  for (const width of [1440, 390]) {
    test(`${pageName} meets the UI quality contract at ${width}px`, async () => {
      const { context, page } = await openAccountPage(path, width);
      try {
        const h1s = await page.locator("h1").allTextContents();
        assert.deepEqual(h1s, [pageName], `${pageName} must have exactly one page H1`);
        checkResult(pageName, width, "axe", await axeFailures(page));
        checkResult(pageName, width, "targets", await targetFailures(page));
        if (width === 390) {
          const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
          checkResult(pageName, width, "overflow", overflow > 0 ? [{ overflow }] : []);
        }
        checkResult(pageName, width, "focus", await thirtyStepFocusWalk(page));
      } finally {
        await context.close();
      }
    });
  }
}

test("N9: API key creation requires a valid name and reports the field error inline", async () => {
  const { context, page, counters } = await openAccountPage("/studio/account/organization/api-keys", 1440);
  try {
    const input = page.getByLabel("Key name", { exact: true });
    const create = page.getByRole("button", { name: "Create key", exact: true });
    assert.equal(await create.isDisabled(), true);
    await input.fill("   ");
    await page.getByText("Enter a name for this key.", { exact: true }).waitFor();
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    assert.equal(counters.createKey, 0);
    await input.fill("quality-check");
    assert.equal(await create.isEnabled(), true);
  } finally { await context.close(); }
});

test("N10: authenticator enrolment starts only on Continue and Escape discards setup", async () => {
  const { context, page, counters } = await openAccountPage("/studio/account/security", 1440);
  try {
    await page.getByRole("button", { name: "Add authenticator", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add authenticator" });
    await dialog.waitFor();
    assert.equal(counters.enroll, 0);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(counters.enroll, 0);
    await page.getByRole("button", { name: "Add authenticator", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("QUALITYFIXTURE", { exact: true }).waitFor();
    assert.equal(counters.enroll, 1);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await page.getByText("QUALITYFIXTURE", { exact: true }).count(), 0);
  } finally { await context.close(); }
});

test("Escape closes each account dialog", async () => {
  const scenarios = [
    ["mobile navigation", "/studio/account/profile", 390, "Open navigation", "Navigation"],
    ["authenticator", "/studio/account/security", 1440, "Add authenticator", "Add authenticator"],
    ["recovery codes", "/studio/account/security", 1440, "Manage recovery codes", "Recovery codes"],
  ];
  for (const [name, path, width, triggerName, dialogName] of scenarios) {
    const { context, page } = await openAccountPage(path, width);
    try {
      await page.getByRole("button", { name: triggerName, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: dialogName, exact: true });
      await dialog.waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached", timeout: 2000 });
    } catch (error) {
      assert.fail(`${name}: ${error.message}`);
    } finally { await context.close(); }
  }
});

test("Plan, Profile, and Security use explicit account states instead of Unavailable placeholders", async () => {
  for (const path of ["/studio/account/profile", "/studio/account/security", "/studio/account/organization/usage"]) {
    const { context, page } = await openAccountPage(path, 1440);
    try { assert.doesNotMatch(await page.locator("#account-content").innerText(), /\bUnavailable\b/); }
    finally { await context.close(); }
  }
});
