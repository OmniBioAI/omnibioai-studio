import { getSessionVersion, getToken, isElectron } from "./session";

const WORKBENCH_PREFIX = "/_svc/workbench";
const ARTIFACTS_PATH = "/plugins/artifact_manager/artifacts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CANONICAL_ARTIFACT_TYPES = Object.freeze([
  "file", "directory", "dataset", "report", "workflow_output", "tool_output",
  "model", "image", "document", "table", "sequence_data", "alignment",
  "variant_data", "expression_data", "metadata", "archive", "other",
]);

const ARTIFACT_TYPE_SET = new Set(CANONICAL_ARTIFACT_TYPES);
const ARTIFACT_STATUSES = new Set(["reserved", "available", "archived", "deleted", "missing", "corrupt"]);

export class ArtifactsApiError extends Error {
  constructor(code) {
    super(code);
    this.name = "ArtifactsApiError";
    this.code = code;
  }
}

function workbenchUrl(path) {
  const origin = isElectron() ? (import.meta.env.DEV ? "http://localhost:5174" : "http://localhost") : "";
  return `${origin}${WORKBENCH_PREFIX}${path}`;
}

function artifactPath(artifactId, suffix = "") {
  if (typeof artifactId !== "string" || !UUID.test(artifactId)) throw new ArtifactsApiError("invalid");
  return `${ARTIFACTS_PATH}/${encodeURIComponent(artifactId)}${suffix}`;
}

function cleanText(value, max = 10000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function optionalId(value) {
  return value === null || value === undefined || value === "" ? "" : cleanText(value, 255);
}

function validDate(value) {
  return value === null || value === undefined || value === ""
    ? ""
    : typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export function normalizeArtifact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ArtifactsApiError("invalid");
  const artifactId = cleanText(value.artifact_id, 64);
  const name = cleanText(value.name, 255);
  const artifactType = cleanText(value.artifact_type, 64);
  const status = cleanText(value.status, 32);
  const createdAt = validDate(value.created_at);
  const archivedAt = validDate(value.archived_at);
  const sizeBytes = value.size_bytes;
  const version = value.version;
  if (!UUID.test(artifactId) || !name || !ARTIFACT_TYPE_SET.has(artifactType)
      || !ARTIFACT_STATUSES.has(status) || createdAt === null || archivedAt === null
      || !(sizeBytes === null || (Number.isSafeInteger(sizeBytes) && sizeBytes >= 0))
      || !Number.isSafeInteger(version) || version < 1) {
    throw new ArtifactsApiError("invalid");
  }
  const parentArtifactId = value.parent_artifact_id;
  if (!(parentArtifactId === null || parentArtifactId === "" || (typeof parentArtifactId === "string" && UUID.test(parentArtifactId)))) {
    throw new ArtifactsApiError("invalid");
  }
  const tags = Array.isArray(value.tags) ? value.tags.filter(item => typeof item === "string").map(item => item.slice(0, 100)).slice(0, 100) : [];
  return Object.freeze({
    artifactId,
    name,
    description: cleanText(value.description),
    artifactType,
    format: cleanText(value.format, 100),
    sizeBytes,
    mimeType: cleanText(value.mime_type, 255),
    createdAt,
    createdBy: cleanText(value.created_by, 255),
    projectId: optionalId(value.project_id),
    runId: optionalId(value.run_id),
    workflowId: optionalId(value.workflow_id),
    parentArtifactId: parentArtifactId || "",
    version,
    tags,
    status,
    archivedAt,
  });
}

function statusCode(status) {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  return "unavailable";
}

async function request(path, { signal, accept = "application/json" } = {}) {
  const token = getToken();
  const version = getSessionVersion();
  let response;
  try {
    response = await fetch(workbenchUrl(path), {
      headers: { Accept: accept, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ArtifactsApiError("unavailable");
  }
  if (token !== getToken() || version !== getSessionVersion()) throw new ArtifactsApiError("stale");
  if (!response.ok) throw new ArtifactsApiError(statusCode(response.status));
  return { response, token, version };
}

async function requestJson(path, options) {
  const snapshot = await request(path, options);
  let data;
  try {
    data = await snapshot.response.json();
  } catch {
    throw new ArtifactsApiError("invalid");
  }
  if (snapshot.token !== getToken() || snapshot.version !== getSessionVersion()) throw new ArtifactsApiError("stale");
  return data;
}

export async function listArtifacts({ query = "", limit = 200, offset = 0, signal } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0) {
    throw new ArtifactsApiError("invalid");
  }
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const term = typeof query === "string" ? query.trim().slice(0, 200) : "";
  if (term) params.set("q", term);
  const data = await requestJson(`${ARTIFACTS_PATH}?${params}`, { signal });
  if (!data || !Array.isArray(data.results) || !Number.isSafeInteger(data.total) || data.total < 0) {
    throw new ArtifactsApiError("invalid");
  }
  return Object.freeze({ artifacts: data.results.map(normalizeArtifact), total: data.total });
}

export async function getArtifact(artifactId, { signal } = {}) {
  return normalizeArtifact(await requestJson(artifactPath(artifactId), { signal }));
}

function normalizeEdge(value) {
  const relationship = cleanText(value?.relationship, 32);
  if (!value || typeof value !== "object" || !relationship.trim()) throw new ArtifactsApiError("invalid");
  return Object.freeze({
    relationship,
    artifact: normalizeArtifact(value.artifact),
    producingTool: cleanText(value.producing_tool, 255),
    producingPlugin: cleanText(value.producing_plugin, 255),
    executionTimestamp: validDate(value.execution_timestamp) || "",
  });
}

export async function getArtifactProvenance(artifactId, { signal } = {}) {
  const data = await requestJson(artifactPath(artifactId, "/provenance"), { signal });
  if (!data || !Array.isArray(data.inputs) || !Array.isArray(data.outputs)) throw new ArtifactsApiError("invalid");
  return Object.freeze({
    artifact: normalizeArtifact(data.artifact),
    inputs: data.inputs.map(normalizeEdge),
    outputs: data.outputs.map(normalizeEdge),
  });
}

function safeFilename(value, fallback) {
  const name = cleanText(value, 255).replace(/[\\/\u0000-\u001f\u007f]/g, "").trim();
  return name || fallback;
}

function responseFilename(response, fallback) {
  const disposition = response.headers?.get?.("Content-Disposition") || "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return safeFilename(decodeURIComponent(encoded), fallback); } catch { /* use fallback */ }
  }
  return safeFilename(disposition.match(/filename="([^"]*)"/i)?.[1], fallback);
}

export async function downloadArtifact(artifactId, { filename = "artifact-download", signal } = {}) {
  const snapshot = await request(artifactPath(artifactId, "/download"), { signal, accept: "application/octet-stream" });
  let blob;
  try { blob = await snapshot.response.blob(); } catch { throw new ArtifactsApiError("unavailable"); }
  if (snapshot.token !== getToken() || snapshot.version !== getSessionVersion()) throw new ArtifactsApiError("stale");
  return Object.freeze({ blob, filename: responseFilename(snapshot.response, safeFilename(filename, "artifact-download")) });
}
