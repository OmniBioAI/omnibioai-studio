const APP_ORIGIN = "http://localhost:5174";
const SERVICE_PORTS = new Set([
  "", "80", "3000", "7000", "7070", "8000", "8001", "8002", "8003", "8004",
  "8080", "8081", "8082", "8083", "8090", "8095", "8097", "8098", "8787", "8888", "9090", "11434",
]);
const EMBEDDED_SERVICE_PORTS = new Set([...SERVICE_PORTS, "5174"]);
const EXTERNAL_LOOPBACK_PORTS = new Set([...SERVICE_PORTS, "5190"]);
const net = require("node:net");

function normalizeTrustedHost(value) {
  if (typeof value !== "string" || value.length > 253 || /[\s/@?#]/.test(value)) return "localhost";
  try {
    const parsed = new URL(`http://${value}`);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
    const validHostname = hostname === "localhost"
      || net.isIP(hostname) > 0
      || /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(hostname);
    if (!validHostname || parsed.pathname !== "/" || parsed.port || parsed.username || parsed.password) return "localhost";
    return parsed.hostname;
  } catch {
    return "localhost";
  }
}

function parseUrl(value) {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function validateConfigPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8") <= 1024 * 1024;
  } catch {
    return false;
  }
}

function normalizeLicenseCredentials(value) {
  const credentials = typeof value === "string" ? { key: value, email: "" } : value;
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)
    || Object.getPrototypeOf(credentials) !== Object.prototype
    || Object.keys(credentials).some(key => !["key", "email"].includes(key))) {
    throw new Error("Invalid license request");
  }
  const { key, email = "" } = credentials;
  if (typeof key !== "string" || key.length < 1 || key.length > 512
    || typeof email !== "string" || email.length > 320) {
    throw new Error("Invalid license request");
  }
  return { key, email };
}

function isTrustedAppUrl(value) {
  const parsed = parseUrl(value);
  return !!parsed && parsed.origin === APP_ORIGIN && parsed.protocol === "http:";
}

function isTrustedAuthenticatedRequestUrl(value, { trustedHost = "localhost", packaged = false } = {}) {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  if (parsed.origin === "https://webstudio.omnibioai.org") return true;
  if (packaged && parsed.hostname === "webstudio.omnibioai.org" && parsed.protocol !== "https:") return false;
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (loopbackHosts.has(parsed.hostname.replace(/^\[|\]$/g, ""))) {
    return parsed.protocol === "http:" && SERVICE_PORTS.has(parsed.port);
  }
  if (parsed.protocol !== "https:") return false;
  const configuredHost = normalizeTrustedHost(trustedHost).replace(/^\[|\]$/g, "");
  return isPrivateServiceHost(configuredHost)
    && parsed.hostname.replace(/^\[|\]$/g, "") === configuredHost
    && SERVICE_PORTS.has(parsed.port);
}

function isPrivateServiceHost(host) {
  const family = net.isIP(host);
  if (family === 4) {
    const octets = host.split(".").map(Number);
    return octets[0] === 10 || octets[0] === 127 || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168);
  }
  if (family === 6) return host === "::1" || /^f[cd]/i.test(host) || /^fe[89ab]/i.test(host);
  return false;
}

function sessionAuthorizationHeaders(details, {
  mainWebContentsId,
  trustedHost = "localhost",
  packaged = false,
  accessToken = null,
  grafanaToken = null,
} = {}) {
  const headers = { ...(details?.requestHeaders || {}) };
  const removeAuthorization = () => {
    for (const key of Object.keys(headers)) if (key.toLowerCase() === "authorization") delete headers[key];
  };
  let parsed;
  try { parsed = new URL(details.url); } catch { return headers; }
  if (parsed.origin === "http://localhost:3000") {
    removeAuthorization();
    if (grafanaToken) headers.Authorization = `Bearer ${grafanaToken}`;
    return headers;
  }
  removeAuthorization();
  if (typeof mainWebContentsId !== "number" || details.webContentsId !== mainWebContentsId) return headers;
  if (details.method !== "OPTIONS" && accessToken
    && isTrustedAuthenticatedRequestUrl(details.url, { trustedHost, packaged })) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

function isAllowedEmbeddedServiceUrl(value, { devMode = false, trustedHost = "localhost" } = {}) {
  const parsed = parseUrl(value);
  if (!parsed || parsed.protocol !== "http:") return false;
  const allowedHosts = new Set(["localhost", "127.0.0.1", normalizeTrustedHost(trustedHost)]);
  if (!allowedHosts.has(parsed.hostname)) return false;
  return EMBEDDED_SERVICE_PORTS.has(parsed.port) && (parsed.port !== "5174" || devMode);
}

function isSafeExternalUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  if (parsed.protocol === "https:") return parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1";
  return parsed.protocol === "http:"
    && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    && EXTERNAL_LOOPBACK_PORTS.has(parsed.port);
}

function assertTrustedIpcSender(event, mainContents) {
  const frame = event?.senderFrame;
  if (event?.sender !== mainContents || !frame || frame !== mainContents?.mainFrame || !isTrustedAppUrl(frame.url)) {
    throw new Error("IPC request rejected: untrusted renderer");
  }
}

function secureWebPreferences(preloadPath) {
  return {
    preload: preloadPath,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: true,
  };
}

const PRODUCTION_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://webstudio.omnibioai.org http://localhost:* http://127.0.0.1:* https://*.sentry.io https://o4511460178132992.ingest.us.sentry.io ws://localhost:5174",
  "frame-src http://localhost:* http://127.0.0.1:*",
  "media-src 'self'",
].join("; ");

function productionCspForHost(host) {
  const trustedHost = normalizeTrustedHost(host);
  if (trustedHost === "localhost" || trustedHost === "127.0.0.1") return PRODUCTION_CSP;
  return PRODUCTION_CSP
    .replace("http://127.0.0.1:* https://*.sentry.io", `http://127.0.0.1:* http://${trustedHost}:* https://*.sentry.io`)
    .replace("frame-src http://localhost:* http://127.0.0.1:*", `frame-src http://localhost:* http://127.0.0.1:* http://${trustedHost}:*`);
}

function restrictWebview(event, preferences, params, { devMode = false } = {}) {
  if (!isAllowedEmbeddedServiceUrl(params?.src, { devMode })) {
    event.preventDefault();
    return false;
  }

  delete preferences.preload;
  preferences.nodeIntegration = false;
  preferences.nodeIntegrationInSubFrames = false;
  preferences.contextIsolation = true;
  preferences.sandbox = true;
  preferences.webSecurity = true;
  preferences.allowRunningInsecureContent = false;
  preferences.webviewTag = false;
  preferences.nativeWindowOpen = false;

  for (const key of ["allowpopups", "disablewebsecurity", "nodeintegration", "nodeintegrationinsubframes", "webpreferences", "preload"]) {
    delete params[key];
  }
  return true;
}

module.exports = {
  APP_ORIGIN,
  PRODUCTION_CSP,
  assertTrustedIpcSender,
  isAllowedEmbeddedServiceUrl,
  isSafeExternalUrl,
  isTrustedAuthenticatedRequestUrl,
  sessionAuthorizationHeaders,
  isTrustedAppUrl,
  normalizeLicenseCredentials,
  normalizeTrustedHost,
  productionCspForHost,
  restrictWebview,
  secureWebPreferences,
  validateConfigPayload,
};
