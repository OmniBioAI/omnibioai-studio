import { isElectron } from "./session";
import { csrfToken } from "./pluginApi";

const API = "/_svc/workbench/plugins/dataset_catalog/api";

function serviceUrl(path) {
  const origin = isElectron() ? (import.meta.env.DEV ? "http://localhost:5174" : "http://localhost") : "";
  return `${origin}${API}${path}`;
}

async function request(path, { method = "GET", body, signal } = {}) {
  const response = await fetch(serviceUrl(path), {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "X-CSRFToken": csrfToken() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = {};
  try { payload = await response.json(); } catch { /* normalize non-JSON errors */ }
  if (!response.ok) {
    throw new Error(payload.error || payload.detail || `Workbench request failed (${response.status}).`);
  }
  return payload;
}

function safeId(id) {
  const value = String(id ?? "").trim();
  if (!value || value.length > 500) throw new Error("Invalid dataset identifier.");
  return encodeURIComponent(value);
}

export const datasetCatalogApi = Object.freeze({
  list: (staleDays, options) => request(`/list/?stale_days=${encodeURIComponent(staleDays)}`, options),
  create: (dataset, options) => request("/create/", { ...options, method: "POST", body: dataset }),
  remove: (id, options) => request(`/delete/${safeId(id)}/`, { ...options, method: "POST" }),
  intelligence: (id, path, options) => {
    const query = new URLSearchParams({ dataset_id: String(id), path: String(path) });
    return request(`/datasets/intelligence/?${query}`, options);
  },
});
