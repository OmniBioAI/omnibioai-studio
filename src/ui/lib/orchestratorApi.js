import { csrfToken } from "./pluginApi";
import { isElectron } from "./session";

const BASE = "/_svc/workbench/plugins/multi_agent_bio_orchestrator";
const RUN_ID = /^[A-Za-z0-9_.:-]+$/;

function serviceUrl(path, { electron = isElectron(), development = import.meta.env.DEV } = {}) {
  const origin = electron ? (development ? "http://localhost:5174" : "http://localhost") : "";
  return `${origin}${BASE}${path}`;
}

function checkedRunId(runId) {
  if (typeof runId !== "string" || !RUN_ID.test(runId)) throw new Error("Invalid orchestrator run identifier.");
  return encodeURIComponent(runId);
}

async function request(path, { method = "GET", body, signal } = {}) {
  const response = await fetch(serviceUrl(path), {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "X-CSRFToken": csrfToken() }),
    },
  });
  let payload = {};
  try { payload = await response.json(); } catch { /* normalized below */ }
  if (!response.ok) {
    const error = new Error(payload.error || payload.detail || `Orchestrator request failed (${response.status}).`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function submitOrchestratorRun({ dag, modelName }, options) {
  return request("/api/run/", { ...options, method: "POST", body: { dag, model_name: modelName } });
}

export function dryRunOrchestrator({ dag }, options) {
  return request("/api/dry-run/", { ...options, method: "POST", body: { dag } });
}

export function loadOrchestratorStatus(runId, options) {
  return request(`/api/status/${checkedRunId(runId)}/`, options);
}

export function loadOrchestratorStatusDetail(runId, options) {
  return request(`/api/status/${checkedRunId(runId)}/detail/`, options);
}

export function loadOrchestratorLog(runId, options) {
  return request(`/api/log/${checkedRunId(runId)}/?n=500`, options);
}

export function loadOrchestratorArtifacts(runId, options) {
  return request(`/api/artifacts/${checkedRunId(runId)}/`, options);
}

export function cancelOrchestratorRun(runId, options) {
  return request(`/api/cancel/${checkedRunId(runId)}/`, { ...options, method: "POST", body: {} });
}

export function replayOrchestratorRun(runId, options) {
  return request(`/api/replay/${checkedRunId(runId)}/`, { ...options, method: "POST", body: {} });
}

export function loadOrchestratorRuns(options) {
  return request("/api/runs/?sort_by=created_at_desc&per_page=50", options);
}

export { serviceUrl as orchestratorServiceUrl };
