import { csrfToken, pluginEndpoint } from "./pluginApi";

export async function nativePluginRequest(path, { method = "GET", body, signal } = {}) {
  const headers = { Accept: "application/json" };
  const options = { method, credentials: "same-origin", headers, signal };
  if (body !== undefined) {
    const csrf = csrfToken();
    if (csrf) headers["X-CSRFToken"] = csrf;
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      options.body = body;
    } else {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
  }
  const response = await fetch(pluginEndpoint(path), options);
  let payload = {};
  try { payload = await response.json(); } catch { /* handled as a status error below */ }
  if (!response.ok) {
    const error = new Error(payload.error || payload.detail || `Workbench request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}
