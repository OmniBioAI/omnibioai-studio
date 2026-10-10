import { pluginEndpoint } from "./pluginApi";
import { isDataPath, isRecord, rowKeys, validPagination, validScalarRecord, validStructuredDetailRecord } from "./pluginUiContracts";

// `operation` (optional) is the active operation body -- just `descriptor`
// itself for a legacy single-operation descriptor, or the selected entry of
// `descriptor.operations` for a multi-operation one. `operationId` (optional)
// is appended as the reserved `operation` query parameter only when the
// descriptor declares an `operations` collection; omitted entirely for every
// existing single-operation descriptor, so legacy callers are unaffected.
export function queryRequestUrl(descriptor, values, page, operation = descriptor, operationId) {
  const url = new URL(pluginEndpoint(descriptor.endpoints.query), window.location.origin);
  for (const input of operation.inputs) {
    const value = values[input.id] ?? input.default ?? "";
    if (!["string", "number"].includes(typeof value)) throw new Error("Invalid query value.");
    const text = String(value).trim();
    const key = descriptor.schema_version === 2 ? input.id : (input.query_key || input.id);
    if (!isDataPath(key) || key.includes(".")) throw new Error("Invalid query parameter.");
    if (text) url.searchParams.set(key, text);
  }
  if (operationId !== undefined) {
    if (typeof operationId !== "string" || !isDataPath(operationId) || operationId.includes(".")) throw new Error("Invalid operation id.");
    url.searchParams.set("operation", operationId);
  }
  if (page !== undefined) {
    if (!operation.pagination || !Number.isSafeInteger(page) || page < 1) throw new Error("Invalid query page.");
    url.searchParams.set("page", String(page));
  }
  return `${url.origin === window.location.origin ? "" : url.origin}${url.pathname}${url.search}`;
}

async function readResponse(response, failure) {
  let payload;
  try { payload = await response.json(); } catch { throw new Error(`${failure}: invalid response.`); }
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : `${failure} (${response.status}).`);
  if (!isRecord(payload)) throw new Error(`${failure}: invalid response.`);
  return payload;
}

export async function queryPlugin(descriptor, values, { page, operation = descriptor, operationId, signal } = {}) {
  const response = await fetch(queryRequestUrl(descriptor, values, page, operation, operationId), {
    credentials: "same-origin", headers: { Accept: "application/json" }, signal,
  });
  const payload = await readResponse(response, "Query failed");
  const rows = payload[operation.result.rows_path];
  if (rowKeys(rows, operation.result.row_key) === null ||
      (operation.pagination && !validPagination(payload.pagination))) throw new Error("Query failed: invalid result data.");
  return payload;
}

export async function queryDetail(descriptor, id, { operation = descriptor, operationId, signal } = {}) {
  if (descriptor.capabilities.detail !== true || !["string", "number"].includes(typeof id) || String(id).length === 0) {
    throw new Error("Invalid detail identifier.");
  }
  const path = descriptor.endpoints.detail.replace("{detail_id}", encodeURIComponent(id));
  const url = new URL(pluginEndpoint(path), window.location.origin);
  if (operationId !== undefined) {
    if (typeof operationId !== "string" || !isDataPath(operationId) || operationId.includes(".")) throw new Error("Invalid operation id.");
    url.searchParams.set("operation", operationId);
  }
  const requestUrl = `${url.origin === window.location.origin ? "" : url.origin}${url.pathname}${url.search}`;
  const response = await fetch(requestUrl, { credentials: "same-origin", headers: { Accept: "application/json" }, signal });
  const payload = await readResponse(response, "Detail lookup failed");
  const validDetail = !operation.detail || (operation.detail.sections
    ? validStructuredDetailRecord(payload, operation.detail.sections, { strict: true })
    : validScalarRecord(payload, operation.detail.fields, { strict: true }));
  if (!validDetail) {
    throw new Error("Detail lookup failed: invalid response.");
  }
  return payload;
}

export async function downloadQueryResult(descriptor, id, { signal } = {}) {
  if (descriptor.capabilities.download !== true || typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(id) || id.includes("..")) {
    throw new Error("Invalid download identifier.");
  }
  const path = descriptor.endpoints.download.replace("{download_id}", encodeURIComponent(id));
  const response = await fetch(pluginEndpoint(path), {
    credentials: "same-origin", headers: { Accept: "application/octet-stream, application/json" }, signal,
  });
  if (!response.ok) {
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    throw new Error(typeof payload?.error === "string" ? payload.error : `Download failed (${response.status}).`);
  }
  return response;
}
