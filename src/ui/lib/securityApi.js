// Personal-security client for canonical omnibioai-auth endpoints. Identity
// remains in session.js; this module only owns MFA-device and session calls.
import { authUrl, clearSession, getSessionVersion, getToken } from "../lib/session";

async function request(path, options = {}) {
  const token = getToken();
  const version = getSessionVersion();
  const res = await fetch(authUrl(path), {
    ...options,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    credentials: "omit",
    cache: "no-store",
  });

  if (version !== getSessionVersion() || token !== getToken()) return null;
  if (res.status === 401) {
    clearSession();
    return null;
  }
  if (!res.ok) {
    const error = new Error("Personal security service unavailable. Please try again.");
    error.status = res.status;
    throw error;
  }
  if (res.status === 204) return null;
  const data = await res.json();
  if (version !== getSessionVersion() || token !== getToken()) return null;
  return data;
}

export const listMfaDevices = ({ signal } = {}) =>
  request("/users/me/mfa/devices", { signal });

export const listSessions = ({ signal } = {}) =>
  request("/sessions", { signal });

export const revokeSession = (sessionId, { signal } = {}) =>
  request(`/sessions/${encodeURIComponent(sessionId)}/revoke`, { method: "POST", signal });
