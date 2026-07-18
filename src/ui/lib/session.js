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

// ── OAuth2 SSO ────────────────────────────────────────────────────────────────
// Web build only — the Electron app keeps email/password per its landing
// page copy. Electron also disables webSecurity, so a provider's redirect
// back to a browser origin wouldn't land inside the app window anyway.
export function isElectron() {
  return !!(window.electronAPI || window.api);
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

// Reads the query params the auth-service's GET /auth/{provider}/callback
// redirects back with — status=ok|link_required|error, see omnibioai-auth's
// routes_oauth.py — applies them, and strips them from the URL so a page
// refresh doesn't reprocess a stale token or link_token. Returns null if
// there was nothing OAuth-related to process. Path-agnostic (keys off query
// params, not pathname) since it's not yet settled which URL in production
// the provider redirect actually lands the browser on.
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

  // Drop the query string so refresh/back doesn't replay a one-time token.
  window.history.replaceState({}, "", url.pathname);

  return result;
}

export function oauthProviders() {
  return OAUTH_PROVIDERS;
}
