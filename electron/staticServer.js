const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

function resolveAsset(root, requestUrl) {
  let pathname;
  try {
    const rawPath = requestUrl.split(/[?#]/, 1)[0];
    const decodedRawPath = decodeURIComponent(rawPath);
    if (decodedRawPath.includes("\0") || decodedRawPath.split("/").includes("..")) return null;
    pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0") || pathname.split("/").includes("..")) return null;
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const asset = path.resolve(root, relative);
  const resolvedRoot = path.resolve(root);
  if (!asset.startsWith(`${resolvedRoot}${path.sep}`)) return null;
  if (fs.existsSync(asset)) {
    const realRoot = fs.realpathSync(resolvedRoot);
    const realAsset = fs.realpathSync(asset);
    if (!realAsset.startsWith(`${realRoot}${path.sep}`)) return null;
    return realAsset;
  }
  return asset;
}

function startPackagedUiServer(root, { host = "127.0.0.1", port = 5174, csp, runtimeConfig = {} } = {}) {
  const resolvedRoot = path.resolve(root);
  const indexPath = path.join(resolvedRoot, "index.html");
  if (!fs.existsSync(indexPath)) throw new Error("Packaged Studio UI is missing its entry page");

  const server = http.createServer((request, response) => {
    const activePort = server.address()?.port || port;
    if (request.headers.host !== `localhost:${activePort}` || !["GET", "HEAD"].includes(request.method)) {
      response.writeHead(404, { "X-Content-Type-Options": "nosniff" }).end();
      return;
    }

    if (request.url === "/__studio-runtime-config.js" && ["GET", "HEAD"].includes(request.method)) {
      const configBody = [
        `window.__OMNIBIOAI_CONFIG__ = ${JSON.stringify(runtimeConfig)};`,
        runtimeConfig.server ? `window.__OMNIBIOAI_SERVER__ = ${JSON.stringify(runtimeConfig.server)};` : "",
      ].filter(Boolean).join("\n");
      response.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": csp || require("./security").PRODUCTION_CSP,
      });
      response.end(request.method === "HEAD" ? undefined : configBody);
      return;
    }

    let filePath = resolveAsset(resolvedRoot, request.url);
    if (!filePath) {
      response.writeHead(400, { "X-Content-Type-Options": "nosniff" }).end();
      return;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      // The renderer is an SPA. Only extensionless routes fall back to its entry point.
      const pathname = new URL(request.url, "http://localhost").pathname;
      if (path.extname(pathname)) {
        response.writeHead(404, { "X-Content-Type-Options": "nosniff" }).end();
        return;
      }
      filePath = indexPath;
    }

    const headers = {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cache-Control": filePath === indexPath ? "no-store" : "public, max-age=31536000, immutable",
    };
    if (filePath === indexPath) {
      headers["Content-Security-Policy"] = csp || require("./security").PRODUCTION_CSP;
      headers["X-Frame-Options"] = "DENY";
    }
    response.writeHead(200, headers);
    if (request.method === "HEAD") {
      response.end();
    } else if (filePath === indexPath) {
      const html = fs.readFileSync(indexPath, "utf8").replace(
        /<\/head>/i,
        '<script src="/__studio-runtime-config.js"></script></head>'
      );
      response.end(html);
    } else {
      fs.createReadStream(filePath).pipe(response);
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}

module.exports = { resolveAsset, startPackagedUiServer };
