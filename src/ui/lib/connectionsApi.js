import { authUrl, getSessionVersion, getToken } from "../lib/session";

const PROVIDERS = ["openai", "claude"];
export class ConnectionsError extends Error {
  constructor(code) { super(code); this.code = code; }
}

async function request(orgId, method, provider, apiKey, signal) {
  const token = getToken(), version = getSessionVersion();
  if (!token || !/^\d+$/.test(String(orgId))) throw new ConnectionsError("denied");
  if (method !== "GET" && !PROVIDERS.includes(provider)) throw new ConnectionsError("validation");
  if (method === "PUT" && (typeof apiKey !== "string" || !/^[!-~]{1,512}$/.test(apiKey))) throw new ConnectionsError("validation");
  const path = `/orgs/${encodeURIComponent(orgId)}/provider-keys${method === "GET" ? "" : `/${provider}`}`;
  try {
    const response = await fetch(authUrl(path), {
      method, signal, cache: "no-store", credentials: "omit",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(method === "PUT" ? { "Content-Type": "application/json" } : {}) },
      ...(method === "PUT" ? { body: JSON.stringify({ api_key: apiKey }) } : {}),
    });
    if (token !== getToken() || version !== getSessionVersion()) throw new ConnectionsError("stale");
    if ([401, 403].includes(response.status)) throw new ConnectionsError("denied");
    if ([400, 422].includes(response.status)) throw new ConnectionsError("validation");
    if (!response.ok) throw new ConnectionsError("unavailable");
    // Mutation responses are intentionally not parsed: refresh safe metadata instead.
    if (method !== "GET") return;
    const data = await response.json();
    if (token !== getToken() || version !== getSessionVersion()) throw new ConnectionsError("stale");
    if (!data || typeof data.has_key !== "boolean" ||
        !(data.provider === null || PROVIDERS.includes(data.provider)) ||
        (data.has_key && data.provider === null)) throw new ConnectionsError("unavailable");
    // Auth's ProviderKeyOut is metadata-only; organization scope comes from
    // the request path. GET, PUT and DELETE all enforce manage_org server-side.
    // A successful GET therefore permits showing management controls; Auth
    // checks permissions again on every mutation. Never retain arbitrary fields.
    return { configured: data.has_key, provider: data.has_key ? data.provider : null,
      canReplace: true, canRemove: true };
  } catch (error) {
    if (error instanceof ConnectionsError) throw error;
    throw new ConnectionsError("unavailable");
  }
}

export const getConnection = (orgId, signal) => request(orgId, "GET", undefined, undefined, signal);
export const putConnection = (orgId, provider, apiKey, signal) => request(orgId, "PUT", provider, apiKey, signal);
export const removeConnection = (orgId, provider, signal) => request(orgId, "DELETE", provider, undefined, signal);
