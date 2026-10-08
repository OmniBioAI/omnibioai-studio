import { authUrl, getSessionVersion, getToken, isElectron } from "./session";

const WORKBENCH_PREFIX = "/_svc/workbench";
const PROVIDERS_PATH = "/plugins/integration_connections/providers/";
const AUTH_PATH = "/integrations/credentials";
const IDENTIFIER = /^[a-z0-9_]{1,64}$/;
const AUTH_TYPES = new Set(["none", "api_key", "optional_api_key", "token", "oauth2", "custom"]);
const SCOPES = new Set(["user", "organization", "platform"]);
const STATUSES = new Set([
  "NOT_CONFIGURED", "READY_NO_CREDENTIALS", "CONNECTED_USER",
  "CONNECTED_ORGANIZATION", "CONNECTED_PLATFORM",
]);

export class IntegrationsApiError extends Error {
  constructor(code) {
    super(code);
    this.name = "IntegrationsApiError";
    this.code = code;
  }
}

function workbenchUrl(path) {
  const origin = isElectron() ? (import.meta.env.DEV ? "http://localhost:5174" : "http://localhost") : "";
  return `${origin}${WORKBENCH_PREFIX}${path}`;
}

function safeId(value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new IntegrationsApiError("invalid");
  return value;
}

function codeFor(status) {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 400 || status === 422) return "invalid";
  return "unavailable";
}

async function request(url, { method = "GET", body, signal } = {}) {
  const token = getToken();
  const version = getSessionVersion();
  if (!token) throw new IntegrationsApiError("unauthorized");
  let response;
  try {
    response = await fetch(url, {
      method,
      signal,
      cache: "no-store",
      credentials: url.startsWith(WORKBENCH_PREFIX) || url.startsWith("http://localhost") ? "same-origin" : "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new IntegrationsApiError("unavailable");
  }
  if (token !== getToken() || version !== getSessionVersion()) throw new IntegrationsApiError("stale");
  if (!response.ok) throw new IntegrationsApiError(codeFor(response.status));
  if (response.status === 204) return null;
  let data;
  try { data = await response.json(); }
  catch { throw new IntegrationsApiError("invalid"); }
  if (token !== getToken() || version !== getSessionVersion()) throw new IntegrationsApiError("stale");
  return data;
}

function text(value, max = 1000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "";
}

function normalizeField(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IntegrationsApiError("invalid");
  const name = safeId(value.name);
  const label = text(value.label, 128);
  if (!label || typeof value.secret !== "boolean" || typeof value.required !== "boolean") throw new IntegrationsApiError("invalid");
  return Object.freeze({ name, label, secret: value.secret, required: value.required });
}

export function normalizeProvider(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IntegrationsApiError("invalid");
  const providerId = safeId(value.provider_id);
  const displayName = text(value.display_name, 128);
  const category = safeId(value.category);
  const description = text(value.description, 2000);
  const setupState = text(value.setup_state, 64);
  const auth = value.authentication;
  if (!displayName || !description || !setupState || !auth || typeof auth !== "object" || Array.isArray(auth) || !AUTH_TYPES.has(auth.type)) {
    throw new IntegrationsApiError("invalid");
  }
  if (!Array.isArray(value.plugin_slugs) || !value.plugin_slugs.length || value.plugin_slugs.some(slug => !IDENTIFIER.test(slug))) throw new IntegrationsApiError("invalid");
  if (!Array.isArray(value.capabilities) || value.capabilities.some(capability => typeof capability !== "string" || !capability.trim())) throw new IntegrationsApiError("invalid");
  if (!Array.isArray(auth.allowed_scopes) || auth.allowed_scopes.some(scope => !SCOPES.has(scope)) || typeof auth.anonymous_access !== "boolean" || !Array.isArray(auth.fields)) {
    throw new IntegrationsApiError("invalid");
  }
  return Object.freeze({
    providerId, displayName, category, description, setupState,
    pluginSlugs: Object.freeze([...value.plugin_slugs]),
    capabilities: Object.freeze(value.capabilities.map(capability => capability.trim())),
    connectionTestSupported: value.connection_test_supported === true,
    authentication: Object.freeze({
      type: auth.type,
      allowedScopes: Object.freeze([...auth.allowed_scopes]),
      anonymousAccess: auth.anonymous_access,
      fields: Object.freeze(auth.fields.map(normalizeField)),
    }),
  });
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IntegrationsApiError("invalid");
  const providerId = safeId(value.provider_id);
  if (!SCOPES.has(value.scope) || value.configured !== true || value.status !== "active") throw new IntegrationsApiError("invalid");
  return Object.freeze({ providerId, scope: value.scope, configured: true,
    maskedHint: typeof value.masked_hint === "string" ? value.masked_hint.slice(0, 32) : null,
    updatedAt: typeof value.updated_at === "string" ? value.updated_at : null });
}

function normalizeStatus(value, providerId) {
  if (!value || value.provider_id !== providerId || !STATUSES.has(value.status)) throw new IntegrationsApiError("invalid");
  const scope = value.scope;
  if (!(scope === null || scope === "anonymous" || SCOPES.has(scope))) throw new IntegrationsApiError("invalid");
  return Object.freeze({ status: value.status, scope });
}

export async function listIntegrationProviders({ signal } = {}) {
  const data = await request(workbenchUrl(PROVIDERS_PATH), { signal });
  if (!data || !Array.isArray(data.providers)) throw new IntegrationsApiError("invalid");
  return Object.freeze(data.providers.map(normalizeProvider));
}

export async function getIntegrationProvider(providerId, { signal } = {}) {
  const id = safeId(providerId);
  return normalizeProvider(await request(workbenchUrl(`${PROVIDERS_PATH}${encodeURIComponent(id)}/`), { signal }));
}

export async function listCredentialMetadata({ signal } = {}) {
  const data = await request(authUrl(AUTH_PATH), { signal });
  if (!Array.isArray(data)) throw new IntegrationsApiError("invalid");
  return Object.freeze(data.map(normalizeMetadata));
}

export async function getIntegrationStatus(providerId, { signal } = {}) {
  const id = safeId(providerId);
  return normalizeStatus(await request(authUrl(`${AUTH_PATH}/${encodeURIComponent(id)}/status`), { signal }), id);
}

export async function loadIntegrationCatalog({ signal } = {}) {
  const [providers, metadata] = await Promise.all([
    listIntegrationProviders({ signal }), listCredentialMetadata({ signal }),
  ]);
  const statuses = await Promise.all(providers.map(provider => getIntegrationStatus(provider.providerId, { signal })));
  return Object.freeze(providers.map((provider, index) => Object.freeze({
    ...provider,
    effectiveStatus: statuses[index].status,
    effectiveScope: statuses[index].scope,
    personalCredential: metadata.find(item => item.providerId === provider.providerId && item.scope === "user") || null,
  })));
}

function credentialPayload(provider, values) {
  if (!provider || typeof values !== "object" || Array.isArray(values) || !provider.authentication.allowedScopes.includes("user")) throw new IntegrationsApiError("invalid");
  const fields = new Map(provider.authentication.fields.map(field => [field.name, field]));
  if (Object.keys(values).some(name => !fields.has(name))) throw new IntegrationsApiError("invalid");
  const credentials = {};
  for (const [name, field] of fields) {
    const value = values[name];
    if (field.required && (typeof value !== "string" || !value.trim())) throw new IntegrationsApiError("invalid");
    if (typeof value === "string" && value.trim()) credentials[name] = value.trim();
  }
  if (!Object.keys(credentials).length) throw new IntegrationsApiError("invalid");
  return { credentials };
}

export async function savePersonalCredential(provider, values, { signal } = {}) {
  const providerId = safeId(provider?.providerId);
  const data = await request(authUrl(`${AUTH_PATH}/${encodeURIComponent(providerId)}/user`), {
    method: "PUT", body: credentialPayload(provider, values), signal,
  });
  return normalizeMetadata(data);
}

export async function revokePersonalCredential(providerId, { signal } = {}) {
  const id = safeId(providerId);
  await request(authUrl(`${AUTH_PATH}/${encodeURIComponent(id)}/user`), { method: "DELETE", signal });
}
