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
  const path = `/orgs/${encodeURIComponent(orgId)}/provider-keys/${method === "GET" ? "metadata" : provider}`;
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
    if (!data || String(data.organization_id) !== String(orgId) || data.owner_scope !== "ORGANIZATION" ||
        typeof data.configured !== "boolean" || (data.configured && !PROVIDERS.includes(data.provider)) ||
        !Array.isArray(data.allowed_actions)) throw new ConnectionsError("unavailable");
    // Never retain credential versions, admin identifiers, or arbitrary API fields.
    return { configured: data.configured, provider: data.configured ? data.provider : null,
      canReplace: data.allowed_actions.includes("replace"), canRemove: data.allowed_actions.includes("remove") };
  } catch (error) {
    if (error instanceof ConnectionsError) throw error;
    throw new ConnectionsError("unavailable");
  }
}

export const getConnection = (orgId, signal) => request(orgId, "GET", undefined, undefined, signal);
export const putConnection = (orgId, provider, apiKey, signal) => request(orgId, "PUT", provider, apiKey, signal);
export const removeConnection = (orgId, provider, signal) => request(orgId, "DELETE", provider, undefined, signal);
