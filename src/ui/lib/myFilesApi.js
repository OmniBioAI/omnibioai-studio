import { getSessionVersion, getToken, isElectron } from "./session";

// Workbench #890: the caller's own charged files. Identity comes from the
// bearer token (or the Studio session the router turns into one); the
// client never sends a user, owner or path.
const WORKBENCH_PREFIX = "/_svc/workbench";
const FILES_PATH = "/api/storage/me/files";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MY_FILES_SORTS = Object.freeze(["name", "size", "created"]);
export const MY_FILES_PAGE_SIZE = 20;

export class MyFilesError extends Error {
  constructor(code, { datasets = [] } = {}) {
    super(code);
    this.name = "MyFilesError";
    this.code = code;
    this.datasets = datasets;
  }
}

function workbenchUrl(path) {
  const origin = isElectron() ? (import.meta.env.DEV ? "http://localhost:5174" : "http://localhost") : "";
  return `${origin}${WORKBENCH_PREFIX}${path}`;
}

function filePath(fileId, suffix = "") {
  if (typeof fileId !== "string" || !UUID.test(fileId)) throw new MyFilesError("invalid");
  return `${FILES_PATH}/${encodeURIComponent(fileId)}${suffix}`;
}

/** Same-origin link; the browser streams the file itself (no blob in memory). */
export function myFileDownloadUrl(fileId) {
  return workbenchUrl(filePath(fileId, "/download"));
}

function text(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function nullableText(value, max) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new MyFilesError("invalid");
  return value.slice(0, max) || null;
}

function bytes(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new MyFilesError("invalid");
  return value;
}

function datasetsFrom(body) {
  if (!Array.isArray(body?.datasets)) return [];
  return body.datasets.slice(0, 50).map(item => Object.freeze({
    name: text(item?.name, 255),
    version: item?.version === null || item?.version === undefined ? "" : text(String(item.version), 32),
  }));
}

async function errorFrom(response) {
  let body = null;
  try { body = await response.json(); } catch { /* no JSON body */ }
  const code = typeof body?.code === "string" ? body.code : "";
  const { status } = response;
  if (status === 401) return new MyFilesError("unauthorized");
  if (status === 403) return new MyFilesError(code === "origin_not_allowed" ? "origin_not_allowed" : "forbidden");
  if (status === 404) return new MyFilesError("not_found");
  if (status === 409 && code === "dataset_linked") return new MyFilesError("dataset_linked", { datasets: datasetsFrom(body) });
  if (status === 409) return new MyFilesError("conflict");
  if (status === 429) return new MyFilesError("rate_limited");
  if (status === 503) return new MyFilesError("storage_unavailable");
  return new MyFilesError("unavailable");
}

async function requestJson(path, { method = "GET", signal } = {}) {
  const token = getToken();
  const version = getSessionVersion();
  let response;
  try {
    response = await fetch(workbenchUrl(path), {
      method,
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new MyFilesError("unavailable");
  }
  // A response for a previous user must never reach this one's screen.
  if (token !== getToken() || version !== getSessionVersion()) throw new MyFilesError("stale");
  if (!response.ok) throw await errorFrom(response);
  let data;
  try { data = await response.json(); } catch { throw new MyFilesError("invalid"); }
  if (token !== getToken() || version !== getSessionVersion()) throw new MyFilesError("stale");
  return data;
}

export function normalizeMyFile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MyFilesError("invalid");
  const id = text(value.id, 64);
  const createdAt = text(value.created_at, 64);
  if (!UUID.test(id) || !Number.isFinite(Date.parse(createdAt))
      || typeof value.download_allowed !== "boolean" || typeof value.deleting !== "boolean") {
    throw new MyFilesError("invalid");
  }
  const checksum = nullableText(value.checksum, 128);
  return Object.freeze({
    id,
    name: nullableText(value.name, 255),
    sizeBytes: bytes(value.size_bytes),
    createdAt,
    source: text(value.source, 64),
    sourceLabel: text(value.source_label, 64) || text(value.source, 64),
    checksum,
    checksumAlgorithm: checksum ? nullableText(value.checksum_algorithm, 32) : null,
    downloadAllowed: value.download_allowed,
    deleting: value.deleting,
  });
}

export async function listMyFiles({ sort = "created", dir = "desc", limit = MY_FILES_PAGE_SIZE, offset = 0, signal } = {}) {
  if (!MY_FILES_SORTS.includes(sort) || !["asc", "desc"].includes(dir)
      || !Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0) {
    throw new MyFilesError("invalid");
  }
  const params = new URLSearchParams({ sort, dir, limit: String(limit), offset: String(offset) });
  const data = await requestJson(`${FILES_PATH}?${params}`, { signal });
  if (!data || !Array.isArray(data.files)) throw new MyFilesError("invalid");
  return Object.freeze({
    files: data.files.map(normalizeMyFile),
    totalCount: bytes(data.total_count),
    totalBytes: bytes(data.total_bytes),
  });
}

export async function deleteMyFile(fileId, { confirmDatasetUnlink = false, signal } = {}) {
  const suffix = confirmDatasetUnlink ? "?confirm=dataset_unlink" : "";
  const data = await requestJson(`${filePath(fileId)}${suffix}`, { method: "DELETE", signal });
  if (!data || data.status !== "deleted") throw new MyFilesError("invalid");
  return Object.freeze({ totalBytes: bytes(data.total_bytes) });
}
