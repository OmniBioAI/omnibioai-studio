import { isElectron } from "./session";
import { hasOnlyKeys, isDataPath, isRecord, OPAQUE_ARTIFACT_ID, scientificReferenceTypesForPlugin, validArtifactPresentation, validBatchField, validColumns, validDetailDescriptor, validFilterDescriptor, validFiniteChoices, validPaginationDescriptor } from "./pluginUiContracts";

const BASE = "/_svc/workbench";
const SLUG = /^[a-z0-9][a-z0-9_-]*$/;
const FIELD_ID = /^[a-z][a-z0-9_]*$/;
const FORBIDDEN_FIELD_IDS = new Set(["constructor", "prototype", "__proto__", "password", "token", "secret", "api_key", "credentials"]);
const ENDPOINT = /^\/plugins\/[a-z0-9][a-z0-9_-]*\/(?:api\/)?(?:run|status|log|artifacts|file|render|search|studies|experiments|variants|pathways|genes|ui-query|ui-detail|ui-reference|ui-artifacts)\/(?:[A-Za-z0-9_.:{}-]+\/){0,3}(?:\?[^#]*)?$/;
const RUN_ID = /^[A-Za-z0-9_.:-]+$/;
const NATIVE_RENDERERS = new Set(["async_analysis", "generic_runner", "informational", "query"]);
const ASYNC_REQUIRED_CAPABILITIES = ["submit", "status", "logs", "artifacts", "downloads"];
const ASYNC_CAPABILITIES = [...ASYNC_REQUIRED_CAPABILITIES, "render"];
const ASYNC_REQUIRED_ENDPOINTS = ["submit", "status", "logs", "artifacts", "download"];
const ASYNC_ENDPOINTS = [...ASYNC_REQUIRED_ENDPOINTS, "render"];
const QUERY_CAPABILITIES = ["query", "detail"];
const QUERY_ENDPOINTS = ["query", "detail"];

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

export function pluginArtifactDownloadUrl(slug, runId, artifactId, options) {
  if (typeof slug !== "string" || !SLUG.test(slug) || typeof runId !== "string" || !RUN_ID.test(runId) ||
      typeof artifactId !== "string" || !OPAQUE_ARTIFACT_ID.test(artifactId)) {
    throw new Error("Invalid artifact identity.");
  }
  return serviceUrl(`/plugins/${slug}/api/ui-artifacts/${runId}/${artifactId}/download/`, options);
}

function validateField(field) {
  if (!field || typeof field.id !== "string" || !FIELD_ID.test(field.id) || FORBIDDEN_FIELD_IDS.has(field.id)) throw new PluginDescriptorError("Invalid plugin input schema.");
  const component = field.component ?? field.widget;
  if (!["file", "text", "textarea", "select", "checkbox", "multiselect"].includes(component) || typeof field.format !== "string") throw new PluginDescriptorError("Unsupported plugin input schema.");
  if (field.component && field.widget && field.component !== field.widget) throw new PluginDescriptorError("Invalid plugin input schema.");
  if (typeof field.label !== "string" || typeof field.description !== "string" || typeof field.required !== "boolean") {
    throw new PluginDescriptorError("Invalid plugin input schema.");
  }
  if (component === "checkbox") {
    const allowed = ["id", "widget", "component", "label", "description", "required", "format", "multiple", "default"];
    if (!hasOnlyKeys(field, allowed, ["id", "label", "description", "required", "format", "multiple", "default"]) ||
        field.format !== "boolean" || field.multiple !== false || typeof field.default !== "boolean") {
      throw new PluginDescriptorError("Invalid checkbox field schema.");
    }
    return field;
  }
  if (component === "multiselect") {
    const allowed = ["id", "widget", "component", "label", "description", "required", "format", "multiple", "default", "choices"];
    if (!hasOnlyKeys(field, allowed, ["id", "label", "description", "required", "format", "multiple", "default", "choices"]) ||
        field.format !== "text" || field.multiple !== true || !validFiniteChoices(field.choices) ||
        !Array.isArray(field.default) || new Set(field.default).size !== field.default.length ||
        field.default.some(value => typeof value !== "string" || !field.choices.some(choice => choice.value === value))) {
      throw new PluginDescriptorError("Invalid multiselect field schema.");
    }
    return field;
  }
  if (field.accept !== undefined && typeof field.accept !== "string") throw new PluginDescriptorError("Invalid plugin input schema.");
  if (field.query_key !== undefined && (!isDataPath(field.query_key) || field.query_key.includes("."))) throw new PluginDescriptorError("Invalid query parameter schema.");
  if (field.default !== undefined && component !== "select" && typeof field.default !== "string") throw new PluginDescriptorError("Invalid plugin default schema.");
  if (component === "select" && (!Array.isArray(field.choices) || field.choices.some(choice => typeof choice !== "string"))) {
    throw new PluginDescriptorError("Invalid plugin choice schema.");
  }
  if (component === "select" && field.default !== undefined &&
      (typeof field.default !== "string" || !field.choices.includes(field.default))) {
    throw new PluginDescriptorError("Invalid plugin default schema.");
  }
  return field;
}

function validateConditionalInputs(inputs) {
  const fields = new Map();
  inputs.forEach(field => {
    if (fields.has(field.id)) throw new PluginDescriptorError("Duplicate plugin input id.");
    fields.set(field.id, field);
  });
  inputs.forEach(field => {
    if (field.conditions === undefined) return;
    if (!Array.isArray(field.conditions) || field.conditions.length === 0) {
      throw new PluginDescriptorError("Invalid conditional input schema.");
    }
    const effects = new Set();
    field.conditions.forEach(condition => {
      if (!condition || typeof condition !== "object" || Array.isArray(condition) ||
          Object.keys(condition).sort().join(",") !== "controller,effect,operator,value") {
        throw new PluginDescriptorError("Invalid conditional input schema.");
      }
      const { controller, operator, value, effect } = condition;
      const controllerField = fields.get(controller);
      if (!controllerField) throw new PluginDescriptorError("Unknown conditional controller.");
      if (controller === field.id) throw new PluginDescriptorError("Self-referential conditional input.");
      if ((controllerField.component ?? controllerField.widget) !== "select") {
        throw new PluginDescriptorError("Conditional controller must be a select.");
      }
      if (operator !== "equals") throw new PluginDescriptorError("Unsupported conditional operator.");
      if (typeof value !== "string" || !value || !controllerField.choices.includes(value)) {
        throw new PluginDescriptorError("Invalid conditional choice.");
      }
      if (effect !== "visible" && effect !== "required") {
        throw new PluginDescriptorError("Unsupported conditional effect.");
      }
      if (effects.has(effect)) throw new PluginDescriptorError("Duplicate conditional effect.");
      effects.add(effect);
      if (controllerField.conditions !== undefined) {
        throw new PluginDescriptorError("Conditional dependency chains are unsupported.");
      }
    });
  });
}

function validateQueryDescriptor(data) {
  if (data.pagination !== undefined) throw new PluginDescriptorError("Pagination requires schema version 2.");
  if (data.result?.row_key !== undefined) throw new PluginDescriptorError("Row identity metadata requires schema version 2.");
  if (!data.capabilities || Object.keys(data.capabilities).some(key => !QUERY_CAPABILITIES.includes(key)) || data.capabilities.query !== true || (data.capabilities.detail !== undefined && typeof data.capabilities.detail !== "boolean")) {
    throw new PluginDescriptorError("Invalid query capability schema.");
  }
  const detailEnabled = data.capabilities.detail === true;
  if (Object.keys(data.endpoints).some(key => !QUERY_ENDPOINTS.includes(key)) || typeof data.endpoints.query !== "string" || (detailEnabled && typeof data.endpoints.detail !== "string") || (!detailEnabled && data.endpoints.detail !== undefined)) {
    throw new PluginDescriptorError("Invalid query endpoint schema.");
  }
  data.inputs.forEach(field => {
    validateField(field);
    if (["checkbox", "multiselect"].includes(field.component ?? field.widget)) {
      throw new PluginDescriptorError("Unsupported query input schema.");
    }
  });
  validateConditionalInputs(data.inputs);
  if (!data.result || data.result.presentation !== "table" || typeof data.result.rows_path !== "string" || !Array.isArray(data.result.columns)) {
    throw new PluginDescriptorError("Invalid query result schema.");
  }
  if (!validColumns(data.result.columns)) {
    throw new PluginDescriptorError("Invalid query result schema.");
  }
  if (detailEnabled && !isDataPath(data.result.detail_key)) {
    throw new PluginDescriptorError("Invalid query result schema.");
  }
  if (!detailEnabled && data.result.detail_key !== undefined) throw new PluginDescriptorError("Invalid query result schema.");
  validatePluginEndpoint(data.endpoints.query, data.plugin.slug);
  if (detailEnabled) validatePluginEndpoint(data.endpoints.detail.replace("{detail_id}", "placeholder"), data.plugin.slug);
}

function validateInformationalDescriptor(data) {
  if (!Array.isArray(data.inputs) || data.inputs.length !== 0 ||
      !Array.isArray(data.outputs) || data.outputs.length !== 0 ||
      !data.capabilities || Object.keys(data.capabilities).join(",") !== "read_only" ||
      data.capabilities.read_only !== true ||
      !data.content || typeof data.content !== "object" || Array.isArray(data.content) ||
      Object.keys(data.content).sort().join(",") !== "sections,summary" ||
      typeof data.content.summary !== "string" || !Array.isArray(data.content.sections)) {
    throw new PluginDescriptorError("Invalid informational descriptor.");
  }
  data.content.sections.forEach(section => {
    if (!section || typeof section !== "object" || Array.isArray(section) ||
        Object.keys(section).sort().join(",") !== "heading,paragraphs" ||
        typeof section.heading !== "string" || !Array.isArray(section.paragraphs) ||
        section.paragraphs.some(paragraph => typeof paragraph !== "string")) {
      throw new PluginDescriptorError("Invalid informational descriptor.");
    }
  });
}

function validateStaticPngResult(data) {
  if (!data.result || typeof data.result !== "object" || Array.isArray(data.result) ||
      Object.keys(data.result).sort().join(",") !== "presentation,primary" ||
      data.result.presentation !== "static_png") {
    throw new PluginDescriptorError("Invalid static PNG result schema.");
  }
  const primary = data.result.primary;
  if (!primary || typeof primary !== "object" || Array.isArray(primary) ||
      Object.keys(primary).sort().join(",") !== "alt,kind,label,media_type" ||
      primary.kind !== "plot" || primary.media_type !== "image/png" ||
      typeof primary.label !== "string" || !primary.label ||
      typeof primary.alt !== "string" || !primary.alt) {
    throw new PluginDescriptorError("Invalid static PNG result schema.");
  }
}

function validatePluginEndpoint(path, slug) {
  if (typeof path !== "string" || path.includes("?")) throw new PluginDescriptorError("Invalid plugin endpoint.");
  try { endpointUrl(path); } catch { throw new PluginDescriptorError("Invalid plugin endpoint."); }
  const match = path.match(/^\/plugins\/([^/]+)\//);
  if (!match || match[1] !== slug) throw new PluginDescriptorError("Plugin endpoint scope mismatch.");
}

function rejectExecutableMetadata(value, depth = 0) {
  if (depth > 30 || typeof value === "function") throw new PluginDescriptorError("Invalid plugin metadata.");
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:__proto__|prototype|constructor|jsx|javascript|script|script_url|html|raw_html|dangerouslySetInnerHTML|callback|callbacks|event_handler|expression|onChange|onClick|onSubmit|onLoad|onError|module|module_path|import|imports|eval|function|function_name|credentials|password|token|access_token|api_key|secret|secrets|source_path|filesystem_path|upstream_url)$/i.test(key)) {
      throw new PluginDescriptorError("Forbidden plugin metadata.");
    }
    rejectExecutableMetadata(child, depth + 1);
  }
}

function validateBatchQueryDescriptor(data) {
  if (!hasOnlyKeys(data, ["schema_version", "plugin", "renderer", "native_supported", "inputs", "outputs", "capabilities", "endpoints", "result", "pagination", "detail", "filters"],
    ["schema_version", "plugin", "renderer", "native_supported", "inputs", "outputs", "capabilities", "endpoints", "result"]) ||
    data.renderer !== "query" || data.native_supported !== true ||
    !hasOnlyKeys(data.plugin, ["slug", "name", "version", "description", "category"], ["slug", "name", "version", "description", "category"]) ||
    !Array.isArray(data.inputs) || !data.inputs.length || !data.inputs.every(validBatchField) ||
    new Set(data.inputs.map(input => input.id)).size !== data.inputs.length ||
    !Array.isArray(data.outputs) || data.outputs.length !== 0) {
    throw new PluginDescriptorError("Invalid batch query descriptor.");
  }
  if (!hasOnlyKeys(data.capabilities, QUERY_CAPABILITIES, ["query"]) || data.capabilities.query !== true ||
    (data.capabilities.detail !== undefined && data.capabilities.detail !== true)) throw new PluginDescriptorError("Invalid query capability schema.");
  const detail = data.capabilities.detail === true;
  const endpointKeys = detail ? ["query", "detail"] : ["query"];
  if (!hasOnlyKeys(data.endpoints, endpointKeys, endpointKeys) ||
    data.endpoints.query !== `/plugins/${data.plugin.slug}/api/ui-query/` ||
    (detail && data.endpoints.detail !== `/plugins/${data.plugin.slug}/api/ui-detail/{detail_id}/`)) {
    throw new PluginDescriptorError("Invalid batch query endpoints.");
  }
  if (!hasOnlyKeys(data.result, ["presentation", "rows_path", "row_key", "columns", ...(detail ? ["detail_key"] : [])],
    ["presentation", "rows_path", "row_key", "columns", ...(detail ? ["detail_key"] : [])]) ||
    data.result.presentation !== "table" || data.result.rows_path !== "results" ||
    !validColumns(data.result.columns) || !isDataPath(data.result.row_key) ||
    data.result.columns.some(column => column.key.includes(".")) ||
    !data.result.columns.some(column => column.key === data.result.row_key) ||
    (detail && !data.result.columns.some(column => column.key === data.result.detail_key))) throw new PluginDescriptorError("Invalid query result schema.");
  if (data.pagination !== undefined && (!validPaginationDescriptor(data.pagination) ||
    data.inputs.some(input => input.id === "page") ||
    !data.inputs.some(input => input.id === "page_size" && input.component === "number" && input.format === "integer"))) throw new PluginDescriptorError("Invalid pagination descriptor.");
  if (data.detail !== undefined && (!detail || !validDetailDescriptor(data.detail, scientificReferenceTypesForPlugin(data.plugin.slug)))) {
    throw new PluginDescriptorError("Invalid detail presentation descriptor.");
  }
  if (data.filters !== undefined && !validFilterDescriptor(data.filters, data.inputs)) {
    throw new PluginDescriptorError("Invalid filter presentation descriptor.");
  }
}

function validateDescriptor(data, slug) {
  if (!isRecord(data) || !isRecord(data.plugin) || typeof slug !== "string" || !SLUG.test(slug) || ![1, 2].includes(data?.schema_version) || data?.plugin?.slug !== slug || typeof data.renderer !== "string" || typeof data.native_supported !== "boolean") {
    throw new PluginDescriptorError("Workbench returned an invalid plugin descriptor.");
  }
  if (data.schema_version === 2) {
    rejectExecutableMetadata(data);
    validateBatchQueryDescriptor(data);
    if (["name", "version", "description", "category"].some(key => typeof data.plugin[key] !== "string")) throw new PluginDescriptorError("Invalid plugin metadata.");
    return data;
  }
  if (!data.native_supported) { rejectExecutableMetadata(data); return data; }
  if (!NATIVE_RENDERERS.has(data.renderer)) {
    throw new PluginDescriptorError("Unsupported plugin renderer.");
  }
  const metadata = data.plugin;
  if (["name", "version", "description", "category"].some(key => typeof metadata[key] !== "string")) {
    throw new PluginDescriptorError("Invalid plugin metadata.");
  }
  if (data.renderer === "informational") {
    validateInformationalDescriptor(data);
    rejectExecutableMetadata(data);
    return data;
  }
  if (!Array.isArray(data.inputs) || !Array.isArray(data.outputs) || !data.endpoints) {
    throw new PluginDescriptorError("Unsupported plugin renderer.");
  }
  if (data.renderer === "query") {
    validateQueryDescriptor(data);
    rejectExecutableMetadata(data);
    return data;
  }
  if (!data.capabilities || typeof data.capabilities !== "object" || Array.isArray(data.capabilities)) {
    throw new PluginDescriptorError("Invalid plugin capability schema.");
  }
  if (ASYNC_REQUIRED_CAPABILITIES.some(key => data.capabilities[key] !== true)) {
    throw new PluginDescriptorError("Invalid plugin capability schema.");
  }
  if (Object.keys(data.capabilities).some(key => !ASYNC_CAPABILITIES.includes(key))) {
    throw new PluginDescriptorError("Unsupported plugin capability.");
  }
  if (Object.keys(data.endpoints).some(key => !ASYNC_ENDPOINTS.includes(key))) {
    throw new PluginDescriptorError("Unsupported plugin endpoint role.");
  }
  data.inputs.forEach(validateField);
  validateConditionalInputs(data.inputs);
  data.outputs.forEach(output => {
    if (!output || typeof output.id !== "string" || !SLUG.test(output.id) || typeof output.label !== "string" || typeof output.format !== "string") {
      throw new PluginDescriptorError("Invalid plugin output schema.");
    }
  });
  for (const key of ASYNC_REQUIRED_ENDPOINTS) {
    if (typeof data.endpoints[key] !== "string") throw new PluginDescriptorError("Invalid plugin endpoint schema.");
    const endpoint = data.endpoints[key].replace("{run_id}", "placeholder");
    validatePluginEndpoint(endpoint, slug);
  }
  if (data.result !== undefined) {
    validateStaticPngResult(data);
    if (data.capabilities.render !== true || typeof data.endpoints.render !== "string") {
      throw new PluginDescriptorError("Invalid static PNG result endpoint schema.");
    }
    validatePluginEndpoint(data.endpoints.render.replace("{run_id}", "placeholder"), slug);
  } else if (data.capabilities.render !== undefined || data.endpoints.render !== undefined) {
    throw new PluginDescriptorError("Invalid static PNG result endpoint schema.");
  }
  if (data.artifacts !== undefined &&
      (!validArtifactPresentation(data.artifacts) ||
       data.endpoints.download !== `/plugins/${slug}/api/ui-artifacts/{run_id}/{artifact_id}/download/`)) {
    throw new PluginDescriptorError("Invalid artifact presentation schema.");
  }
  rejectExecutableMetadata(data);
  return data;
}

export function validatePluginDescriptor(data, slug) {
  try { return validateDescriptor(data, slug); }
  catch (error) {
    if (error instanceof PluginDescriptorError) throw error;
    // Malformed nested structures use the same controlled fallback as other
    // invalid descriptors, never a raw TypeError or a partially rendered UI.
    throw new PluginDescriptorError("Workbench returned an invalid plugin descriptor.");
  }
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
