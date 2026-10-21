import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    session.version += 1; session.listeners.forEach(fn => fn());
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
    expect(screen.getByText(/No reconciliation check has been reported/)).toBeInTheDocument();
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
