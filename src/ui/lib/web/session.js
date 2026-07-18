// Web-build session layer. Isolated copy of ../session.js — NOT imported by
// any Electron code path, and does not modify the original file. Swapped in
// for the "../lib/session" import only under `vite build --mode web` via the
// resolve.alias in vite.config.js, so the Electron build is unaffected.
//
// The only real difference from ../session.js: authUrl() below is relative
// (same-origin) instead of a direct http://<lan-ip>:8001 fetch. A browser at
// https://app.omnibioai.org can't reach a private Docker-network host on a
// raw port — it has to go through nginx-router.conf's `location ^~ /auth/`
// passthrough (docker/nginx-router.conf), which forwards to auth-service
// with no path rewrite — auth-service's own routes already live under
// /auth/*, so every call site below (which already passes a path starting
// with "/auth/...") just needs that path used as-is, same-origin.

const TOKEN_KEY = "omnibioai_access_token";
const SESSION_EVENT = "omnibioai-session-changed";

export function authUrl(path) {
  return path;
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

// Always true here — this module only ever loads inside the web build.
export function isElectron() {
  return false;
}

const OAUTH_PROVIDERS = ["google", "github", "microsoft"];

export function getOAuthLoginUrl(provider) {
  return authUrl(`/auth/${provider}/login`);
}

export async function confirmOAuthLink(linkToken, password) {
  const res = await fetch(authUrl("/auth/link/confirm"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ link_token: linkToken, password }),
  });
  if (!res.ok) {
    let detail = "Could not confirm the link";
    try {
      detail = (await res.json())?.detail || detail;
    } catch (_) {
      // no JSON body
    }
    throw new Error(detail);
  }
  const data = await res.json();
  setSession(data.access_token);
  return getCurrentUser({ force: true });
}

export function consumeOAuthRedirectParams() {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  const status = params.get("status");
  if (!status) return null;

  let result;
  if (status === "error") {
    result = { type: "error", message: params.get("error") || "Sign-in failed" };
  } else if (status === "link_required") {
    result = {
      type: "link_required",
      linkToken: params.get("link_token"),
      provider: params.get("provider"),
      email: params.get("email"),
    };
  } else {
    result = { type: "success" };
    if (params.has("access_token")) {
      setSession(params.get("access_token"));
    }
  }

  window.history.replaceState({}, "", url.pathname);

  return result;
}

export function oauthProviders() {
  return OAUTH_PROVIDERS;
}
