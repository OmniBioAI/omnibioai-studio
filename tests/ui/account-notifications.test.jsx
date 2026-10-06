import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ version: 0, listeners: new Set() }));
vi.mock("../../src/ui/lib/session", () => ({ getSessionVersion: () => session.version, onSessionChange: listener => { session.listeners.add(listener); return () => session.listeners.delete(listener); } }));
vi.mock("../../src/ui/lib/notificationsApi", async importOriginal => ({ ...await importOriginal(), getNotificationMetadata: vi.fn(), getNotificationPreferences: vi.fn(), getNotifications: vi.fn(), getUnreadNotificationCount: vi.fn(), markNotificationRead: vi.fn(), updateNotificationPreferences: vi.fn() }));
const zone = vi.hoisted(() => ({ value: "America/Chicago" }));
vi.mock("../../src/ui/components/PreferencesProvider", async importOriginal => {
  const original = await importOriginal();
  return { ...original, useAccountDateTime: () => value => new Date(value).toLocaleString("en-US", { ...(zone.value ? { timeZone: zone.value } : {}), timeZoneName: "short" }) };
});
import * as api from "../../src/ui/lib/notificationsApi";
import AccountNotifications from "../../src/ui/pages/AccountNotifications";

const user = { userId: 1, email: "test@example.org" };
const pref = { enabled_categories: [], min_severity: "INFO", ...Object.fromEntries(api.NOTIFICATION_GROUPS.map(group => [`${group}_notifications`, true])) };
const metadata = { categories: ["dataset_available", "comment", "security_alert"], severities: ["INFO", "SUCCESS", "WARNING", "ERROR", "CRITICAL"], mandatory_categories: ["security_alert"] };
const item = { notification_id: 1, title: "Dataset available", summary: "A dataset is available.", category: "dataset_available", severity: "INFO", created_at: "2026-10-05T12:00:00Z", is_unread: true, group_count: 1 };
const list = (items = [], total = items.length, page = 1) => ({ items, total, page, page_size: 25 });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const show = () => render(<AccountNotifications currentUser={user} />);
const ready = () => screen.findByRole("button", { name: "Save notification preferences" });
beforeEach(() => {
  vi.clearAllMocks(); session.version = 0; zone.value = "America/Chicago";
  api.getNotificationMetadata.mockResolvedValue(metadata); api.getNotificationPreferences.mockResolvedValue(pref);
  api.getNotifications.mockResolvedValue(list()); api.getUnreadNotificationCount.mockResolvedValue(0);
  api.markNotificationRead.mockResolvedValue(); api.updateNotificationPreferences.mockImplementation(async data => data);
});
afterEach(cleanup);

it("requires an authenticated account without querying any recipient", () => {
  render(<AccountNotifications currentUser={null} />); expect(screen.getByRole("status")).toHaveTextContent("Sign in"); expect(api.getNotifications).not.toHaveBeenCalled();
});
it("shows loading, a truthful empty inbox, authoritative unread count and accessible controls", async () => {
  const pending = deferred(); api.getNotifications.mockReturnValueOnce(pending.promise); show();
  expect(screen.getByText("Loading notifications…")).toBeInTheDocument(); expect(screen.getByText("Loading notification preferences…")).toBeInTheDocument();
  await act(async () => pending.resolve(list())); await ready();
  expect(screen.getByRole("heading", { name: "No notifications yet" })).toBeInTheDocument(); expect(screen.getByText("0 unread")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(screen.queryByLabelText(/quiet hours|grouping/i)).not.toBeInTheDocument();
  expect(screen.getByLabelText("Security (required)")).toBeDisabled(); expect(screen.getByLabelText("Security alert (required)")).toBeDisabled();
});
it("renders unread/read, safe summary, backend grouping and personal timezone", async () => {
  api.getNotifications.mockResolvedValue(list([{ ...item, group_count: 3, metadata: { raw: "HIDDEN" }, message: "RAW BODY" }, { ...item, notification_id: 2, is_unread: false, title: "Workflow completed" }]));
  api.getUnreadNotificationCount.mockResolvedValue(52); show();
  await screen.findByRole("list", { name: "Notifications" });
  expect(screen.getByText("52 unread")).toBeInTheDocument(); expect(screen.getByText("3 grouped events")).toBeInTheDocument();
  expect(screen.getByText("Read", { exact: true })).toBeInTheDocument(); expect(screen.getByText("Unread", { selector: "span" })).toBeInTheDocument();
  expect(document.querySelector("time")).toHaveTextContent(new Date(item.created_at).toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" }));
  expect(screen.queryByText(/HIDDEN|RAW BODY/)).not.toBeInTheDocument();
});
it("uses device time when personal timezone is unset", async () => {
  zone.value = null; api.getNotifications.mockResolvedValue(list([item])); show(); await screen.findByRole("list");
  expect(document.querySelector("time")).toHaveTextContent(new Date(item.created_at).toLocaleString("en-US", { timeZoneName: "short" }));
});
it("marks read once and refetches only after success", async () => {
  const pending = deferred(); api.markNotificationRead.mockReturnValue(pending.promise);
  api.getNotifications.mockResolvedValueOnce(list([item])).mockResolvedValue(list([{ ...item, is_unread: false }])); show();
  const button = await screen.findByRole("button", { name: /Mark as read/ }); fireEvent.click(button); fireEvent.click(button);
  expect(api.markNotificationRead).toHaveBeenCalledTimes(1); expect(api.getNotifications).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve()); await screen.findByText("Notification marked as read.");
  await waitFor(() => expect(screen.queryByRole("button", { name: /Mark as read/ })).not.toBeInTheDocument());
});
it("keeps unread state after failed mark read and allows retry", async () => {
  api.getNotifications.mockResolvedValue(list([item])); api.markNotificationRead.mockRejectedValueOnce({ status: 500 }); show();
  fireEvent.click(await screen.findByRole("button", { name: /Mark as read/ })); await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: /Mark as read/ })).toBeEnabled(); expect(api.getNotifications).toHaveBeenCalledTimes(1);
});
it("paginates one page at a time and resets page when filtering", async () => {
  api.getNotifications.mockImplementation(async query => list([], 51, query.page)); show(); await ready();
  fireEvent.click(screen.getByRole("button", { name: "Next" })); await waitFor(() => expect(screen.getByText(/Page 2/)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Previous" })); await waitFor(() => expect(screen.getByText(/Page 1/)).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "comment" } });
  fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "WARNING" } });
  await screen.findByText("No matching notifications");
  fireEvent.click(screen.getByRole("button", { name: "Unread", exact: true })); await screen.findByText("No unread notifications");
  expect(api.getNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, state: "unread", category: "comment", severity: "WARNING" }));
  expect(JSON.stringify(api.getNotifications.mock.calls)).not.toMatch(/recipient|user_id|email|subject/);
});
it.each([400, 401, 403, 500, 0])("handles error %s without showing an empty inbox or backend detail", async status => {
  api.getNotifications.mockRejectedValueOnce({ status, message: "PRIVATE TRACE" }); show();
  const alert = await screen.findByRole("alert"); expect(alert).not.toHaveTextContent("PRIVATE TRACE");
  if (status === 401) expect(alert).toHaveTextContent("Sign in again");
  expect(screen.queryByText("No notifications yet")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry inbox" })); await screen.findByText("No notifications yet");
});
it("retries failed preference load independently", async () => {
  api.getNotificationPreferences.mockRejectedValueOnce(new Error()); show(); await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Retry preferences" })); await ready(); expect(api.getNotificationPreferences).toHaveBeenCalledTimes(2);
});
it("saves category/minimum severity/type preferences once, using confirmed response", async () => {
  const pending = deferred(); api.updateNotificationPreferences.mockReturnValue(pending.promise); show(); await ready();
  fireEvent.click(screen.getByLabelText("System")); fireEvent.change(screen.getByLabelText("Minimum severity"), { target: { value: "WARNING" } });
  fireEvent.click(screen.getByLabelText("Comment"));
  const save = screen.getByRole("button", { name: "Save notification preferences" }); fireEvent.click(save); fireEvent.click(save);
  expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1);
  expect(api.updateNotificationPreferences.mock.calls[0][0]).toMatchObject({ min_severity: "WARNING", system_notifications: false, enabled_categories: ["dataset_available", "security_alert"] });
  expect(screen.getByLabelText("Minimum severity")).toBeDisabled();
  await act(async () => pending.resolve({ ...pref, min_severity: "WARNING", system_notifications: false }));
  await screen.findByText("Notification preferences saved."); expect(save).toBeDisabled();
});
it("retains unsaved values after preference failure and retries safely", async () => {
  api.updateNotificationPreferences.mockRejectedValueOnce({ status: 403 }); show(); await ready();
  fireEvent.change(screen.getByLabelText("Minimum severity"), { target: { value: "ERROR" } });
  fireEvent.click(screen.getByRole("button", { name: "Save notification preferences" })); await screen.findByRole("alert");
  expect(screen.getByLabelText("Minimum severity")).toHaveValue("ERROR"); expect(screen.queryByText("Notification preferences saved.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save notification preferences" })); await screen.findByText("Notification preferences saved.");
});
it("preserves mandatory categories and supports enabling all categories", async () => {
  show(); await ready(); fireEvent.click(screen.getByLabelText("Comment")); fireEvent.click(screen.getByLabelText("Comment")); fireEvent.click(screen.getByLabelText("Dataset available"));
  fireEvent.click(screen.getByRole("button", { name: "Enable all categories" }));
  expect(screen.getByLabelText("Dataset available")).toBeChecked(); expect(screen.getByLabelText("Comment")).toBeChecked();
  expect(screen.getByRole("button", { name: "Save notification preferences" })).toBeDisabled();
});
it("ignores slow prior filter/page results and supports explicit refresh", async () => {
  const pending = deferred(); api.getNotifications.mockReturnValueOnce(pending.promise); show(); await ready();
  fireEvent.click(screen.getByRole("button", { name: "Unread", exact: true })); await screen.findByText("No unread notifications");
  await act(async () => pending.resolve(list([item]))); expect(screen.queryByRole("list")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh inbox" })); await waitFor(() => expect(api.getNotifications).toHaveBeenCalledTimes(3));
});
it("hides old account data and discards pending saves when session changes", async () => {
  const pending = deferred(); api.updateNotificationPreferences.mockReturnValue(pending.promise); show(); await ready();
  fireEvent.click(screen.getByLabelText("System")); fireEvent.click(screen.getByRole("button", { name: "Save notification preferences" }));
  act(() => { session.version++; session.listeners.forEach(listener => listener()); }); await ready();
  await act(async () => pending.resolve({ ...pref, system_notifications: false }));
  expect(screen.getByLabelText("System")).toBeChecked(); expect(screen.queryByText("Notification preferences saved.")).not.toBeInTheDocument();
});
it("cancels reads and mark-read requests on navigation away", async () => {
  const pending = deferred(); api.markNotificationRead.mockReturnValue(pending.promise); api.getNotifications.mockResolvedValue(list([item]));
  const tree = show(); fireEvent.click(await screen.findByRole("button", { name: /Mark as read/ })); tree.unmount();
  expect(api.getNotifications.mock.calls[0][0].signal.aborted).toBe(true); expect(api.markNotificationRead.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => pending.resolve()); expect(api.getNotifications).toHaveBeenCalledTimes(1);
});
