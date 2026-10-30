import { csrfToken } from "./pluginApi";
import { isElectron } from "./session";

const IDENTIFIER = /^[A-Za-z0-9_.:-]+$/;

function serviceUrl(plugin, path, { electron = isElectron(), development = import.meta.env.DEV } = {}) {
  const origin = electron ? (development ? "http://localhost:5174" : "http://localhost") : "";
  return `${origin}/_svc/workbench/plugins/${plugin}${path}`;
}

async function request(plugin, path, { method = "GET", body, signal } = {}) {
  const response = await fetch(serviceUrl(plugin, path), {
    method, signal, credentials: "same-origin", cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "X-CSRFToken": csrfToken() }),
    },
  });
  let payload = {};
  try { payload = await response.json(); } catch { /* normalized below */ }
  if (!response.ok) {
    const error = new Error(payload.detail || payload.message || payload.error || payload.code || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function workflowName(name) {
  const value = String(name || "").trim();
  if (!value || value.length > 200 || /[\u0000-\u001f/\\]/.test(value)) throw new Error("Enter a valid workflow name.");
  return encodeURIComponent(value);
}

function executionId(value) {
  if (!IDENTIFIER.test(value || "")) throw new Error("Invalid execution identifier.");
  return encodeURIComponent(value);
}

export const workflowBuilderApi = {
  palette: options => request("workflow_builder", "/api/palette/", options),
  list: options => request("workflow_builder", "/api/workflows/", options),
  get: (name, options) => request("workflow_builder", `/api/workflows/${workflowName(name)}/`, options),
  save: (name, spec, options) => request("workflow_builder", "/api/workflows/save/", { ...options, method: "POST", body: { name, spec } }),
  remove: (name, options) => request("workflow_builder", `/api/workflows/${workflowName(name)}/delete/`, { ...options, method: "POST", body: {} }),
  execute: (name, options) => request("workflow_builder", `/api/workflows/${workflowName(name)}/execute/`, { ...options, method: "POST", body: {} }),
  execution: (id, options) => request("workflow_builder", `/api/executions/${executionId(id)}/`, options),
  cancel: (id, options) => request("workflow_builder", `/api/executions/${executionId(id)}/cancel/`, { ...options, method: "POST", body: {} }),
};

export const workflowCompilerApi = {
  compileWorkflow: (workflow, options) => request("workflow_compiler", "/compile/", { ...options, method: "POST", body: { workflow } }),
  compileSkills: (skills, options) => request("workflow_compiler", "/compile/", { ...options, method: "POST", body: { input_mode: "skill_files", skills } }),
};
