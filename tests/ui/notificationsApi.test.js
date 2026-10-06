import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ token: "TEST-SESSION", version: 1, electron: false }));
vi.mock("../../src/ui/lib/session", () => ({ getToken: () => session.token, getSessionVersion: () => session.version, isElectron: () => session.electron }));
import * as api from "../../src/ui/lib/notificationsApi";

const preferences = { enabled_categories: [], min_severity: "INFO", ...Object.fromEntries(api.NOTIFICATION_GROUPS.map(group => [`${group}_notifications`, true])) };
const notification = { notification_id: 1, title: "Dataset available", summary: "A dataset is available.", category: "dataset_available", severity: "INFO", created_at: "2026-10-05T12:00:00Z", is_unread: true, group_count: 1 };
const response = (body, status = 200) => ({ ok: status === 200, status, json: vi.fn().mockResolvedValue(body) });
beforeEach(() => { session.token = "TEST-SESSION"; session.version = 1; session.electron = false; vi.stubGlobal("fetch", vi.fn()); document.cookie = "csrftoken=TEST-CSRF; path=/"; });
afterEach(() => { vi.unstubAllGlobals(); document.cookie = "csrftoken=; max-age=0; path=/"; });

describe("Notifications canonical API", () => {
  it("uses the existing proxy, bearer, abort and cookie transport without client recipient authority", async () => {
    fetch.mockResolvedValue(response({ ok: true, items: [notification], total: 1, page: 2, page_size: 25 }));
    const signal = new AbortController().signal;
    await api.getNotifications({ page: 2, state: "unread", category: "dataset_available", severity: "WARNING", user_id: 9, recipient_id: 9, email: "not-authority", signal });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/_svc/workbench/plugins/notification_center/api/notifications/?page=2&page_size=25&state=unread&category=dataset_available&severity=WARNING");
    expect(options).toMatchObject({ method: "GET", credentials: "include", cache: "no-store", signal, headers: { Authorization: "Bearer TEST-SESSION" } });
    expect(url).not.toMatch(/recipient|user_id|email|subject/);
  });
  it("uses the canonical Electron proxy convention", async () => {
    session.electron = true; fetch.mockResolvedValue(response({ ok: true, unread: 0 }));
    expect(await api.getUnreadNotificationCount()).toBe(0);
    expect(fetch.mock.calls[0][0]).toBe("http://localhost:5174/_svc/workbench/plugins/notification_center/api/notifications/count/");
  });
  it("projects only presentation fields and authoritative count", async () => {
    fetch.mockResolvedValueOnce(response({ ok: true, items: [{ ...notification, metadata: { secret: "CANARY" }, message: "RAW", recipient_user_id: 1 }], total: 99, page: 1, page_size: 25 }))
      .mockResolvedValueOnce(response({ ok: true, unread: 56 }));
    const list = await api.getNotifications(); expect(list.items).toEqual([notification]);
    expect(JSON.stringify(list)).not.toMatch(/CANARY|RAW|recipient/);
    expect(await api.getUnreadNotificationCount()).toBe(56);
  });
  it("loads metadata and preferences without exposing backend internals", async () => {
    fetch.mockResolvedValueOnce(response({ ok: true, categories: ["comment"], severities: ["INFO"], mandatory_categories: [], architecture: "internal" }))
      .mockResolvedValueOnce(response({ ok: true, preferences: { ...preferences, quiet_hours_start: "01:00", raw: "hidden" } }));
    expect(await api.getNotificationMetadata()).toEqual({ categories: ["comment"], severities: ["INFO"], mandatory_categories: [] });
    expect(await api.getNotificationPreferences()).toEqual(preferences);
  });
  it("sends CSRF-protected canonical POSTs with an explicit preference allowlist", async () => {
    fetch.mockResolvedValueOnce(response({ ok: true, preferences })).mockResolvedValueOnce(response({ ok: true }));
    await api.updateNotificationPreferences({ ...preferences, user_id: 9, email: "x", grouping: false, quiet_hours_start: "01:00", recipient_id: 9 });
    await api.markNotificationRead(17);
    expect(fetch.mock.calls.map(call => call[0])).toEqual(["/_svc/workbench/plugins/notification_center/api/preferences/update/", "/_svc/workbench/plugins/notification_center/api/notifications/17/read/"]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(preferences);
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: "POST", body: "{}", headers: { "X-CSRFToken": "TEST-CSRF" }, credentials: "include" });
  });
  it("fails closed without CSRF or an authenticated session", async () => {
    document.cookie = "csrftoken=; max-age=0; path=/";
    await expect(api.markNotificationRead(1)).rejects.toMatchObject({ status: 403 });
    session.token = null; await expect(api.getNotifications()).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.1, Infinity, "2"])("rejects malformed page/id %s before fetch", async value => {
    await expect(api.getNotifications({ page: value })).rejects.toMatchObject({ status: 400 });
    await expect(api.markNotificationRead(value)).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects unsupported inbox state", async () => { await expect(api.getNotifications({ state: "invented" })).rejects.toMatchObject({ status: 400 }); });
  it.each([400, 401, 403, 500, 503])("handles HTTP %s without reading/exposing the response body", async status => {
    const r = response({ traceback: "SECRET" }, status); fetch.mockResolvedValue(r);
    await expect(api.getNotifications()).rejects.toMatchObject({ status }); expect(r.json).not.toHaveBeenCalled();
  });
  it.each([null, { ok: false }, { ok: true, items: [], total: -1, page: 1, page_size: 25 }, { ok: true, items: [{ ...notification, group_count: 0 }], total: 1, page: 1, page_size: 25 }])("rejects malformed list responses", async body => {
    fetch.mockResolvedValue(response(body)); await expect(api.getNotifications()).rejects.toBeInstanceOf(api.NotificationApiError);
  });
  it("sanitizes network and invalid JSON errors", async () => {
    fetch.mockRejectedValueOnce(new Error("PRIVATE URL SECRET"));
    await expect(api.getNotifications()).rejects.toThrow("Notifications are unavailable right now");
    fetch.mockResolvedValueOnce({ ok: true, json: () => { throw new Error("PRIVATE BODY"); } });
    await expect(api.getNotifications()).rejects.toThrow("Notifications are unavailable right now");
  });
  it("rejects malformed metadata/preferences/count", async () => {
    fetch.mockResolvedValue(response({ ok: true, preferences: {}, unread: -1 }));
    for (const call of [api.getNotificationMetadata, api.getNotificationPreferences, api.getUnreadNotificationCount]) await expect(call()).rejects.toBeInstanceOf(api.NotificationApiError);
    fetch.mockResolvedValue(response({ ok: true, preferences: { ...preferences, system_notifications: "yes" } }));
    await expect(api.getNotificationPreferences()).rejects.toBeInstanceOf(api.NotificationApiError);
  });
  it("rejects a session change before parsing and after parsing", async () => {
    fetch.mockImplementationOnce(async () => { session.version++; return response({ ok: true, unread: 0 }); });
    await expect(api.getUnreadNotificationCount()).rejects.toMatchObject({ name: "AbortError" });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => { session.token = "OTHER"; return { ok: true, unread: 0 }; } });
    await expect(api.getUnreadNotificationCount()).rejects.toMatchObject({ name: "AbortError" });
  });
  it("preserves cancellation", async () => {
    fetch.mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    await expect(api.getNotifications()).rejects.toMatchObject({ name: "AbortError" });
    const controller = new AbortController(); controller.abort(); fetch.mockResolvedValue(response({ ok: true, unread: 0 }));
    await expect(api.getUnreadNotificationCount({ signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
