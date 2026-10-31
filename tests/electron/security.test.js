const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const {
  APP_ORIGIN,
  PRODUCTION_CSP,
  assertTrustedIpcSender,
  isAllowedEmbeddedServiceUrl,
  isSafeExternalUrl,
  isTrustedAppUrl,
  normalizeLicenseCredentials,
  normalizeTrustedHost,
  productionCspForHost,
  restrictWebview,
  secureWebPreferences,
  validateConfigPayload,
} = require("../../electron/security");
const { resolveAsset, startPackagedUiServer } = require("../../electron/staticServer");

test("BrowserWindow preferences keep Chromium protections enabled", () => {
  const preferences = secureWebPreferences("/app/electron/preload.js");
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.nodeIntegrationInSubFrames, false);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.webSecurity, true);
  assert.equal(preferences.allowRunningInsecureContent, false);
  // ServiceViewer and Grafana use isolated guests; attachment is separately allowlisted.
  assert.equal(preferences.webviewTag, true);
  assert.equal(preferences.preload, "/app/electron/preload.js");
});

test("only the exact local application origin is trusted for app navigation", () => {
  assert.equal(isTrustedAppUrl(`${APP_ORIGIN}/`), true);
  assert.equal(isTrustedAppUrl("http://localhost:5174/settings"), true);
  for (const url of [
    "https://localhost:5174/",
    "http://127.0.0.1:5174/",
    "http://localhost.evil.test:5174/",
    "http://localhost:5175/",
    "http://user@localhost:5174/",
    "javascript:alert(1)",
  ]) assert.equal(isTrustedAppUrl(url), false, url);
});

test("IPC permits only the trusted main frame and rejects subframes and foreign contents", () => {
  const mainFrame = { url: `${APP_ORIGIN}/` };
  const mainContents = { mainFrame };
  assert.doesNotThrow(() => assertTrustedIpcSender({ sender: mainContents, senderFrame: mainFrame }, mainContents));
  assert.throws(() => assertTrustedIpcSender({ sender: mainContents, senderFrame: { url: `${APP_ORIGIN}/iframe` } }, mainContents), /untrusted renderer/);
  assert.throws(() => assertTrustedIpcSender({ sender: {}, senderFrame: mainFrame }, mainContents), /untrusted renderer/);
  assert.throws(() => assertTrustedIpcSender({ sender: mainContents, senderFrame: { url: "https://evil.test/" } }, mainContents), /untrusted renderer/);
});

test("webview destinations are limited to expected loopback service origins", () => {
  assert.equal(isAllowedEmbeddedServiceUrl("http://localhost/_svc/rag/"), true);
  assert.equal(isAllowedEmbeddedServiceUrl("http://localhost:8000/plugins/alignment/"), true);
  assert.equal(isAllowedEmbeddedServiceUrl("http://localhost:8001/auth/login"), true);
  assert.equal(isAllowedEmbeddedServiceUrl("http://127.0.0.1:3000/d/overview"), true);
  assert.equal(isAllowedEmbeddedServiceUrl("http://localhost:5174/_svc/rag/", { devMode: true }), true);
  for (const url of [
    "https://localhost/",
    "http://192.168.1.2/_svc/rag/",
    "http://localhost:8123/unknown-service",
    "http://localhost.evil.test/",
    "file:///etc/passwd",
    "javascript:alert(1)",
  ]) assert.equal(isAllowedEmbeddedServiceUrl(url), false, url);
  assert.equal(isAllowedEmbeddedServiceUrl("http://localhost:5174/", { devMode: false }), false);
  assert.equal(isAllowedEmbeddedServiceUrl("http://10.0.0.8:8001/", { trustedHost: "10.0.0.8" }), true);
  assert.equal(isAllowedEmbeddedServiceUrl("http://10.0.0.8:3000/", { trustedHost: "10.0.0.8" }), true);
});

test("configured service host is normalized before it enters origins or CSP", () => {
  assert.equal(normalizeTrustedHost("10.0.0.8"), "10.0.0.8");
  assert.equal(normalizeTrustedHost("auth.example.org"), "auth.example.org");
  for (const host of ["https://evil.test", "evil.test/path", "user@evil.test", "localhost:9000", "<script>"]) {
    assert.equal(normalizeTrustedHost(host), "localhost", host);
  }
  const csp = productionCspForHost("10.0.0.8");
  assert.match(csp, /connect-src[^;]*http:\/\/10\.0\.0\.8:\*/);
  assert.match(csp, /frame-src[^;]*http:\/\/10\.0\.0\.8:\*/);
});

test("privileged configuration and license payloads have bounded schemas", () => {
  assert.equal(validateConfigPayload({ mode: "local", settings: { host_ip: "localhost" } }), true);
  assert.equal(validateConfigPayload(null), false);
  assert.equal(validateConfigPayload([]), false);
  assert.equal(validateConfigPayload({ data: "x".repeat(1024 * 1024) }), false);
  assert.deepEqual(normalizeLicenseCredentials("license-key"), { key: "license-key", email: "" });
  assert.deepEqual(normalizeLicenseCredentials({ key: "license-key", email: "user@example.org" }), {
    key: "license-key", email: "user@example.org",
  });
  for (const input of [null, {}, { key: "x", extra: "unexpected" }, { key: "x", email: 8 }, { key: "x".repeat(513) }]) {
    assert.throws(() => normalizeLicenseCredentials(input), /Invalid license request/);
  }
});

test("webview attachment rejects untrusted content and strips guest privileges", () => {
  const denied = { prevented: false, preventDefault() { this.prevented = true; } };
  assert.equal(restrictWebview(denied, {}, { src: "https://evil.test" }), false);
  assert.equal(denied.prevented, true);

  const event = { preventDefault() { assert.fail("trusted loopback embed unexpectedly rejected"); } };
  const preferences = { preload: "/evil/preload.js", nodeIntegration: true, webSecurity: false };
  const params = {
    src: "http://localhost/_svc/devhub/",
    nodeintegration: "true",
    disablewebsecurity: "true",
    allowpopups: "true",
    webpreferences: "nodeIntegration=yes",
    preload: "/evil/preload.js",
  };
  assert.equal(restrictWebview(event, preferences, params), true);
  assert.equal(preferences.preload, undefined);
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.nodeIntegrationInSubFrames, false);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.webSecurity, true);
  assert.equal(preferences.allowRunningInsecureContent, false);
  assert.equal(preferences.webviewTag, false);
  for (const key of ["nodeintegration", "disablewebsecurity", "allowpopups", "webpreferences", "preload"]) {
    assert.equal(Object.hasOwn(params, key), false);
  }
});

test("external navigation allows HTTPS and approved local tools only", () => {
  assert.equal(isSafeExternalUrl("https://docs.omnibioai.org/"), true);
  assert.equal(isSafeExternalUrl("http://example.org/"), false);
  assert.equal(isSafeExternalUrl("http://localhost:8888/lab"), true);
  assert.equal(isSafeExternalUrl("http://localhost:5190/"), true);
  assert.equal(isSafeExternalUrl("http://localhost:5174/"), false);
  assert.equal(isSafeExternalUrl("http://127.0.0.1:8888/"), true);
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
  assert.equal(isSafeExternalUrl("https://user@docs.omnibioai.org/"), false);
  assert.equal(isSafeExternalUrl("https://127.0.0.1/"), false);
  assert.match(PRODUCTION_CSP, /script-src 'self'/);
  assert.doesNotMatch(PRODUCTION_CSP, /unsafe-eval/);
  assert.match(PRODUCTION_CSP, /frame-ancestors 'none'/);
});

test("packaged local server serves only safe files and returns restrictive headers", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-ui-server-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "index.html"), "<!doctype html><html><head><title>Studio</title></head><body></body></html>");
  fs.mkdirSync(path.join(root, "assets"));
  fs.writeFileSync(path.join(root, "assets", "app.js"), "void 0;");
  const outsideSecret = path.join(os.tmpdir(), `studio-outside-${process.pid}.txt`);
  fs.writeFileSync(outsideSecret, "outside root");
  t.after(() => fs.rmSync(outsideSecret, { force: true }));
  fs.symlinkSync(outsideSecret, path.join(root, "assets", "linked-secret.txt"));

  assert.equal(resolveAsset(root, "/assets/app.js"), path.join(root, "assets", "app.js"));
  assert.equal(resolveAsset(root, "/assets/linked-secret.txt"), null);
  assert.equal(resolveAsset(root, "/%2e%2e/secret.txt"), null);
  assert.equal(resolveAsset(root, "/../secret.txt"), null);
  assert.equal(resolveAsset(root, "/%00secret.txt"), null);

  const server = await startPackagedUiServer(root, { port: 0, runtimeConfig: { hostIp: "10.0.0.8", server: "10.0.0.8" } });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const request = (route, host = `localhost:${port}`) => new Promise((resolve, reject) => {
    http.get({ hostname: "127.0.0.1", port, path: route, headers: { Host: host } }, resolve).on("error", reject);
  });

  const page = await request("/");
  assert.equal(page.statusCode, 200);
  assert.match(page.headers["content-security-policy"], /script-src 'self'/);
  assert.equal(page.headers["x-frame-options"], "DENY");
  assert.equal(page.headers["x-content-type-options"], "nosniff");
  const pageBody = await new Promise(resolve => { let body = ""; page.setEncoding("utf8").on("data", chunk => body += chunk).on("end", () => resolve(body)); });
  assert.match(pageBody, /<script src="\/__studio-runtime-config\.js"><\/script>/);
  assert.match(pageBody, /<!doctype html><html>/);

  const runtimeConfig = await request("/__studio-runtime-config.js");
  assert.equal(runtimeConfig.statusCode, 200);
  const runtimeConfigBody = await new Promise(resolve => { let body = ""; runtimeConfig.setEncoding("utf8").on("data", chunk => body += chunk).on("end", () => resolve(body)); });
  assert.equal(runtimeConfigBody, 'window.__OMNIBIOAI_CONFIG__ = {"hostIp":"10.0.0.8","server":"10.0.0.8"};\nwindow.__OMNIBIOAI_SERVER__ = "10.0.0.8";');
  assert.equal(runtimeConfig.headers["cache-control"], "no-store");

  const route = await request("/settings");
  assert.equal(route.statusCode, 200);
  assert.equal(await new Promise(resolve => { let body = ""; route.setEncoding("utf8").on("data", chunk => body += chunk).on("end", () => resolve(body)); }), pageBody);
  assert.equal((await request("/secret.txt", "evil.test")).statusCode, 404);
  assert.equal((await request("/missing.js")).statusCode, 404);
  assert.equal((await request("/assets/app.js", `127.0.0.1:${port}`)).statusCode, 404);
});

test("preload exposes narrow wrappers and never exposes raw IPC or credential values", () => {
  let exposed = {};
  const listeners = new Map();
  const ipcRenderer = {
    invoke: (channel, ...args) => ({ channel, args }),
    on(channel, listener) { listeners.set(channel, listener); },
    removeListener(channel, listener) { if (listeners.get(channel) === listener) listeners.delete(channel); },
  };
  const contextBridge = { exposeInMainWorld(name, value) { exposed[name] = value; } };
  const source = fs.readFileSync(path.join(__dirname, "../../electron/preload.js"), "utf8");
  vm.runInNewContext(source, { require: () => ({ contextBridge, ipcRenderer }) });

  assert.equal(exposed.api.getCredentials, undefined);
  assert.equal(exposed.api.syncAuthCookie, undefined);
  assert.equal(exposed.api.loadUrl, undefined);
  assert.equal(exposed.api.invoke, undefined);
  assert.equal(exposed.api.send, undefined);
  assert.equal(exposed.api.getCredentialStatus().channel, "credential-status");
  assert.equal(exposed.electronAPI.hostIp, undefined);

  let delivered;
  const unsubscribe = exposed.api.onDockerLog(value => { delivered = value; });
  listeners.get("docker-log")({}, "safe log line");
  assert.equal(delivered, "safe log line");
  unsubscribe();
  assert.equal(listeners.has("docker-log"), false);
});
