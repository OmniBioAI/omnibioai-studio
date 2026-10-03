// Client for omnibioai-auth's self-service API-key endpoints
// (/me/api-keys): a signed-in member manages their own omni_sk_ keys in the
// organization their session is in. Org-wide key administration stays in
// the admin console.
//
// "../lib/session" (not "./session") on purpose -- see rolesApi.js's import
// comment: vite.config.js's web-build alias only matches that spelling.
import { authUrl, getToken, clearSession } from "../lib/session";

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(authUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    clearSession();
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail || detail;
    } catch (_) {
      // response had no JSON body
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

// GET -> [{ id, name, key_prefix, scopes, status, created_at, expires_at, last_used_at }]
export const listMyApiKeys = () => request("/me/api-keys");

// POST -> { id, name, key_prefix, scopes, key }  (key is shown exactly once)
export const createMyApiKey = (name) =>
  request("/me/api-keys", { method: "POST", body: JSON.stringify({ name }) });

export const revokeMyApiKey = (keyId) => request(`/me/api-keys/${keyId}`, { method: "DELETE" });
