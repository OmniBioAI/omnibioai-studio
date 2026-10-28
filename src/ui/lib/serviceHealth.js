import { useSyncExternalStore } from "react";

/** @typedef {"up" | "down" | "degraded" | "unknown"} HealthState */

/**
 * @typedef {Object} ServiceHealth
 * @property {HealthState} state
 * @property {string} reason
 */

export const HEALTH_STATES = Object.freeze(["up", "down", "degraded", "unknown"]);

export const HEALTH_ENDPOINTS = Object.freeze({
  "api-gateway": "/_svc/gateway",
  "auth-service": "/_svc/auth",
  "policy-engine": "/_svc/policy",
  "hpc-policy-engine": "/_svc/hpc",
  "security-audit": "/_svc/audit",
  workbench: "/_svc/workbench",
  tes: "/_svc/tes",
  toolserver: "/_svc/toolserver",
  rag: "/_svc/rag",
  "model-registry": "/_svc/modelregistry",
  "dev-hub": "/_svc/devhub",
  "control-center": "/_svc/control/health",
  ollama: "/_svc/ollama",
  lims: "/_svc/lims/",
});

const DESKTOP_HEALTH_KEYS = Object.freeze([
  "mysql", "redis", "workbench", "tes", "toolserver", "ollama", "rag",
]);
const listeners = new Set();
let snapshot = Object.freeze({});

/** @returns {ServiceHealth} */
export function unknownHealth(reason = "This service has not been checked yet.") {
  return Object.freeze({ state: "unknown", reason });
}

/** @param {string} key @param {HealthState} state @param {string} reason */
export function setServiceHealth(key, state, reason) {
  if (!HEALTH_STATES.includes(state)) throw new TypeError(`Invalid health state: ${state}`);
  if (!reason?.trim()) throw new TypeError("A health reason is required");
  const previous = snapshot[key];
  if (previous?.state === state && previous.reason === reason) return;
  snapshot = Object.freeze({ ...snapshot, [key]: Object.freeze({ state, reason }) });
  listeners.forEach(listener => listener());
}

export function getServiceHealth(key) {
  return snapshot[key] || unknownHealth();
}

export function useServiceHealth() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => snapshot,
    () => snapshot,
  );
}

async function probeEndpoint(key, url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (response.status < 500) {
      setServiceHealth(key, "up", `Health endpoint responded with HTTP ${response.status}.`);
    } else {
      setServiceHealth(key, "down", `Health endpoint responded with HTTP ${response.status}.`);
    }
  } catch (_) {
    setServiceHealth(key, "unknown", "The health endpoint could not be reached.");
  }
}

/** Refreshes the canonical health records used by both Mode and Services. */
export async function refreshServiceHealth(keys) {
  const requested = new Set(keys);
  await Promise.all(Object.entries(HEALTH_ENDPOINTS)
    .filter(([key]) => requested.has(key))
    .map(([key, url]) => probeEndpoint(key, url)));

  if (window.api?.checkHealth && DESKTOP_HEALTH_KEYS.some(key => requested.has(key))) {
    try {
      const result = await window.api.checkHealth();
      DESKTOP_HEALTH_KEYS.filter(key => requested.has(key)).forEach(key => {
        if (typeof result?.[key] !== "boolean") {
          setServiceHealth(key, "unknown", "The desktop health check did not report this service.");
          return;
        }
        if (key === "ollama" && !result[key]) {
          setServiceHealth(key, "degraded", "The desktop readiness check reports that Ollama is still starting or not ready.");
        } else {
          setServiceHealth(
            key,
            result[key] ? "up" : "down",
            result[key] ? "The desktop health check passed." : "The desktop health check reported the service as unavailable.",
          );
        }
      });
    } catch (_) {
      DESKTOP_HEALTH_KEYS.filter(key => requested.has(key))
        .forEach(key => setServiceHealth(key, "unknown", "The desktop health check did not complete."));
    }
  }

  keys.filter(key => !HEALTH_ENDPOINTS[key] && !snapshot[key])
    .forEach(key => setServiceHealth(key, "unknown", "No health check is configured for this service."));
}
