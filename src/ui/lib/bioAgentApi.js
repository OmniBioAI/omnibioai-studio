import { csrfToken } from "./pluginApi";

const BASE = "/_svc/workbench/plugins/bio_agent/";

async function readJson(response) {
  if (response.status === 401) throw new Error("Your session expired. Sign in again to continue.");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.response || "OmniBioAgent request failed.");
  return payload;
}

export async function loadBioAgentContext({ signal } = {}) {
  return readJson(await fetch(`${BASE}chat_context/`, { credentials: "same-origin", headers: { Accept: "application/json" }, signal }));
}

export async function checkBioAgentModel(model, { signal } = {}) {
  const body = new URLSearchParams({ model_name: model });
  return readJson(await fetch(`${BASE}check_model/`, {
    method: "POST", credentials: "same-origin", signal,
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "X-CSRFToken": csrfToken() }, body,
  }));
}

export async function sendBioAgentPrompt(values, { signal } = {}) {
  const body = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") body.set(key, String(value));
  });
  return readJson(await fetch(`${BASE}chat_response/`, {
    method: "POST", credentials: "same-origin", signal,
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "X-CSRFToken": csrfToken() }, body,
  }));
}

export async function uploadBioAgentFile(file, { signal } = {}) {
  const body = new FormData(); body.append("file", file);
  return readJson(await fetch(`${BASE}upload_input_file/`, {
    method: "POST", credentials: "same-origin", signal,
    headers: { Accept: "application/json", "X-CSRFToken": csrfToken() }, body,
  }));
}

export async function loadBioAgentStatus(kind, id, { signal } = {}) {
  const safeId = encodeURIComponent(id);
  const path = kind === "tes" ? `tes/run/${safeId}/` : kind === "planner" ? `planner-status/${safeId}/` : `bioquery/ask/${safeId}/`;
  return readJson(await fetch(`${BASE}${path}`, { credentials: "same-origin", headers: { Accept: "application/json" }, signal }));
}
