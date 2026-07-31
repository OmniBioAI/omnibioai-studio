// Client for the role-management endpoints added to omnibioai-auth (Session 1).
//
// Spelled "../lib/session" rather than the shorter sibling-relative
// "./session" (this file already lives in lib/) on purpose: vite.config.js's
// web-build alias, which swaps this import for the web-only session module
// (same-origin /auth/* instead of a direct http://<lan-ip>:8001 fetch),
// matches on a literal "lib/session" segment -- "./session" silently missed
// it, so the web build kept the Electron session module's hardcoded-LAN-IP
// authUrl() and every Roles/Users fetch failed in production (issue #16).
// Both spellings resolve to the exact same file; this one is just visible
// to that alias.
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

export const listRoles = () => request("/roles");

export const createRole = (name, permissions) =>
  request("/roles", { method: "POST", body: JSON.stringify({ name, permissions }) });

export const getRole = (roleId) => request(`/roles/${roleId}`);

export const updateRole = (roleId, permissions) =>
  request(`/roles/${roleId}`, { method: "PUT", body: JSON.stringify({ permissions }) });

export const deleteRole = (roleId) => request(`/roles/${roleId}`, { method: "DELETE" });

export const getUserRoles = (userId) => request(`/users/${userId}/roles`);

export const setUserRoles = (userId, roles) =>
  request(`/users/${userId}/roles`, { method: "PUT", body: JSON.stringify({ roles }) });
