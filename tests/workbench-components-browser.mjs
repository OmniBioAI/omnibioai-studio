/**
 * Run: node tests/workbench-components-browser.mjs
 * Optional: WORKBENCH_REVIEW_ARTIFACTS=/private/tmp/... for screenshots + report.
 * Uses installed Playwright/axe and cached Chromium; never calls a real backend.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = process.env.WORKBENCH_REVIEW_ARTIFACTS || path.join(tmpdir(), "omnibioai-708-browser-review");
await mkdir(artifacts, { recursive: true });
const server = await createServer({ root, configFile: false, plugins: [react()], resolve: { dedupe: ["react", "react-dom"] }, server: { host: "127.0.0.1", port: 0 }, logLevel: "warn" });
let browser;
const report = [];
function luminance(color) {
  const components = color.startsWith("#")
    ? color.slice(1).match(/.{2}/g).map(value => parseInt(value, 16))
    : color.match(/[\d.]+/g).slice(0, 3).map(Number);
  const [red, green, blue] = components.map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}
function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
try {
  await server.listen();
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  for (const theme of ["dark", "light"]) {
    for (const width of [1440, 375, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      const browserErrors = [];
      const apiRequests = [];
      page.on("pageerror", error => browserErrors.push(error.message));
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === "/_svc/workbench/plugins/rcsb_pdb/api/ui-query/") {
          apiRequests.push(`${url.pathname}${url.search}`);
          const current = Number(url.searchParams.get("page") || 1);
          return route.fulfill({ json: { results: [{ pdb_id: current === 1 ? "4HHB" : "1ABC", score: 1e-12 }], pagination: { mode: "page", page: current, page_size: 1, total_items: 2, has_previous: current > 1, has_next: current < 2 } } });
        }
        if (url.pathname === "/_svc/workbench/plugins/rcsb_pdb/api/ui-detail/4HHB/") {
          apiRequests.push(url.pathname);
          return route.fulfill({ json: { pdb_id: "4HHB", title: "Authorized detail remains an inert scalar response.", experimental_method: "X-RAY DIFFRACTION", resolution_angstrom: 1.74 } });
        }
        if (url.pathname.startsWith("/_svc/")) return route.abort();
        return route.continue();
      });
      await page.goto(`${origin}/tests/fixtures/workbench-components.html`);
      await page.locator("h1").waitFor();
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      const main = page.getByRole("main");
      const scientificField = page.getByRole("textbox", { name: "Scientific identifier", exact: true });
      assert.equal(await scientificField.evaluate(element => element.tagName), "INPUT");
      assert.equal(await page.getByRole("textbox", { name: "Multiline scientific notes" }).evaluate(element => element.tagName), "TEXTAREA");
      assert.equal(await page.getByRole("spinbutton", { name: "Distance" }).inputValue(), "1e-7");
      await page.keyboard.press("Tab");
      assert(await scientificField.evaluate(element => element === document.activeElement));
      const focusOutline = await scientificField.evaluate(element => getComputedStyle(element).outlineStyle);
      assert.notEqual(focusOutline, "none");
      const focusColors = await scientificField.evaluate(element => ({ ring: getComputedStyle(element).outlineColor,
        control: getComputedStyle(document.documentElement).getPropertyValue("--bg2").trim(),
        panel: getComputedStyle(document.documentElement).getPropertyValue("--bg3").trim() }));
      const focusContrast = Math.min(contrast(focusColors.ring, focusColors.control), contrast(focusColors.ring, focusColors.panel));
      assert(focusContrast >= 3, `Field keyboard focus must have 3:1 contrast: ${focusContrast}.`);
      const savedIdentifier = await scientificField.inputValue();
      await scientificField.fill("");
      await scientificField.press("Enter");
      assert.equal(await scientificField.getAttribute("aria-invalid"), "true");
      assert(await scientificField.evaluate(element => element === document.activeElement));
      await scientificField.fill(savedIdentifier);
      await scientificField.press("Enter");
      await page.getByText("Inputs accepted for backend validation.").waitFor();
      assert(await page.getByRole("textbox", { name: "Unavailable input" }).isDisabled());
      assert.equal(await page.getByRole("textbox", { name: "Read-only accession" }).getAttribute("readonly"), "");
      const table = page.getByRole("region", { name: "Scientific results table" });
      await table.focus();
      assert(await table.evaluate(element => element === document.activeElement));
      const scrollable = await table.evaluate(element => element.scrollWidth > element.clientWidth);
      if (width < 500) {
        assert(scrollable, "Wide scientific data must be contained in a horizontal scrolling region.");
        await table.press("ArrowRight");
        await page.waitForFunction(() => document.querySelector('[aria-label="Scientific results table"]').scrollLeft > 0);
      }
      assert.equal(await table.locator("td").first().textContent(), savedIdentifier);
      assert.equal(await page.locator("img").count(), 0);
      const scientificSection = page.getByRole("region", { name: "Scientific results", exact: true });
      const pagination = scientificSection.getByRole("navigation");
      assert(await pagination.getByRole("button", { name: "Previous" }).isDisabled());
      await pagination.getByRole("button", { name: "Next" }).focus();
      await page.keyboard.press("Enter");
      assert.equal(await pagination.locator('[aria-current="page"]').textContent(), "Page 2");
      await pagination.getByRole("button", { name: "Previous" }).click();
      const query = page.getByTestId("query-review");
      assert(await query.getByRole("group", { name: "Structure filters" }).isVisible());
      await query.getByRole("textbox", { name: "Protein name", exact: true }).fill("hemoglobin");
      await query.getByRole("spinbutton", { name: "Page size", exact: true }).fill("1");
      await query.getByRole("button", { name: "Search", exact: true }).click();
      await query.getByRole("button", { name: "View details for 4HHB" }).waitFor();
      await query.getByRole("button", { name: "View details for 4HHB" }).focus();
      await page.keyboard.press("Enter");
      const detail = query.getByRole("heading", { name: "Structure detail", exact: true });
      await detail.waitFor();
      await page.waitForFunction(element => element === document.activeElement, await detail.elementHandle());
      assert(await detail.evaluate(element => element === document.activeElement));
      await query.screenshot({ path: path.join(artifacts, `${theme}-${width}-query-detail.png`) });
      await query.getByRole("button", { name: "Next" }).click();
      await query.getByRole("button", { name: "View details for 1ABC" }).waitFor();
      assert(await query.getByRole("button", { name: "Next" }).isDisabled());
      assert(apiRequests.some(url => url.includes("page=2")));
      const layout = await main.evaluate(element => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, main: element.getBoundingClientRect().width }));
      if (layout.document > width + 1) console.log(await page.evaluate(() => Array.from(document.querySelectorAll("body *")).filter(element => element.getBoundingClientRect().right > innerWidth + 1 && !element.closest("table")).map(element => ({ tag: element.tagName, class: element.className, rect: element.getBoundingClientRect().toJSON() }))));
      assert(layout.document <= width + 1, `Viewport overflow: ${JSON.stringify(layout)}`);
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const accessibility = await page.evaluate(async () => {
        const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
        return { violations: result.violations.map(item => ({ id: item.id, impact: item.impact, description: item.description, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })), incomplete: result.incomplete.map(item => item.id) };
      });
      await page.screenshot({ path: path.join(artifacts, `${theme}-${width}.png`), fullPage: true });
      report.push({ theme, width, layout, scrollable, focusOutline, focusContrast, browserErrors, apiRequests, accessibility });
      await page.close();
    }
  }
  await writeFile(path.join(artifacts, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const failures = report.filter(item => item.browserErrors.length || item.accessibility.violations.length);
  console.log(JSON.stringify({ artifacts, scenarios: report.length, violations: failures.map(item => ({ theme: item.theme, width: item.width, errors: item.browserErrors, violations: item.accessibility.violations })) }, null, 2));
  assert.equal(failures.length, 0, "Browser accessibility or runtime review failed; see report.json.");
} finally {
  await browser?.close();
  await server.close();
}
