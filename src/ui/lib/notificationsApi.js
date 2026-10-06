import { getSessionVersion, getToken } from "./session";
import { applicationUrl } from "./workbenchApi";
import { csrfToken } from "./pluginApi";

const BASE = "/plugins/notification_center/api/";
export const NOTIFICATION_GROUPS = ["system", "workflow", "job", "dataset", "security", "integration", "collaboration", "resource"];
export const PAGE_SIZE = 25;

export class NotificationApiError extends Error {
  constructor(status = 0) {
    super(status === 401 ? "Your notification session is unavailable. Sign in again and retry."
      : status === 403 ? "This request could not be authorized. Reopen Studio and retry."
      : status === 400 ? "The notification request was invalid. Check your selections and retry."
      : "Notifications are unavailable right now. Please retry.");
    this.status = status;
  }
}

const valid = condition => { if (!condition) throw new NotificationApiError(); };
const strings = value => Array.isArray(value) && value.every(item => typeof item === "string");
const count = value => Number.isSafeInteger(value) && value >= 0;

async function request(path, { signal, body, query } = {}) {
  const token = getToken(), version = getSessionVersion();
  if (!token) throw new NotificationApiError(401);
  const current = () => !signal?.aborted && token === getToken() && version === getSessionVersion();
  const csrf = body ? csrfToken() : "";
  if (body && !csrf) throw new NotificationApiError(403);
  try {
    const response = await fetch(applicationUrl(BASE + path) + (query ? `?${query}` : ""), {
      method: body ? "POST" : "GET", credentials: "include", cache: "no-store", signal,
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json", "X-CSRFToken": csrf } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!current()) throw new DOMException("Request superseded", "AbortError");
    if (!response.ok) throw new NotificationApiError(response.status);
    const data = await response.json();
    if (!current()) throw new DOMException("Request superseded", "AbortError");
    valid(data?.ok === true);
    return data;
  } catch (error) {
    if (error.name === "AbortError" || error instanceof NotificationApiError) throw error;
    // Never surface backend bodies, network URLs, credentials or stack traces.
    throw new NotificationApiError();
  }
}

export async function getNotificationMetadata(options) {
  const data = await request("metadata/", options);
  valid(strings(data.categories) && strings(data.severities) && strings(data.mandatory_categories));
  return { categories: data.categories, severities: data.severities, mandatory_categories: data.mandatory_categories };
}

function preferences(data) {
  const pref = data.preferences;
  valid(pref && strings(pref.enabled_categories) && typeof pref.min_severity === "string");
  const result = { enabled_categories: pref.enabled_categories, min_severity: pref.min_severity };
  for (const group of NOTIFICATION_GROUPS) {
    const key = `${group}_notifications`;
    valid(typeof pref[key] === "boolean");
    result[key] = pref[key];
  }
  return result;
}

export async function getNotificationPreferences(options) {
  return preferences(await request("preferences/", options));
}

export async function updateNotificationPreferences(changes, options) {
  // Explicit allowlist: no recipient identity, quiet hours or invented grouping setting.
  const body = {};
  for (const key of ["enabled_categories", "min_severity", ...NOTIFICATION_GROUPS.map(group => `${group}_notifications`)]) {
    if (Object.hasOwn(changes, key)) body[key] = changes[key];
  }
  return preferences(await request("preferences/update/", { ...options, body }));
}

export async function getNotifications({ page = 1, state = "active", category = "", severity = "", signal } = {}) {
  if (!Number.isSafeInteger(page) || page < 1 || !["active", "unread"].includes(state)) throw new NotificationApiError(400);
  const query = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), state });
  if (category) query.set("category", category);
  if (severity) query.set("severity", severity);
  const data = await request("notifications/", { signal, query });
  valid(Array.isArray(data.items) && count(data.total) && Number.isSafeInteger(data.page) && data.page >= 1 && data.page_size === PAGE_SIZE);
  const items = data.items.map(item => {
    valid(item && Number.isSafeInteger(item.notification_id) && item.notification_id > 0
      && ["title", "summary", "category", "severity", "created_at"].every(key => typeof item[key] === "string")
      && typeof item.is_unread === "boolean" && Number.isSafeInteger(item.group_count) && item.group_count >= 1);
    // Closed presentation fields only. Raw content, metadata and action URLs are not consumed.
    return Object.fromEntries(["notification_id", "title", "summary", "category", "severity", "created_at", "is_unread", "group_count"].map(key => [key, item[key]]));
  });
  return { items, total: data.total, page: data.page, page_size: data.page_size };
}

export async function getUnreadNotificationCount(options) {
  const data = await request("notifications/count/", options);
  valid(count(data.unread));
  return data.unread;
}

export async function markNotificationRead(id, options) {
  if (!Number.isSafeInteger(id) || id < 1) throw new NotificationApiError(400);
  await request(`notifications/${id}/read/`, { ...options, body: {} });
}
