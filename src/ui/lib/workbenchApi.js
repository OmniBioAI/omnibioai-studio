import { isElectron } from "../lib/session";

const BASE = "/_svc/workbench";
const APPLICATION_PATH = /^\/(?:plugins|ops|dashboard|admin)\/(?:[A-Za-z0-9_-]+\/)*$/;

function serviceUrl(path, { electron = isElectron(), development = import.meta.env.DEV } = {}) {
  // Match Studio's existing ServiceViewer localhost transport in Electron.
  const origin = electron ? (development ? "http://localhost:5174" : "http://localhost") : "";
  return `${origin}${BASE}${path}`;
}

export function applicationUrl(path, options) {
  if (typeof path !== "string" || !APPLICATION_PATH.test(path) || /\s/.test(path)) {
    throw new Error("Invalid application destination.");
  }
  return serviceUrl(path, options);
}

export function legacyWorkbenchUrl(options) {
  return serviceUrl("/", options);
}

export function validateCatalog(data) {
  const invalid = () => { throw new Error("Workbench returned an invalid catalog."); };
  if (data?.schema_version !== 1 || !Array.isArray(data.categories)) invalid();
  const keys = new Set();
  let total = 0;
  for (const category of data.categories) {
    if (typeof category?.key !== "string" || !category.key || keys.has(category.key)
        || typeof category.title !== "string" || !Array.isArray(category.plugins)
        || category.count !== category.plugins.length) invalid();
    keys.add(category.key);
    for (const plugin of category.plugins) {
      if (!["slug", "title", "description", "version", "category", "launch_path"]
        .every(key => typeof plugin?.[key] === "string")) invalid();
      applicationUrl(plugin.launch_path, { electron: false });
    }
    total += category.count;
  }
  if (data.total_count !== total) invalid();
  return data;
}

export async function loadWorkbenchCatalog({ signal } = {}) {
  // This endpoint exposes the same public metadata as the legacy catalog.
  // Preserve normal cookies, but do not create an authentication bridge or
  // clear Studio's session in response to a Workbench service error.
  const response = await fetch(serviceUrl("/home/catalog/"), {
    headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store", signal,
  });
  if (!response.ok) throw new Error(`Unable to load Workbench catalog (${response.status}).`);
  let data;
  try { data = await response.json(); }
  catch { throw new Error("Workbench returned an invalid catalog."); }
  return validateCatalog(data);
}
