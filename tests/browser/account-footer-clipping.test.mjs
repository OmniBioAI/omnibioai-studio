// Run after npm run web:build. Regression test for the Account footer being
// clipped out of view by `.studio-sidebar-wrap`'s overflow:hidden whenever
// the Sidebar's own long navigation list (as an admin/platform_admin account
// sees it) exceeded the viewport height -- the root `<div>` in Sidebar.jsx
// had no height tying it to its already viewport-sized parent, so `<nav>`'s
// flex:1 never had a definite space to grow/shrink into and the whole
// Sidebar rendered at full content height instead of the viewport's.
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

// The full identity from a real admin/platform_admin account -- this is
// what makes the nav long enough (21 items, including the permission-gated
// "Roles" section) to exceed every tested viewport height and actually
// exercise the Sidebar's scrolling behavior.
const ADMIN_USER = {
  valid: true, user_id: 5, email: "manish@omnibioai.org",
  roles: ["admin", "platform_admin"],
  permissions: [
    "manage_all_orgs", "manage_api_keys", "manage_billing", "manage_config", "manage_licenses",
    "manage_oauth_clients", "manage_org", "manage_roles", "manage_sso", "manage_teams",
    "model.read", "model.resolve_ownership", "override_sso_enforcement", "platform.manage_content",
    "platform.manage_cron", "platform.manage_infra", "runs.read", "workflow.manage", "workflow.read",
  ],
  org_id: 1, org_role: ["org_admin"], team_id: null, team_role: null,
  auth_method: "license", idp_org_id: null, schema_version: 2,
};

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
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`admin Sidebar keeps the Account footer and system status visible at ${viewport.width}x${viewport.height}`, async () => {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" });
    await context.addInitScript(() => localStorage.setItem("omnibioai_access_token", "TEST-ADMIN-SIDEBAR"));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { await route.abort(); return; }
      if (url.pathname === "/auth/validate") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ADMIN_USER) });
      }
      if (url.pathname.startsWith("/_svc/")) return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      return route.continue();
    });

    try {
      await page.goto(`${origin}/studio`);

      const accountTrigger = page.getByRole("button", { name: "Account menu" });
      await accountTrigger.waitFor();

      // 1 + 2. Footer exists and is fully contained inside the Sidebar's
      // viewport-clipped wrapper, not pushed past it.
      const wrapBox = await page.locator(".studio-sidebar-wrap").boundingBox();
      const footerBox = await page.locator(".studio-account-footer").boundingBox();
      assert.ok(wrapBox, "Sidebar wrap did not render");
      assert.ok(footerBox, "Account footer did not render");
      assert.ok(footerBox.y >= wrapBox.y - 0.5, `Footer top (${footerBox.y}) is above the Sidebar wrap (${wrapBox.y})`);
      assert.ok(
        footerBox.y + footerBox.height <= wrapBox.y + wrapBox.height + 0.5,
        `Footer bottom (${footerBox.y + footerBox.height}) exceeds the Sidebar wrap's bottom (${wrapBox.y + wrapBox.height})`,
      );

      // 3. Account trigger is visible and has real size.
      assert.equal(await accountTrigger.isVisible(), true);
      const triggerBox = await accountTrigger.boundingBox();
      assert.ok(triggerBox && triggerBox.width > 0 && triggerBox.height > 0, `Account trigger has no size: ${JSON.stringify(triggerBox)}`);

      // 4. System status area (the Sidebar root's last child) stays inside
      // the Sidebar too -- no stable class exists for it, so it's located
      // structurally the same way the fix's own diagnosis did.
      const statusBox = await page.evaluate(() => {
        const wrap = document.querySelector(".studio-sidebar-wrap");
        const root = wrap?.firstElementChild;
        const status = root?.lastElementChild;
        if (!status) return null;
        const r = status.getBoundingClientRect();
        return { y: r.y, height: r.height };
      });
      assert.ok(statusBox, "System status area did not render");
      assert.ok(
        statusBox.y + statusBox.height <= wrapBox.y + wrapBox.height + 0.5,
        `System status bottom (${statusBox.y + statusBox.height}) exceeds the Sidebar wrap's bottom (${wrapBox.y + wrapBox.height})`,
      );

      // 5. Navigation itself -- not the whole Sidebar -- is the region that
      // scrolls once this admin's 21-item nav exceeds available height.
      const navScroll = await page.evaluate(() => {
        const nav = document.querySelector(".studio-sidebar-wrap nav");
        return nav ? { scrollHeight: nav.scrollHeight, clientHeight: nav.clientHeight } : null;
      });
      assert.ok(navScroll, "Nav did not render");
      assert.ok(navScroll.scrollHeight > navScroll.clientHeight, `Nav is not scrollable: ${JSON.stringify(navScroll)}`);

      // 6. The unrelated Report Bug control still doesn't live inside the
      // Sidebar's own column (prior fix, must not regress).
      const reportBug = page.getByRole("button", { name: /Report Bug/ });
      const bugBox = await reportBug.boundingBox();
      assert.ok(bugBox && bugBox.x > 200, `Report Bug is inside the Sidebar's column: ${JSON.stringify(bugBox)}`);

      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
}
