// Run after npm run web:build. All IAM responses are local test fixtures.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Playwright is already a development dependency of the shared UI package.
const { chromium } = createRequire(new URL("../../packages/omnibioai-ui/package.json", import.meta.url))("playwright");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const build = resolve(root, "dist/web");
const screenshots = process.env.PERSONALIZATION_SCREENSHOT_DIR || resolve(root, "out/personalization-browser");
const defaults = { timezone: "UTC", response_style: "balanced", technical_level: "general", preferred_language: null, personal_instructions: "" };
let server, browser, origin;

before(async () => {
  await readFile(resolve(build, "index.html"));
  await mkdir(screenshots, { recursive: true });
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

async function pageFor(width) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block" });
  await context.addInitScript(() => localStorage.setItem("omnibioai_access_token", "TEST-PERSONALIZATION"));
  const state = { preferences: { ...defaults }, patches: [], failSave: false, failLoad: false, errors: [] };
  const page = await context.newPage();
  page.on("pageerror", error => state.errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { await route.abort(); return; }
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/auth/validate") return json({ valid: true, user_id: 7, email: "personalization@example.test", roles: [], permissions: [] });
    if (url.pathname === "/me/preferences") {
      assert.equal(request.headers().authorization, "Bearer TEST-PERSONALIZATION");
      if (request.method() === "PATCH") {
        const changes = request.postDataJSON(); state.patches.push(changes);
        assert.ok(Object.keys(changes).every(key => Object.hasOwn(defaults, key)));
        if (state.failSave) return json({ detail: "private server details" }, 500);
        state.preferences = { ...state.preferences, ...changes };
      } else if (state.failLoad) return json({}, 503);
      return json(state.preferences);
    }
    if (url.pathname === "/_health") return json({ status: "ok" });
    if (url.pathname.startsWith("/_svc/")) return json({}, 503);
    return route.continue();
  });
  await page.goto(`${origin}/studio/personalization`);
  await page.getByLabel("Response style", { exact: true }).waitFor();
  return { context, page, state };
}

for (const width of [360, 390, 768, 1440]) {
  test(`production Personalization remains usable at ${width}px`, async () => {
    const { context, page, state } = await pageFor(width);
    try {
      assert.match(await page.getByRole("heading", { name: "Personalization", exact: true }).innerText(), /Personalization/);
      assert.equal(await page.getByRole("button", { name: "Save personalization", exact: true }).isDisabled(), true);
      await page.getByLabel("Response style", { exact: true }).selectOption("detailed");
      await page.getByLabel("Technical level", { exact: true }).selectOption("bioinformatics");
      await page.getByLabel("Preferred language", { exact: true }).selectOption("fr");
      const text = 'Define abbreviations. <img src=x onerror="alert(1)">';
      await page.getByLabel("Personal instructions", { exact: true }).fill(text);
      assert.equal(state.patches.length, 0);
      await page.getByRole("button", { name: "Save personalization", exact: true }).click();
      await page.getByText("Personalization saved.", { exact: true }).waitFor();
      assert.deepEqual(state.patches, [{ response_style: "detailed", technical_level: "bioinformatics", preferred_language: "fr", personal_instructions: text }]);
      assert.equal(state.preferences.timezone, "UTC");
      assert.equal(await page.locator('img[src="x"]').count(), 0);
      await page.reload(); await page.getByLabel("Response style", { exact: true }).waitFor();
      assert.equal(await page.getByLabel("Personal instructions", { exact: true }).inputValue(), text);
      assert.equal(await page.getByLabel("Preferred language", { exact: true }).inputValue(), "fr");
      const geometry = await page.evaluate(() => ({
        viewport: innerWidth, scroll: document.documentElement.scrollWidth,
        controls: [...document.querySelectorAll(".personalization-form select, .personalization-form textarea, .personalization-form button")].map(el => {
          const box = el.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width, height: box.height };
        }),
      }));
      assert.ok(geometry.scroll <= geometry.viewport, JSON.stringify(geometry));
      for (const box of geometry.controls) {
        assert.ok(box.left >= 0 && box.right <= width && box.width > 80 && box.height >= 44, JSON.stringify(box));
      }
      const contrasts = await page.locator(".personalization-field select, .personalization-field textarea").evaluateAll(elements => {
        const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
          const v = value / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
        return elements.map(el => {
          const style = getComputedStyle(el), fg = luminance(style.color), bg = luminance(style.backgroundColor);
          return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
        });
      });
      assert.ok(contrasts.every(contrast => contrast >= 4.5), `Input text contrast: ${contrasts}`);
      await page.screenshot({ path: resolve(screenshots, `personalization-${width}.png`), fullPage: true });
      if (width < 768) {
        await page.getByRole("button", { name: "Save personalization", exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(screenshots, `personalization-${width}-save.png`), fullPage: true });
      }
      assert.deepEqual(state.errors, []);
    } finally { await context.close(); }
  });
}

test("keyboard validation and load/save retry preserve the draft", async () => {
  const { context, page, state } = await pageFor(1440);
  try {
    await page.getByLabel("Response style", { exact: true }).focus();
    await page.keyboard.press("Tab"); assert.equal(await page.getByLabel("Technical level", { exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Tab"); assert.equal(await page.getByLabel("Preferred language", { exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Tab"); assert.equal(await page.getByLabel("Personal instructions", { exact: true }).evaluate(el => el === document.activeElement), true);
    await page.getByLabel("Personal instructions", { exact: true }).fill("🧬".repeat(2001));
    assert.match(await page.getByRole("alert").innerText(), /2,000 characters/);
    assert.equal(await page.getByRole("button", { name: "Save personalization", exact: true }).isDisabled(), true);
    await page.getByLabel("Personal instructions", { exact: true }).fill("Keep my draft."); state.failSave = true;
    await page.getByRole("button", { name: "Save personalization", exact: true }).click();
    await page.getByRole("alert").waitFor(); assert.equal(await page.getByLabel("Personal instructions", { exact: true }).inputValue(), "Keep my draft.");
    assert.equal(await page.getByText("Personalization saved.", { exact: true }).count(), 0);
    state.failSave = false; await page.getByRole("button", { name: "Save personalization", exact: true }).click();
    await page.getByText("Personalization saved.", { exact: true }).waitFor();
    state.failLoad = true; await page.reload(); await page.getByRole("alert").waitFor();
    state.failLoad = false; await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByLabel("Personal instructions", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Personal instructions", { exact: true }).inputValue(), "Keep my draft.");
    assert.deepEqual(state.errors, []);
  } finally { await context.close(); }
});

test("mobile Account menu routes to Personalization and closes its drawer", async () => {
  const { context, page } = await pageFor(390);
  try {
    await page.getByRole("button", { name: "Preferences", exact: true }).click();
    await page.getByLabel("Time zone", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    const dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: "Account menu" }).click();
    await dialog.getByRole("menuitem", { name: /Personalization/ }).click();
    await page.getByLabel("Response style", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/studio/personalization");
    assert.equal(await dialog.count(), 0);
  } finally { await context.close(); }
});

test("production PWA allows the Personalization route", async () => {
  const worker = await readFile(resolve(build, "sw.js"), "utf8");
  assert.match(worker, /profile\|security\|preferences\|notifications\|personalization/);
});
