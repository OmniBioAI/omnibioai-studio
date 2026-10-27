import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: "tenant-a-token", version: 1, listeners: new Set() }));
vi.mock("../../src/ui/lib/session", () => ({
  getToken: () => session.token,
  getSessionVersion: () => session.version,
  isElectron: () => false,
  onSessionChange: callback => { session.listeners.add(callback); return () => session.listeners.delete(callback); },
}));
import AccountStorage from "../../src/ui/pages/AccountStorage";
import { StorageUsage } from "../../src/ui/pages/Artifacts";

const usage = {
  owner_type: "USER", owner_id: "7", used_bytes: 200, reserved_bytes: 300,
  available_bytes: 500, quota_bytes: 1000, membership_plan: "free",
  over_quota: false, quota_mode: "audit", enforcement_active: false,
  entitlement_status: "fresh",
};
const response = (body = usage, status = 200) => ({ ok: status === 200, status, json: async () => body });
const displayed = label => screen.getByText(label, { selector: "dt" }).nextElementSibling.textContent;
beforeEach(() => {
  session.token = "tenant-a-token"; session.version = 1;
  vi.spyOn(globalThis, "fetch").mockResolvedValue(response());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); session.listeners.clear(); });

describe("Storage account and real usage client", () => {
  it("renders personal totals through the authenticated me endpoint without client tenant selectors", async () => {
    window.history.replaceState({}, "", "/studio/storage?organization_id=other&owner_id=8");
    render(<AccountStorage />);
    expect(screen.getByRole("heading", { name: "Storage", exact: true })).toBeInTheDocument();
    await screen.findByText("Membership: Free");
    expect(["Used", "Reserved", "Available", "Total"].map(displayed)).toEqual(["200 B", "300 B", "500 B", "1.0 KB"]);
    expect(fetch).toHaveBeenCalledWith("/_svc/workbench/api/storage/me/usage", expect.objectContaining({
      credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json", Authorization: "Bearer tenant-a-token" },
    }));
    expect(screen.getByText(/audit mode; enforcement is not active/)).toBeInTheDocument();
    expect(screen.queryByText("Quota enforced")).not.toBeInTheDocument();
  });
  it.each([
    [0, 0, 1000, "0 B", "0 B", "1.0 KB"],
    [0, 1000, 0, "0 B", "1.0 KB", "0 B"],
    [1200, 0, 0, "1.2 KB", "0 B", "0 B"],
  ])("handles used=%s reserved=%s available=%s", async (used, reserved, available, usedText, reservedText, availableText) => {
    fetch.mockResolvedValue(response({ ...usage, used_bytes: used, reserved_bytes: reserved, available_bytes: available, over_quota: used > 1000 }));
    render(<AccountStorage />); await screen.findByText("Membership: Free");
    expect(["Used", "Reserved", "Available"].map(displayed)).toEqual([usedText, reservedText, availableText]);
    if (used > 1000) expect(screen.getByRole("alert")).toHaveTextContent("over your current storage allowance");
  });
  it.each([401, 403, 500])("does not display unauthorized or failed HTTP %s payloads", async status => {
    fetch.mockResolvedValue(response({ ...usage, used_bytes: 999, secret: "other-tenant" }, status));
    render(<AccountStorage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No usage value has been assumed");
    expect(screen.queryByText("999 B")).not.toBeInTheDocument();
    expect(screen.queryByText("other-tenant")).not.toBeInTheDocument();
  });
  it("shows loading without assuming zero usage", () => {
    fetch.mockReturnValue(new Promise(() => {})); render(<AccountStorage />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading personal storage usage");
    expect(screen.queryByText("0 B")).not.toBeInTheDocument();
  });
  it("clears old totals and reloads when the user or organization session changes", async () => {
    render(<AccountStorage />); await screen.findByText("200 B");
    fetch.mockReturnValueOnce(new Promise(() => {}));
    act(() => { session.token = "tenant-b-token"; session.version += 1; session.listeners.forEach(fn => fn()); });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("200 B")).not.toBeInTheDocument();
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer tenant-b-token");
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });
  it("discards a response from a previous session while reading its body", async () => {
    let resolveBody;
    fetch.mockResolvedValue({ ...response({ ...usage, used_bytes: 400, available_bytes: 300 }), json: async function () { return this.body; }, body: { ...usage, used_bytes: 400, available_bytes: 300 } });
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => new Promise(resolve => { resolveBody = resolve; }) });
    render(<AccountStorage />); await waitFor(() => expect(resolveBody).toBeTypeOf("function"));
    act(() => { session.version += 1; session.listeners.forEach(fn => fn()); });
    expect(await screen.findByText("400 B")).toBeInTheDocument();
    await act(async () => resolveBody(usage));
    expect(screen.queryByText("200 B")).not.toBeInTheDocument();
    expect(screen.getByText("400 B")).toBeInTheDocument();
  });
  it("refreshes safely after an API failure", async () => {
    fetch.mockRejectedValueOnce(new Error("private backend details"));
    render(<AccountStorage />); await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Refresh usage" }));
    await screen.findByText("200 B");
    expect(screen.queryByText("private backend details")).not.toBeInTheDocument();
  });
  it("distinguishes active enforcement from audit mode", async () => {
    fetch.mockResolvedValue(response({ ...usage, quota_mode: "enforce", enforcement_active: true }));
    render(<AccountStorage />); await screen.findByText("Quota enforced");
    expect(screen.queryByText(/audit mode/)).not.toBeInTheDocument();
  });
  it("does not present zero usage as a complete reconciliation", async () => {
    fetch.mockResolvedValue(response({ ...usage, used_bytes: 0, reserved_bytes: 0, available_bytes: 1000 }));
    render(<AccountStorage />); await screen.findByText("Membership: Free");
    expect(screen.getAllByText("0 B")).toHaveLength(2);
    expect(screen.queryByText(/reconciliation/i)).not.toBeInTheDocument();
    expect(screen.getByText(/do not confirm that all existing files have been counted/)).toBeInTheDocument();
  });
  it("does not treat a reconciliation timestamp as proof that legacy files were counted", () => {
    render(<StorageUsage state={{ status: "success", data: {
      usedBytes: 0, reservedBytes: 0, quotaBytes: 1000, availableBytes: 1000,
      plan: "free", overQuota: false, quotaMode: "audit", enforcementActive: false,
      entitlementStatus: "fresh", lastReconciledAt: "2026-10-21T12:00:00Z",
    } }} />);
    expect(screen.getByText(/Last reconciliation check reported/)).toBeInTheDocument();
    expect(screen.getByText(/timestamp alone does not confirm that all existing files have been counted/)).toBeInTheDocument();
  });
});


describe("Storage Visual V2", () => {
  it.each([["free", "Free", 1_000_000_000], ["plus", "Plus", 20_000_000_000], ["pro", "Pro", 100_000_000_000]])("marks only the API-supplied %s plan current", async (plan, name, quota) => {
    fetch.mockResolvedValue(response({ ...usage, membership_plan: plan, quota_bytes: quota, available_bytes: quota - 500 }));
    render(<AccountStorage />);
    await screen.findByText(`Membership: ${name}`);
    expect(screen.getAllByText("Current plan")).toHaveLength(1);
    expect(within(screen.getByRole("article", { name: `${name} storage plan` })).getByText("Current plan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Compare Membership tiers/ })).toHaveAttribute("href", "#compare-membership");
  });
  it("uses the effective API quota even when it differs from the standard plan", async () => {
    render(<AccountStorage />); await screen.findByText("Membership: Free");
    expect(displayed("Total")).toBe("1.0 KB");
    expect(screen.getByRole("article", { name: "Free storage plan" })).toHaveTextContent("1 GB");
    expect(screen.getByRole("img", { name: /Personal storage:/ })).toHaveAccessibleName(/200 B used, 300 B reserved, 500 B available, 1.0 KB total. 50% used or reserved/);
  });
  it("keeps all four cards but no chart or current plan when entitlements are missing", async () => {
    fetch.mockResolvedValue(response({ ...usage, membership_plan: null, quota_bytes: null, available_bytes: null, entitlement_status: "cached_or_unavailable" }));
    render(<AccountStorage />); await screen.findByText("Couldn’t load Membership");
    expect(screen.getByText("Couldn’t load storage allowance")).toBeInTheDocument();
    expect(["Used", "Reserved", "Available", "Total"].map(displayed)).toEqual(["200 B", "300 B", "—", "—"]);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("Current plan")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No allowance has been assumed");
  });
  it.each([0, 200])("handles a zero-byte allowance with %s bytes used without an invalid percentage", async used => {
    fetch.mockResolvedValue(response({ ...usage, quota_bytes: 0, used_bytes: used, reserved_bytes: 0, available_bytes: 0, over_quota: used > 0 }));
    render(<AccountStorage />); await screen.findByText("Membership: Free");
    expect(displayed("Total")).toBe("0 B");
    expect(screen.getByText("No storage allowance allocated")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAccessibleName(/No percentage is defined for a zero-byte allowance/);
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });
  it("reports reserved-only overage and the actual percentage above 100", async () => {
    fetch.mockResolvedValue(response({ ...usage, used_bytes: 0, reserved_bytes: 1200, available_bytes: 0, over_quota: true }));
    render(<AccountStorage />); await screen.findByText("Membership: Free");
    expect(screen.getByRole("img")).toHaveAccessibleName(/120% used or reserved/);
    expect(screen.getByRole("alert")).toHaveTextContent("Quota enforcement is not active");
  });
  it("displays an API reconciliation timestamp without claiming full accounting", async () => {
    fetch.mockResolvedValue(response({ ...usage, last_reconciled_at: "2026-10-21T12:00:00Z" }));
    render(<AccountStorage />);
    expect(await screen.findByText(/Last reconciliation check reported/)).toHaveTextContent("timestamp alone does not confirm");
    expect(document.querySelector("time")).toHaveAttribute("datetime", "2026-10-21T12:00:00Z");
  });
  it("labels a cached entitlement", async () => {
    fetch.mockResolvedValue(response({ ...usage, entitlement_status: "cached_or_unavailable" }));
    render(<AccountStorage />);
    await screen.findByText("Membership: Free");
    expect(screen.getByRole("status")).toHaveTextContent("Showing the last allowance supplied by the service");
  });
  it.each([{}, { ...usage, available_bytes: 600 }, { ...usage, used_bytes: -1 }])("rejects empty or inconsistent API payloads", async body => {
    fetch.mockResolvedValue(response(body)); render(<AccountStorage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No usage value has been assumed");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("Current plan")).not.toBeInTheDocument();
  });
  it("clears metrics and current plan during refresh and disables duplicate requests", async () => {
    render(<AccountStorage />); await screen.findByText("Membership: Free");
    let resolve;
    fetch.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh usage" }));
    expect(screen.getByRole("button", { name: "Refreshing usage…" })).toBeDisabled();
    expect(screen.queryByText("200 B")).not.toBeInTheDocument();
    expect(screen.queryByText("Current plan")).not.toBeInTheDocument();
    await act(async () => resolve(response()));
    expect(await screen.findByRole("button", { name: "Refresh usage" })).toBeEnabled();
  });
  it("ignores an in-flight refresh after a session switch", async () => {
    render(<AccountStorage />); await screen.findByText("Membership: Free");
    let resolve;
    fetch.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh usage" }));
    fetch.mockResolvedValue(response({ ...usage, membership_plan: "plus", used_bytes: 400, available_bytes: 300 }));
    act(() => { session.token = "tenant-b-token"; session.version += 1; session.listeners.forEach(fn => fn()); });
    await screen.findByText("Membership: Plus");
    await act(async () => resolve(response()));
    expect(screen.queryByText("Membership: Free")).not.toBeInTheDocument();
    expect(displayed("Used")).toBe("400 B");
  });
});
