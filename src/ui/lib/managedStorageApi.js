import { getSessionVersion, getToken, isElectron } from "./session";

const PREFIX = "/_svc/workbench/plugins/data_manager/api";
const OBJECT_ID = /^[A-Za-z0-9_-]{1,128}$/;

export class ManagedStorageError extends Error {
  constructor(code) {
    super(code);
    this.name = "ManagedStorageError";
    this.code = code;
  }
}

function url(path) {
  const origin = isElectron() ? (import.meta.env.DEV ? "http://localhost:5174" : "http://localhost") : "";
  return `${origin}${PREFIX}${path}`;
}

function codeForStatus(status) {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 413) return "quota_exceeded";
  if (status === 429) return "rate_limited";
  return "unavailable";
}

function requireToken() {
  const token = getToken();
  if (!token) throw new ManagedStorageError("unauthorized");
  return { token, version: getSessionVersion() };
}

function verifySession(snapshot) {
  if (snapshot.token !== getToken() || snapshot.version !== getSessionVersion()) {
    throw new ManagedStorageError("stale");
  }
}

async function jsonRequest(path, options = {}) {
  const snapshot = requireToken();
  let response;
  try {
    response = await fetch(url(path), {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${snapshot.token}`,
        ...(options.headers || {}),
      },
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ManagedStorageError("unavailable");
  }
  verifySession(snapshot);
  if (!response.ok) throw new ManagedStorageError(codeForStatus(response.status));
  try {
    return await response.json();
  } catch {
    throw new ManagedStorageError("invalid");
  }
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || typeof value.object_id !== "string"
      || !OBJECT_ID.test(value.object_id) || typeof value.filename !== "string"
      || !(value.size_bytes === null || Number.isSafeInteger(value.size_bytes) && value.size_bytes >= 0)
      || typeof value.downloadable !== "boolean") {
    throw new ManagedStorageError("invalid");
  }
  return Object.freeze({
    objectId: value.object_id,
    filename: value.filename,
    sizeBytes: value.size_bytes,
    sha256: typeof value.sha256 === "string" ? value.sha256 : "",
    downloadable: value.downloadable,
  });
}

export async function listManagedObjects({ signal } = {}) {
  const data = await jsonRequest("/objects", { signal });
  if (!data || !Array.isArray(data.objects)) throw new ManagedStorageError("invalid");
  return data.objects.map(normalizeObject);
}

export function uploadManagedFile(file, { idempotencyKey, onProgress, signal } = {}) {
  if (!(file instanceof Blob) || typeof idempotencyKey !== "string" || !idempotencyKey) {
    return Promise.reject(new ManagedStorageError("invalid"));
  }
  let snapshot;
  try {
    snapshot = requireToken();
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = callback => value => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      callback(value);
    };
    const fail = finish(reject);
    const succeed = finish(resolve);
    const abort = () => xhr.abort();
    xhr.open("POST", url("/upload"));
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${snapshot.token}`);
    xhr.setRequestHeader("Idempotency-Key", idempotencyKey);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && typeof onProgress === "function") onProgress(event.loaded, event.total);
    };
    xhr.onerror = () => fail(new ManagedStorageError("unavailable"));
    xhr.onabort = () => fail(new DOMException("Upload aborted", "AbortError"));
    xhr.onload = () => {
      try {
        verifySession(snapshot);
        if (xhr.status < 200 || xhr.status >= 300) throw new ManagedStorageError(codeForStatus(xhr.status));
        const data = JSON.parse(xhr.responseText);
        if (!data || typeof data.object_id !== "string" || !OBJECT_ID.test(data.object_id)
            || data.status !== "available") throw new ManagedStorageError("invalid");
        succeed(Object.freeze({ objectId: data.object_id, status: data.status }));
      } catch (error) {
        fail(error instanceof ManagedStorageError ? error : new ManagedStorageError("invalid"));
      }
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) return abort();
    const body = new FormData();
    body.append("file", file, file.name);
    body.append("object_type", "uploaded_file");
    body.append("session_id", crypto.randomUUID?.() || `studio-${Date.now()}`);
    xhr.send(body);
  });
}

export async function downloadManagedObject(objectId, { signal } = {}) {
  if (typeof objectId !== "string" || !OBJECT_ID.test(objectId)) throw new ManagedStorageError("invalid");
  const snapshot = requireToken();
  let response;
  try {
    response = await fetch(url(`/object-download?object_id=${encodeURIComponent(objectId)}`), {
      headers: { Authorization: `Bearer ${snapshot.token}` },
      credentials: "same-origin", cache: "no-store", signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ManagedStorageError("unavailable");
  }
  verifySession(snapshot);
  if (!response.ok) throw new ManagedStorageError(codeForStatus(response.status));
  return response.blob();
}

export async function deleteManagedObject(objectId) {
  if (typeof objectId !== "string" || !OBJECT_ID.test(objectId)) throw new ManagedStorageError("invalid");
  const body = new URLSearchParams({ object_id: objectId });
  return jsonRequest("/delete_object", { method: "POST", body });
}
