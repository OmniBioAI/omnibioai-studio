import { getToken, isElectron, refresh } from "./session";

function host() {
  return window.__OMNIBIOAI_SERVER__ || import.meta.env.VITE_HOST || "webstudio.omnibioai.org";
}

export function tesUrl(path) {
  return isElectron() ? `http://${host()}:8081${path}` : `/_tes${path}`;
}

let refreshInFlight = null;

async function refreshSession() {
  if (!refreshInFlight) refreshInFlight = refresh().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function tesApiFetch(path, options = {}) {
  const send = () => {
    const token = getToken();
    return fetch(tesUrl(path), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      signal: options.signal || AbortSignal.timeout(10000),
    });
  };
  let response = await send();
  if (response.status === 401 && await refreshSession()) response = await send();
  if (!response.ok) throw new Error(`TES request failed (${response.status})`);
  return response.json();
}
