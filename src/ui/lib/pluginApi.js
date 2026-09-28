import { isElectron } from "./session";

const BASE = "/_svc/workbench";
const SLUG = /^[a-z0-9][a-z0-9_-]*$/;
const ENDPOINT = /^\/plugins\/[a-z0-9][a-z0-9_-]*\/api\/(run|status|log|artifacts|file)\/(?:[A-Za-z0-9_-]+\/)?$/;
const NATIVE_RENDERERS = new Set(["async_analysis", "generic_runner"]);
const ASYNC_CAPABILITIES = ["submit", "status", "logs", "artifacts", "downloads"];
const ASYNC_ENDPOINTS = ["submit", "status", "logs", "artifacts", "download"];

export class PluginDescriptorError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "PluginDescriptorError";
    this.status = status;
  }
}

function serviceUrl(path, { electron = isElectron(), development = import.meta.env.DEV } = {}) {
  const origin = electron ? (development ? "http://localhost:5174" : "http://localhost") : "";
  return `${origin}${BASE}${path}`;
}

export function pluginDescriptorUrl(slug, options) {
  if (typeof slug !== "string" || !SLUG.test(slug)) throw new Error("Invalid plugin identifier.");
  return serviceUrl(`/plugins/${slug}/api/ui-schema/`, options);
}

export function endpointUrl(path, options) {
  if (typeof path !== "string" || path.includes("..") || path.includes("//") || !ENDPOINT.test(path)) {
    throw new Error("Invalid plugin endpoint.");
  }
  return serviceUrl(path, options);
}

function validateField(field) {
  if (!field || typeof field.id !== "string" || !SLUG.test(field.id)) throw new PluginDescriptorError("Invalid plugin input schema.");
  const component = field.component ?? field.widget;
  if (!["file", "text", "textarea"].includes(component) || typeof field.format !== "string") throw new PluginDescriptorError("Unsupported plugin input schema.");
  if (field.component && field.widget && field.component !== field.widget) throw new PluginDescriptorError("Invalid plugin input schema.");
  if (typeof field.label !== "string" || typeof field.description !== "string" || typeof field.required !== "boolean") {
    throw new PluginDescriptorError("Invalid plugin input schema.");
  }
  if (field.accept !== undefined && typeof field.accept !== "string") throw new PluginDescriptorError("Invalid plugin input schema.");
  return field;
}

export function validatePluginDescriptor(data, slug) {
  if (data?.schema_version !== 1 || data?.plugin?.slug !== slug || typeof data.renderer !== "string" || typeof data.native_supported !== "boolean") {
    throw new PluginDescriptorError("Workbench returned an invalid plugin descriptor.");
  }
  if (!data.native_supported) return data;
  if (!NATIVE_RENDERERS.has(data.renderer) || !Array.isArray(data.inputs) || !Array.isArray(data.outputs) || !data.endpoints) {
    throw new PluginDescriptorError("Unsupported plugin renderer.");
  }
  const metadata = data.plugin;
  if (["name", "version", "description", "category"].some(key => typeof metadata[key] !== "string")) {
    throw new PluginDescriptorError("Invalid plugin metadata.");
  }
  if (!data.capabilities || typeof data.capabilities !== "object" || Array.isArray(data.capabilities)) {
    throw new PluginDescriptorError("Invalid plugin capability schema.");
  }
  if (ASYNC_CAPABILITIES.some(key => data.capabilities[key] !== true)) {
    throw new PluginDescriptorError("Invalid plugin capability schema.");
  }
  if (Object.keys(data.capabilities).some(key => !ASYNC_CAPABILITIES.includes(key))) {
    throw new PluginDescriptorError("Unsupported plugin capability.");
  }
  if (Object.keys(data.endpoints).some(key => !ASYNC_ENDPOINTS.includes(key))) {
    throw new PluginDescriptorError("Unsupported plugin endpoint role.");
  }
  data.inputs.forEach(validateField);
  data.outputs.forEach(output => {
    if (!output || typeof output.id !== "string" || !SLUG.test(output.id) || typeof output.label !== "string" || typeof output.format !== "string") {
      throw new PluginDescriptorError("Invalid plugin output schema.");
    }
  });
  for (const key of ASYNC_ENDPOINTS) {
    if (typeof data.endpoints[key] !== "string") throw new PluginDescriptorError("Invalid plugin endpoint schema.");
    const endpoint = data.endpoints[key].replace("{run_id}", "placeholder");
    endpointUrl(endpoint);
  }
  return data;
}

export async function loadPluginDescriptor(slug, { signal, options } = {}) {
  const response = await fetch(pluginDescriptorUrl(slug, options), {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new PluginDescriptorError(`Unable to load plugin descriptor (${response.status}).`, response.status);
  let data;
  try { data = await response.json(); }
  catch { throw new PluginDescriptorError("Workbench returned an invalid plugin descriptor."); }
  return validatePluginDescriptor(data, slug);
}

export function csrfToken() {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function pluginEndpoint(path, options) {
  return endpointUrl(path, options);
}
