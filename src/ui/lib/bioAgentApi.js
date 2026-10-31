import { csrfToken } from "./pluginApi";
import { getToken, refresh } from "../lib/session";

const BASE = "/_svc/workbench/plugins/bio_agent/";

async function readJson(response) {
  if (response.status === 401) throw new Error("Your session expired. Sign in again to continue.");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.response || "OmniBioAgent request failed.");
  return payload;
}

// All Agent requests pass through the same same-origin proxy as the rest of
// Workbench. Send Studio's current access token explicitly: the browser's
// Django session cookie can outlive (or disagree with) the Studio login, and
// a stale token must not turn an otherwise signed-in chat into a false expiry.
let refreshInFlight;

async function refreshAgentSession() {
  if (!refreshInFlight) {
    refreshInFlight = refresh().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function requestBioAgent(url, init = {}) {
  const initialToken = getToken();
  const send = (token) => {
    const headers = new Headers(init.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, { ...init, credentials: "same-origin", headers });
  };

  let response = await send(initialToken);
  if (response.status === 401) {
    // Another request or the app's periodic refresh may already have renewed
    // the session while this request was in flight. Reuse it before refreshing.
    const currentToken = getToken();
    const renewedToken = currentToken && currentToken !== initialToken
      ? currentToken
      : await refreshAgentSession() || (getToken() !== initialToken ? getToken() : null);
    if (renewedToken) response = await send(renewedToken);
  }
  return readJson(response);
}

export async function loadBioAgentContext({ signal } = {}) {
  return requestBioAgent(`${BASE}chat_context/`, { headers: { Accept: "application/json" }, signal });
}

export async function checkBioAgentModel(model, { signal } = {}) {
  const body = new URLSearchParams({ model_name: model });
  return requestBioAgent(`${BASE}check_model/`, {
    method: "POST", signal,
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "X-CSRFToken": csrfToken() }, body,
  });
}

export async function sendBioAgentPrompt(values, { signal } = {}) {
  const body = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") body.set(key, String(value));
  });
  return requestBioAgent(`${BASE}chat_response/`, {
    method: "POST", signal,
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "X-CSRFToken": csrfToken() }, body,
  });
}

export async function uploadBioAgentFile(file, { signal } = {}) {
  const body = new FormData(); body.append("file", file);
  return requestBioAgent(`${BASE}upload_input_file/`, {
    method: "POST", signal,
    headers: { Accept: "application/json", "X-CSRFToken": csrfToken() }, body,
  });
}

export async function loadBioAgentStatus(kind, id, { signal } = {}) {
  const safeId = encodeURIComponent(id);
  const path = kind === "tes" ? `tes/run/${safeId}/` : kind === "planner" ? `planner-status/${safeId}/` : `bioquery/ask/${safeId}/`;
  return requestBioAgent(`${BASE}${path}`, { headers: { Accept: "application/json" }, signal });
}
