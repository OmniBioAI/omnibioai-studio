import { getSessionVersion, getToken, isElectron } from "./session";

// BioRepository internal API (Workbench docs/biorepo/openapi.yaml), reached
// like My files through the router's /_svc/workbench prefix. Identity comes
// only from the bearer token; the client never sends an owner, tenant or
// storage path. Storage locations are never returned by the API.
const WORKBENCH_PREFIX = "/_svc/workbench";
const API = "/api/biorepo/v1";
const DATASET_ID = /^ds_[0-9A-HJKMNP-TV-Z]{26}$/;
const DRS_ID = /^fo_[0-9A-HJKMNP-TV-Z]{26}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SEARCH_FILTERS = Object.freeze(["q", "project", "type", "organism", "assay", "reference_build", "tag", "owner"]);
export const VISIBILITIES = Object.freeze(["private", "project", "tenant"]);
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

export class BiorepoError extends Error {
  constructor(code, { status = 0, message = "", detail = {} } = {}) {
    super(message || code);
    this.name = "BiorepoError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function workbenchUrl(path) {
  const origin = isElectron() ? (import.meta.env.DEV ? "http://localhost:5174" : "http://localhost") : "";
  return `${origin}${WORKBENCH_PREFIX}${API}${path}`;
}

export function isDatasetId(value) {
  return typeof value === "string" && DATASET_ID.test(value);
}

function datasetPath(datasetId, suffix = "") {
  if (!isDatasetId(datasetId)) throw new BiorepoError("invalid");
  return `/datasets/${datasetId}${suffix}`;
}

function versionPath(datasetId, number, suffix = "") {
  if (!Number.isSafeInteger(number) || number < 1) throw new BiorepoError("invalid");
  return datasetPath(datasetId, `/versions/${number}${suffix}`);
}

async function errorFrom(response) {
  let body = null;
  try { body = await response.json(); } catch { /* no JSON body */ }
  const error = body?.error && typeof body.error === "object" ? body.error : {};
  const code = typeof error.code === "string" ? error.code.slice(0, 64) : "";
  const message = typeof error.message === "string" ? error.message.slice(0, 500) : "";
  const { status } = response;
  if (status === 401) return new BiorepoError("unauthorized", { status });
  return new BiorepoError(code || (status === 404 ? "not_found" : status === 403 ? "forbidden" : "unavailable"),
    { status, message, detail: error });
}

async function request(path, { method = "GET", body, raw, headers = {}, signal } = {}) {
  const token = getToken();
  const version = getSessionVersion();
  let response;
  try {
    response = await fetch(workbenchUrl(path), {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new BiorepoError("unavailable");
  }
  // A response for a previous user must never reach this one's screen.
  if (token !== getToken() || version !== getSessionVersion()) throw new BiorepoError("stale");
  if (!response.ok) throw await errorFrom(response);
  if (response.status === 204) return null;
  try { return await response.json(); } catch { throw new BiorepoError("invalid"); }
}

export function searchDatasets(filters = {}, { page = 1, pageSize = 25, signal } = {}) {
  const params = new URLSearchParams();
  for (const key of SEARCH_FILTERS) {
    const value = filters[key];
    if (value !== undefined && value !== null && String(value).trim()) params.set(key, String(value).trim().slice(0, 200));
  }
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  return request(`/search?${params}`, { signal });
}

export const getDataset = (id, { signal } = {}) => request(datasetPath(id), { signal });
export const listVersions = (id, { signal } = {}) => request(datasetPath(id, "/versions"), { signal });
export const getVersion = (id, n, { signal } = {}) => request(versionPath(id, n), { signal });
export function getLineage(id, depth = 1, { signal } = {}) {
  if (!Number.isSafeInteger(depth) || depth < 1 || depth > 5) throw new BiorepoError("invalid");
  return request(datasetPath(id, `/lineage?depth=${depth}`), { signal });
}

export function createDataset({ project, type, title, description = "", visibility = "private", tags = [] }) {
  const projectId = Number(project);
  if (!Number.isSafeInteger(projectId) || projectId < 1 || !VISIBILITIES.includes(visibility)) {
    throw new BiorepoError("invalid");
  }
  return request("/datasets", { method: "POST", body: { project: projectId, type, title, description, visibility, tags } });
}

export const updateDataset = (id, values) => request(datasetPath(id), { method: "PATCH", body: values });
export const createVersion = (id, { changelog = "", metadata = {} } = {}) =>
  request(datasetPath(id, "/versions"), { method: "POST", body: { changelog, metadata } });
export const sealVersion = (id, n) => request(versionPath(id, n, "/seal"), { method: "POST", body: {} });
export const registerInPlace = (id, n, sourcePath, prefix = "") =>
  request(versionPath(id, n, "/register"), { method: "POST", body: { source_path: sourcePath, prefix } });

/** Upload one browser File as resumable chunks; onProgress(receivedBytes). */
export async function uploadFile(id, n, file, path, { onProgress = () => {}, signal } = {}) {
  const session = await request(versionPath(id, n, "/uploads"), { method: "POST", body: { path, size: file.size }, signal });
  if (!UUID.test(session?.upload_id || "")) throw new BiorepoError("invalid");
  const chunk = Math.max(1, Math.min(UPLOAD_CHUNK_BYTES, Number(session.max_chunk_bytes) || UPLOAD_CHUNK_BYTES));
  let offset = Number(session.received_bytes) || 0;
  while (offset < file.size) {
    const end = Math.min(offset + chunk, file.size);
    const result = await request(`/uploads/${session.upload_id}`, {
      method: "PUT", raw: file.slice(offset, end), signal,
      headers: { "Content-Type": "application/octet-stream", "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` },
    });
    offset = Number(result?.received_bytes);
    if (!Number.isSafeInteger(offset) || offset < end) throw new BiorepoError("invalid");
    onProgress(offset);
  }
  return request(`/uploads/${session.upload_id}/complete`, { method: "POST", body: {}, signal });
}

/** A fresh signed download URL (60 min, Range-capable); re-checks access every call. */
export async function downloadUrl(drsId) {
  if (!DRS_ID.test(drsId || "")) throw new BiorepoError("invalid");
  const data = await request(`/files/${drsId}/download-url`, { method: "POST" });
  let url;
  try { url = new URL(data?.url); } catch { throw new BiorepoError("invalid"); }
  // Only ever a BioRepository signed-download link, never an arbitrary redirect.
  if (!["https:", "http:"].includes(url.protocol) || !url.pathname.startsWith(`${API}/download/`)) {
    throw new BiorepoError("invalid");
  }
  return url.href;
}

export const adminCapacity = ({ signal } = {}) => request("/admin/capacity", { signal });
