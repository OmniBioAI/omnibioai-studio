import { pluginEndpoint } from "./pluginApi";
import { isDataPath, isRecord, rowKeys, validPagination, validScalarRecord } from "./pluginUiContracts";

export function queryRequestUrl(descriptor, values, page) {
  const url = new URL(pluginEndpoint(descriptor.endpoints.query), window.location.origin);
  for (const input of descriptor.inputs) {
    const value = values[input.id] ?? input.default ?? "";
    if (!["string", "number"].includes(typeof value)) throw new Error("Invalid query value.");
    const text = String(value).trim();
    const key = descriptor.schema_version === 2 ? input.id : (input.query_key || input.id);
    if (!isDataPath(key) || key.includes(".")) throw new Error("Invalid query parameter.");
    if (text) url.searchParams.set(key, text);
  }
  if (page !== undefined) {
    if (!descriptor.pagination || !Number.isSafeInteger(page) || page < 1) throw new Error("Invalid query page.");
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

export async function queryPlugin(descriptor, values, { page, signal } = {}) {
  const response = await fetch(queryRequestUrl(descriptor, values, page), {
    credentials: "same-origin", headers: { Accept: "application/json" }, signal,
  });
  const payload = await readResponse(response, "Query failed");
  const rows = payload[descriptor.result.rows_path];
  if (rowKeys(rows, descriptor.result.row_key) === null ||
      (descriptor.pagination && !validPagination(payload.pagination))) throw new Error("Query failed: invalid result data.");
  return payload;
}

export async function queryDetail(descriptor, id, { signal } = {}) {
  if (descriptor.capabilities.detail !== true || !["string", "number"].includes(typeof id) || String(id).length === 0) {
    throw new Error("Invalid detail identifier.");
  }
  const path = descriptor.endpoints.detail.replace("{detail_id}", encodeURIComponent(id));
  const response = await fetch(pluginEndpoint(path), { credentials: "same-origin", headers: { Accept: "application/json" }, signal });
  const payload = await readResponse(response, "Detail lookup failed");
  if (descriptor.detail && !validScalarRecord(payload, descriptor.detail.fields, { strict: true })) {
    throw new Error("Detail lookup failed: invalid response.");
  }
  return payload;
}
