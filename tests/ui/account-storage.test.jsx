import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getStorageUsage: vi.fn() }));
vi.mock("../../src/ui/lib/artifactsApi", () => api);

import AccountStorage from "../../src/ui/pages/AccountStorage";
import { StorageUsage } from "../../src/ui/pages/Artifacts";
import { setSession, clearSession } from "../../src/ui/lib/session";

const usage = Object.freeze({
  usedBytes: 240_000_000, reservedBytes: 1_000, quotaBytes: 1_000_000_000,
  availableBytes: 759_999_000, plan: "free", overQuota: false,
  quotaMode: "audit", enforcementActive: false, entitlementStatus: "fresh",
});

beforeEach(() => api.getStorageUsage.mockReset().mockResolvedValue(usage));
afterEach(cleanup);

describe("Account Storage", () => {
  it("hides completed usage immediately on account switch and logout", async () => {
    render(<AccountStorage />);
    expect(await screen.findByText("240 MB")).toBeInTheDocument();
    act(() => setSession("another-user"));
    expect(screen.queryByText("240 MB")).not.toBeInTheDocument();
    expect(screen.getByText(/Loading personal storage usage/)).toBeInTheDocument();
    act(() => clearSession());
    expect(screen.queryByText("240 MB")).not.toBeInTheDocument();
  });

  it("aborts pending old-session requests and ignores their late completion", async () => {
    let deliver;
    api.getStorageUsage.mockImplementationOnce(() => new Promise(resolve => { deliver = resolve; }));
    render(<AccountStorage />);
    const oldSignal = api.getStorageUsage.mock.calls[0][0].signal;
    api.getStorageUsage.mockResolvedValue({ ...usage, usedBytes: 50, reservedBytes: 0, availableBytes: 999_999_950 });
    act(() => setSession("new-user"));
    expect(oldSignal.aborted).toBe(true);
    expect(await screen.findByText("50 B")).toBeInTheDocument();
    await act(async () => deliver(usage));
    expect(screen.queryByText("240 MB")).not.toBeInTheDocument();
    expect(screen.getByText("50 B")).toBeInTheDocument();
  });

  it("refreshes on return to the page and removes listeners on unmount", async () => {
    const { unmount } = render(<AccountStorage />);
    await screen.findByText("240 MB");
    api.getStorageUsage.mockResolvedValue({ ...usage, usedBytes: 300, reservedBytes: 0, availableBytes: 999_999_700 });
    fireEvent.focus(window);
    expect(await screen.findByText("300 B")).toBeInTheDocument();
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(api.getStorageUsage).toHaveBeenCalledTimes(3));
    unmount();
    fireEvent.focus(window);
    expect(api.getStorageUsage).toHaveBeenCalledTimes(3);
    expect(api.getStorageUsage.mock.calls[2][0].signal.aborted).toBe(true);
  });

  it("does not present failed refreshes as a zero or retain previous usage", async () => {
    render(<AccountStorage />);
    await screen.findByText("240 MB");
    api.getStorageUsage.mockRejectedValueOnce({ code: "unavailable" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh usage" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No usage value has been assumed");
    expect(screen.queryByText("240 MB")).not.toBeInTheDocument();
    expect(screen.queryByText("0 B")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh usage" })).toBeEnabled();
  });

  it.each([["free", 1_000_000_000, "1.0 GB"], ["plus", 20_000_000_000, "20 GB"], ["pro", 100_000_000_000, "100 GB"]])(
    "renders the %s entitlement using decimal GB", (plan, quotaBytes, label) => {
      render(<StorageUsage state={{ status: "success", data: { ...usage, plan, quotaBytes, availableBytes: quotaBytes - 240_001_000 } }} />);
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      expect(screen.getByText(/1 GB = 1,000,000,000 bytes/)).toBeInTheDocument();
    });

  it("explains unreconciled zero counters and pending reservations", () => {
    render(<StorageUsage state={{ status: "success", data: { ...usage, usedBytes: 0, reservedBytes: 0, availableBytes: usage.quotaBytes } }} />);
    expect(screen.getByText(/No reconciliation check has been reported/)).toBeInTheDocument();
    expect(screen.getByText(/Reserved bytes are held/)).toBeInTheDocument();
  });

  it("does not treat a reconciliation timestamp as proof that legacy files were counted", () => {
    render(<StorageUsage state={{ status: "success", data: { ...usage, usedBytes: 0, reservedBytes: 0,
      availableBytes: usage.quotaBytes, lastReconciledAt: "2026-10-21T12:00:00Z" } }} />);
    expect(screen.getByText(/Last reconciliation check reported/)).toBeInTheDocument();
    expect(screen.getByText(/timestamp alone does not confirm that all existing files have been counted/)).toBeInTheDocument();
    expect(screen.queryByText(/fully reconciled|all files accounted/i)).not.toBeInTheDocument();
  });

  it.each(["audit", "off", "blocked", "enforce"])("explains over-quota behavior in %s mode", quotaMode => {
    render(<StorageUsage state={{ status: "success", data: { ...usage, usedBytes: 1_000_000_001,
      reservedBytes: 0, availableBytes: 0, overQuota: true, quotaMode, enforcementActive: quotaMode === "enforce" } }} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    if (quotaMode === "enforce") expect(screen.getByText("Quota enforced")).toBeInTheDocument();
    else expect(screen.queryByText("Quota enforced")).not.toBeInTheDocument();
    if (quotaMode === "audit") expect(screen.getByRole("alert")).toHaveTextContent("Quota enforcement is not active.");
    if (quotaMode === "blocked") expect(screen.getByText(/Storage admission is blocked pending/)).toBeInTheDocument();
  });

  it("shows nonzero usage against a zero allowance as full", () => {
    render(<StorageUsage state={{ status: "success", data: { ...usage, quotaBytes: 0, availableBytes: 0, overQuota: true } }} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("shows the backend used, available, and total values", async () => {
    render(<AccountStorage />);
    expect(await screen.findByText("240 MB")).toBeInTheDocument();
    expect(screen.getByText("760 MB")).toBeInTheDocument();
    expect(screen.getByText("1.0 GB")).toBeInTheDocument();
    expect(screen.getByText("24%")).toBeInTheDocument();
    expect(api.getStorageUsage).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it("shows valid usage counters without implying an unknown allowance", async () => {
    api.getStorageUsage.mockResolvedValue({
      ...usage, quotaBytes: null, availableBytes: null, plan: null,
    });
    const { container } = render(<AccountStorage />);
    expect(await screen.findByText("240 MB")).toBeInTheDocument();
    expect(screen.getByText("1.0 KB")).toBeInTheDocument();
    expect(screen.getByText("Membership: Unavailable")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Your current storage allowance is unavailable.");
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
    expect(container.querySelector(".omni-progress-wrap")).toBeNull();
  });

  it.each([
    ["unauthorized", /Sign in again/],
    ["forbidden", /Access to storage usage was denied/],
    ["not_found", /storage usage endpoint was not found/],
    ["rate_limited", /temporarily rate limited/],
    ["unavailable", /Storage usage is unavailable right now/],
  ])("shows a safe %s error and no fabricated zero", (code, message) => {
    render(<StorageUsage state={{ status: "error", data: null, error: code }} />);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("alert")).toHaveTextContent("No usage value has been assumed.");
    expect(screen.queryByText("0 B")).not.toBeInTheDocument();
  });

  it("clears old usage while refreshing and displays the new backend projection", async () => {
    let resolveRefresh;
    api.getStorageUsage.mockResolvedValueOnce(usage).mockImplementationOnce(() => new Promise(resolve => { resolveRefresh = resolve; }));
    render(<AccountStorage />);
    expect(await screen.findByText("240 MB")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh usage" }));
    expect(screen.getByText(/Loading personal storage usage/)).toBeInTheDocument();
    expect(screen.queryByText("240 MB")).not.toBeInTheDocument();
    resolveRefresh({ ...usage, usedBytes: 0, reservedBytes: 0, availableBytes: 1_000_000_000 });
    expect(await screen.findAllByText("0 B")).toHaveLength(2);
    expect(screen.getAllByText("1.0 GB")).toHaveLength(2);
    await waitFor(() => expect(api.getStorageUsage).toHaveBeenCalledTimes(2));
  });
});
