// Web-build session layer. Isolated copy of ../session.js — NOT imported by
// any Electron code path, and does not modify the original file. Swapped in
// for the "../lib/session" import only under `vite build --mode web` via the
// resolve.alias in vite.config.js, so the Electron build is unaffected.
//
// The only real difference from ../session.js: authUrl() below is relative
// (same-origin) instead of a direct http://<lan-ip>:8001 fetch. A browser at
// https://webstudio.omnibioai.org can't reach a private Docker-network host on a
// raw port — it has to go through nginx-router.conf's `location ^~ /auth/`
// passthrough (docker/nginx-router.conf), which forwards to auth-service
// with no path rewrite — auth-service's own routes already live under
// /auth/*, so every call site below (which already passes a path starting
// with "/auth/...") just needs that path used as-is, same-origin.

const TOKEN_KEY = "omnibioai_access_token";
const REFRESH_TOKEN_KEY = "omnibioai_refresh_token";
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

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

// Control Center is loaded in an <iframe src="/_svc/control">, which can't
// carry the Authorization header the rest of the app authenticates with —
// an iframe navigation can only send what the browser attaches
// automatically, i.e. cookies. nginx-router.conf's /internal/auth/verify
// falls back to this same-named cookie when no Authorization header is
// present (see its $control_authorization map), so it must be kept in sync
// with the token in localStorage.
function setTokenCookie(token) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${TOKEN_KEY}=${token}; path=/; SameSite=Lax${secure}`;
}

function clearTokenCookie() {
  document.cookie = `${TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function setSession(accessToken, refreshToken) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  setTokenCookie(accessToken);
  cachedUser = null;
  notify();
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  clearTokenCookie();
  cachedUser = null;
  notify();
}

// POSTs to /auth/logout with both tokens (revokes the refresh token
// server-side, blacklists the access token's jti for its remaining
// lifetime — see routes_auth.py's LogoutRequest/_blacklist_access_token).
// Fails open on any network/server error, same philosophy as that
// endpoint's own blacklist call: never let a logout attempt get stuck
// because the network call failed, always clear local state regardless.
export async function logout() {
  const refreshToken = getRefreshToken();
  const accessToken = getToken();
  if (refreshToken) {
    try {
      await fetch(authUrl("/auth/logout"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken, access_token: accessToken }),
      });
    } catch (_) {
      // fail open — clearSession() below still runs
    }
  }
  clearSession();
}

// POSTs to /auth/refresh; on success, re-runs setSession with the new
// access token (the refresh token itself isn't rotated — routes_auth.py's
// /auth/refresh echoes the same one back). Returns the new access token,
// or null (and clears the session) if the refresh token is invalid/expired.
export async function refresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(authUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      clearSession();
      return null;
    }
    const data = await res.json();
    setSession(data.access_token, data.refresh_token);
    return data.access_token;
  } catch (_) {
    return null;
  }
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
  setSession(data.access_token, data.refresh_token);
  return getCurrentUser({ force: true });
}

const LICENSE_ERROR_MESSAGES = {
  invalid_key: "Invalid license key",
  revoked: "This license key has been revoked",
  expired: "This license key has expired",
  usage_exhausted: "This license key has already been used",
  platform_mismatch: "This license key isn't valid for this platform",
  email_mismatch: "This license key isn't registered to that email",
};

export async function loginWithLicenseKey(key, email, platform = "web") {
  const res = await fetch(authUrl("/license/validate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, email, platform }),
  });
  const data = await res.json();
  if (!res.ok || !data.valid) {
    throw new Error(LICENSE_ERROR_MESSAGES[data.reason] || "License validation failed");
  }
  setSession(data.access_token, data.refresh_token);
  return getCurrentUser({ force: true });
}

export async function getCurrentUser({ force = false } = {}) {
  const token = getToken();
  if (!token) return null;
  // Re-assert the cookie on every session restore (app mount), not just at
  // login — localStorage survives a browser restart but a session cookie
  // (or one the user's browser otherwise dropped) doesn't, and that gap
  // would only surface as Control Center's iframe specifically 401ing
  // while the rest of the already-logged-in app kept working fine.
  setTokenCookie(token);
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
  setSession(data.access_token, data.refresh_token);
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
      setSession(params.get("access_token"), params.get("refresh_token"));
    }
  }

  window.history.replaceState({}, "", url.pathname);

  return result;
}

export function oauthProviders() {
  return OAUTH_PROVIDERS;
}
