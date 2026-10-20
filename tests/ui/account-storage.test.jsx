import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getStorageUsage: vi.fn() }));
vi.mock("../../src/ui/lib/artifactsApi", () => api);

import AccountStorage from "../../src/ui/pages/AccountStorage";
import { StorageUsage } from "../../src/ui/pages/Artifacts";

const usage = Object.freeze({
  usedBytes: 240_000_000, reservedBytes: 1_000, quotaBytes: 1_000_000_000,
  availableBytes: 759_999_000, plan: "free", overQuota: false,
  quotaMode: "audit", enforcementActive: false, entitlementStatus: "fresh",
});

beforeEach(() => api.getStorageUsage.mockReset().mockResolvedValue(usage));
afterEach(cleanup);

describe("Account Storage", () => {
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
