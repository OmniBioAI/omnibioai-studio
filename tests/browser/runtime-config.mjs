// index.html loads /__studio-runtime-config.js, which nginx (docker/nginx-web.conf)
// and Electron (electron/staticServer.js) generate. A test static server that
// answers it with its index.html fallback makes the page throw
// "Unexpected token '<'" (#254). Serve the same script with the outage flag off.
const RUNTIME_CONFIG_SCRIPT =
  "window.__OMNIBIOAI_CONFIG__ = Object.assign({}, window.__OMNIBIOAI_CONFIG__, { toolRunsTemporarilyUnavailable: false });";

export function serveRuntimeConfig(request, response) {
  if (new URL(request.url, "http://localhost").pathname !== "/__studio-runtime-config.js") return false;
  response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
  response.end(RUNTIME_CONFIG_SCRIPT);
  return true;
}
