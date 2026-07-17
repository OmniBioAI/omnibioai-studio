// Minimal session layer for omnibioai-studio.
//
// Provider-agnostic by design: `setSession(accessToken)` is the single entry
// point that stores a token and refreshes the cached user, regardless of how
// the token was obtained. `loginWithPassword` is today's only provider; OAuth2
// SSO (Google/GitHub/Microsoft, a later session) should add its own
// `loginWithOAuthToken`-style function that also just calls `setSession`.

const AUTH_PORT = 8001;
const TOKEN_KEY = "omnibioai_access_token";
const SESSION_EVENT = "omnibioai-session-changed";

function getHostIp() {
  return (
    window.__OMNIBIOAI_CONFIG__?.hostIp ||
    localStorage.getItem("omnibioai_host_ip") ||
    "192.168.86.234"
  );
}

export function authUrl(path) {
  return `http://${getHostIp()}:${AUTH_PORT}${path}`;
}

let cachedUser = null;

function notify() {
  window.dispatchEvent(new CustomEvent(SESSION_EVENT));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(accessToken) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  cachedUser = null;
  notify();
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  cachedUser = null;
  notify();
}

export async function loginWithPassword(email, password) {
  const res = await fetch(authUrl("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? "Invalid email or password" : "Login failed");
  }
  const data = await res.json();
  setSession(data.access_token);
  return getCurrentUser({ force: true });
}

export async function getCurrentUser({ force = false } = {}) {
  const token = getToken();
  if (!token) return null;
  if (cachedUser && !force) return cachedUser;

  try {
    const res = await fetch(authUrl("/auth/validate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!data.valid) {
      clearSession();
      return null;
    }
    cachedUser = {
      userId: data.user_id,
      email: data.email,
      roles: data.roles || [],
      permissions: data.permissions || [],
    };
    return cachedUser;
  } catch (_) {
    return null;
  }
}

export function getCurrentUserSync() {
  return cachedUser;
}

export function hasPermission(permission) {
  return !!cachedUser?.permissions?.includes(permission);
}

export function onSessionChange(callback) {
  window.addEventListener(SESSION_EVENT, callback);
  return () => window.removeEventListener(SESSION_EVENT, callback);
}
