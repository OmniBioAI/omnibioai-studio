// Client for the role-management endpoints added to omnibioai-auth (Session 1).
import { authUrl, getToken, clearSession } from "./session";

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
