// Run after npm run web:build. All account/API responses are synthetic;
// non-local requests are blocked. No production services are contacted.
// node tests/browser/storage-visual-v2.cjs <evidence-dir>
// Set CHROMIUM_PATH to an installed browser when Playwright has no bundled one.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const uiRequire = createRequire(path.resolve('packages/omnibioai-ui/package.json'));
const { chromium } = uiRequire('playwright');
const root = path.resolve('dist/web');
const out = path.resolve(process.argv[2] || '/tmp/storage-visual-v2-evidence');
const users = {
  free: { user_id: 7, plan: 'free', quota: 1e9, used: 2e8, reserved: 1e8 },
  plus: { user_id: 8, plan: 'plus', quota: 20e9, used: 4.2e9, reserved: 1.8e9 },
  pro: { user_id: 9, plan: 'pro', quota: 100e9, used: 42e9, reserved: 3e9 },
  missing: { user_id: 10, plan: null, quota: null, used: 2e8, reserved: 0 },
  zero: { user_id: 11, plan: 'free', quota: 0, used: 0, reserved: 0 },
};
let usageStatus = 200;
let usageDelay = 50;
let usageRequests = 0;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const json = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/auth/validate') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const user = users[JSON.parse(raw || '{}').token];
      json(res, user ? 200 : 401, user ? { valid: true, user_id: user.user_id, email: 'preview@synthetic.example', roles: [], permissions: [] } : { valid: false });
    });
    return;
  }
  if (pathname === '/_svc/workbench/api/storage/me/usage') {
    usageRequests++;
    const user = users[(req.headers.authorization || '').replace(/^Bearer /, '')];
    if (!user) return json(res, 401, {});
    const status = usageStatus;
    const payload = { owner_type: 'USER', owner_id: String(user.user_id), membership_plan: user.plan, quota_bytes: user.quota, used_bytes: user.used, reserved_bytes: user.reserved, available_bytes: user.quota === null ? null : Math.max(0, user.quota - user.used - user.reserved), over_quota: false, quota_mode: 'audit', enforcement_active: false, entitlement_status: user.quota === null ? 'cached_or_unavailable' : 'fresh' };
    setTimeout(() => json(res, status, status === 200 ? payload : {}), usageDelay);
    return;
  }
  if (pathname === '/auth/logout') return json(res, 200, {});
  if (pathname.startsWith('/_svc/') || pathname.startsWith('/auth/') || pathname.startsWith('/billing/') || ['/me', '/_health'].includes(pathname)) return json(res, 404, {});
  const candidate = path.resolve(root, '.' + decodeURIComponent(pathname));
  const file = candidate.startsWith(root + path.sep) && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

async function main() {
  assert.ok(fs.existsSync(path.join(root, 'index.html')), 'web build missing');
  fs.mkdirSync(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block', colorScheme: 'dark', viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  const blocked = [];
  const layouts = [];
  const accessibility = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' && url.port === String(port)) return route.continue();
    blocked.push(url.origin);
    return route.abort();
  });
  await page.addInitScript(() => localStorage.setItem('omnibioai_access_token', 'plus'));
  const dashboard = page.locator('.storage-dashboard');
  const summary = page.locator('.storage-dashboard__summary');
  const refresh = () => page.getByRole('button', { name: 'Refresh usage', exact: true });
  const waitForPlan = name => page.getByText(`Membership: ${name}`, { exact: true }).waitFor();
  const switchUser = async token => {
    await page.evaluate(next => {
      localStorage.setItem('omnibioai_access_token', next);
      window.dispatchEvent(new StorageEvent('storage', { key: 'omnibioai_access_token' }));
    }, token);
  };
  try {
    await page.goto(`http://127.0.0.1:${port}/studio/storage`, { waitUntil: 'domcontentloaded' });
    await waitForPlan('Plus');
    for (const [name, width, height] of [['desktop', 1440, 1100], ['tablet', 834, 1194], ['mobile', 390, 844], ['small-mobile', 320, 740]]) {
      await page.setViewportSize({ width, height });
      await dashboard.scrollIntoViewIfNeeded();
      const layout = await page.evaluate(() => {
        const metrics = document.querySelector('.storage-dashboard__metrics');
        return {
          viewport: innerWidth, document: document.documentElement.scrollWidth,
          metricColumns: getComputedStyle(metrics).gridTemplateColumns.split(' ').length,
          planColumns: getComputedStyle(document.querySelector('.storage-dashboard__plan-grid')).gridTemplateColumns.split(' ').length,
          dashboardWidth: document.querySelector('.storage-dashboard').getBoundingClientRect().width,
        };
      });
      assert.ok(layout.document <= width, `${name} horizontal overflow: ${JSON.stringify(layout)}`);
      assert.equal(layout.metricColumns, width > 1200 ? 4 : 2);
      assert.equal(layout.planColumns, width <= 640 ? 1 : 3);
      layouts.push({ name, ...layout });
      await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
      await dashboard.screenshot({ path: path.join(out, `${name}-dashboard.png`) });
      await page.addScriptTag({ path: uiRequire.resolve('axe-core/axe.min.js') });
      const result = await page.evaluate(async () => {
        const result = await axe.run('.storage-dashboard', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
        return result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) }));
      });
      accessibility.push({ name, violations: result });
      fs.writeFileSync(path.join(out, 'accessibility.json'), JSON.stringify(accessibility, null, 2));
      assert.deepEqual(result, [], `${name} accessibility violations`);
    }
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    const lightViolations = await page.evaluate(async () => (await axe.run('.storage-dashboard', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })));
    const dashboardLightViolations = lightViolations.filter(item => item.nodes.some(target => target[0] !== '.omni-btn'));
    assert.deepEqual(dashboardLightViolations, [], 'light-theme dashboard accessibility');
    accessibility.push({ name: 'light-theme-dashboard', violations: dashboardLightViolations });
    accessibility.push({ name: 'shared-button-component', violations: lightViolations.filter(item => item.nodes.some(target => target[0] === '.omni-btn')) });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    // Keyboard operation and focus indication on both dashboard actions.
    await page.setViewportSize({ width: 1440, height: 1100 });
    await refresh().focus();
    await page.keyboard.press('Tab');
    const plansLink = page.getByRole('link', { name: /Explore membership plans/ });
    assert.equal(await plansLink.evaluate(el => document.activeElement === el), true);
    assert.equal(await plansLink.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    await page.keyboard.press('Shift+Tab');
    usageDelay = 300;
    const before = usageRequests;
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Refreshing usage…' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Refreshing usage…' }).isDisabled(), true);
    assert.doesNotMatch(await summary.innerText(), /4.2 GB/);
    await waitForPlan('Plus');
    assert.ok(usageRequests > before);
    // Current plan and effective quota for each API membership.
    for (const [token, label, used] of [['free', 'Free', '200.0 MB'], ['pro', 'Pro', '42.0 GB'], ['plus', 'Plus', '4.2 GB']]) {
      await switchUser(token);
      await waitForPlan(label);
      assert.ok((await summary.innerText()).includes(used));
      assert.equal(await page.getByText('Current plan', { exact: true }).count(), 1);
    }
    await switchUser('missing');
    await waitForPlan('Unavailable');
    assert.equal(await dashboard.getByRole('img').count(), 0);
    assert.equal(await page.getByText('Current plan', { exact: true }).count(), 0);
    await dashboard.screenshot({ path: path.join(out, 'missing-entitlement.png') });
    await switchUser('zero');
    await waitForPlan('Free');
    assert.match(await summary.innerText(), /No storage allowance allocated/);
    assert.doesNotMatch(await summary.innerText(), /NaN|Infinity|reconciliation/i);
    usageStatus = 503;
    await refresh().click();
    await dashboard.getByRole('alert').waitFor();
    assert.match(await summary.innerText(), /No usage value has been assumed/);
    usageStatus = 200;
    await refresh().click();
    await waitForPlan('Free');
    // Preserve existing account navigation and direct route.
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    await page.getByRole('button', { name: 'Storage', exact: true }).click();
    await waitForPlan('Free');
    assert.equal(new URL(page.url()).pathname, '/studio/storage');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify({ status: 'PASS', syntheticFixtures: true, browser: await browser.version(), layouts, accessibility, keyboard: 'Tab / Shift+Tab / Enter refresh and visible focus passed', scenarios: ['Free / Plus / Pro', 'missing entitlement', 'zero quota', 'refresh loading', '503 error and retry', 'account navigation'], externalRequestsBlocked: [...new Set(blocked)], pageErrors: errors }, null, 2));
    console.log('BROWSER_VERIFICATION=PASS');
  } finally {
    await browser.close();
    server.close();
  }
}
main().catch(error => { console.error(error.stack || error); server.close(); process.exitCode = 1; });
