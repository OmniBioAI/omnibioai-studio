// Web-safe stand-in for window.api (electron/preload.js), for future
// web-only components. Standalone under src/ui/lib/web/ — not wired into
// any existing shared page in this pass (Launch.jsx, Services.jsx, etc.
// already guard every window.api.* call with `?.`, so they degrade safely
// without this file; wiring them to call webApi instead would mean editing
// those shared files, which is out of scope for this isolation-only pass).
//
// Deliberately does NOT invent endpoints that don't exist in the backend.
// nginx-router.conf (docker/nginx-router.conf) only exposes one generic
// health route — `/_health` (router-level, not per-service) — and no
// `/api/config` or `/api/logs/:service` routes exist anywhere in this repo.
// Per-service health is already checked directly by Launch.jsx/Services.jsx
// via their own relative /_svc/* fetches; this file doesn't duplicate that.

// Cloud/beta mode config — nothing to load, since there's no local Docker
// stack or data_dir to configure when connecting to an already-running
// backend. Mirrors the shape App.jsx expects from window.api.loadConfig().
export async function loadConfig() {
  return { mode: "beta", llm: {}, cloud: {}, hpc: {}, settings: {} };
}

// Best-effort, router-level only — does not indicate individual service
// health. See Launch.jsx's BETA_HEALTH_URLS / Services.jsx's HEALTH_URLS
// for the real per-service checks this app already does independently of
// window.api.
export async function checkHealth() {
  try {
    const res = await fetch("/_health", { signal: AbortSignal.timeout(3000) });
    return { ok: res.ok };
  } catch (_) {
    return { ok: false };
  }
}

// No local Docker to control in web/cloud mode — the backend is already
// running. Matches window.api.startDocker()/stopDocker()'s promise shape so
// callers don't need to branch on return value.
export async function startDocker() {
  return { web: true, message: "Cloud services are already running — nothing to start." };
}

export async function stopDocker() {
  return { web: true, message: "Cloud services are managed centrally — nothing to stop here." };
}

// No IPC log stream exists for a browser client. Calls back once with an
// informational line (matching window.api.streamLogs' callback shape) and
// returns a no-op unsubscribe — never opens a connection to an endpoint
// that doesn't exist.
export function streamLogs(callback) {
  callback?.("Live log streaming isn't available in web mode.");
  return () => {};
}

// Auto-update is an Electron/electron-updater concept (electron/updater.js)
// — not applicable to a browser tab.
export async function checkUpdate() {
  return { available: false, web: true };
}

export async function getPlatform() {
  return {
    platform: "web",
    version: import.meta.env.VITE_VERSION || "0.6.0-beta",
  };
}
