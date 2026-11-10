import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: "user-5-token", version: 1, listeners: new Set() }));
vi.mock("../../src/ui/lib/session", () => ({
  getToken: () => session.token,
  getSessionVersion: () => session.version,
  isElectron: () => false,
  onSessionChange: callback => { session.listeners.add(callback); return () => session.listeners.delete(callback); },
}));
import AccountStorage from "../../src/ui/pages/AccountStorage";
import { formatHeldPercent, formatStorageBytes, MIN_VISIBLE_SEGMENT_PX, storageSegments } from "../../src/ui/lib/storageDashboard";

const QUOTA = 1_000_000_000;
// [label, used, reserved, expected percentage text]
const LEVELS = [
  ["0", 0, 0, "0%"],
  ["60 B", 60, 0, "<1%"],
  ["0.5%", 5_000_000, 0, "<1%"],
  ["1%", 10_000_000, 0, "1%"],
  ["45%", 400_000_000, 50_000_000, "45%"],
  ["99.99%", 999_900_000, 0, "99%"],
  ["exactly full", 900_000_000, 100_000_000, "100%"],
];

describe("held percentage label", () => {
  it.each(LEVELS)("%s of the allowance reads %s", (_, used, reserved, text) => {
    expect(formatHeldPercent(used + reserved, QUOTA)).toBe(text);
  });
  it.each([
    [15_000_000, "1.5%"], [99_990_000, "9.9%"], [100_000_000, "10%"], [455_000_000, "45%"], [1_200_000_000, "120%"],
  ])("rounds %s held down to %s (one decimal below 10%%)", (held, text) => {
    expect(formatHeldPercent(held, QUOTA)).toBe(text);
  });
  it("has no percentage without an allowance", () => {
    expect(formatHeldPercent(200, 0)).toBeNull();
    expect(formatHeldPercent(200, null)).toBeNull();
  });
  it("stays exact for very large counters", () => {
    expect(formatHeldPercent(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER)).toBe("99%");
  });
});

describe("sizes round down", () => {
  it.each([
    [999_999_940, "999.9 MB"], [999_999, "999.9 KB"], [1_999, "1.9 KB"], [1_550, "1.5 KB"],
    [999_999_999_999, "999.9 GB"], [20_000_000_000, "20.0 GB"], [60, "60 B"], [0, "0 B"],
  ])("formats %s B as %s", (bytes, text) => {
    expect(formatStorageBytes(bytes)).toBe(text);
  });
});

describe("minimum visible segment", () => {
  it.each(LEVELS)("%s: used and reserved are visible exactly when non-zero", (_, used, reserved) => {
    const { parts } = storageSegments({ usedBytes: used, reservedBytes: reserved, availableBytes: QUOTA - used - reserved, quotaBytes: QUOTA });
    const byName = Object.fromEntries(parts.map(part => [part.name, part]));
    expect(byName.used.minVisible).toBe(used > 0);
    expect(byName.reserved.minVisible).toBe(reserved > 0);
    expect(byName.available.minVisible).toBe(false);
  });
});

const usage = (used, reserved) => ({
  owner_type: "USER", owner_id: "5", used_bytes: used, reserved_bytes: reserved,
  available_bytes: Math.max(0, QUOTA - used - reserved), quota_bytes: QUOTA, membership_plan: "free",
  over_quota: used + reserved > QUOTA, quota_mode: "audit", enforcement_active: false, entitlement_status: "fresh",
});
let body;
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => ({ ok: true, status: 200, json: async () => body }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); session.listeners.clear(); });

describe("Membership & storage summary", () => {
  it.each(LEVELS)("%s: label reads %s used or reserved and non-zero parts keep a minimum width", async (_, used, reserved, text) => {
    body = usage(used, reserved);
    const { container } = render(<AccountStorage />);
    expect(await screen.findByText(`${text} used or reserved`)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Personal storage:/ })).toHaveAccessibleName(new RegExp(`${text.replace(/[<%.]/g, m => `\\${m}`)} used or reserved\\.$`));
    const segment = name => container.querySelector(`.storage-dashboard__segment--${name}`);
    expect(segment("used").style.minWidth).toBe(used > 0 ? `${MIN_VISIBLE_SEGMENT_PX}px` : "");
    expect(segment("reserved").style.minWidth).toBe(reserved > 0 ? `${MIN_VISIBLE_SEGMENT_PX}px` : "");
    expect(segment("available").style.minWidth).toBe("");
  });

  it("shows 999,999,940 B available as 999.9 MB, never 1000.0 MB", async () => {
    body = usage(60, 0);
    render(<AccountStorage />);
    await screen.findByText("<1% used or reserved");
    const available = screen.getByText("Available", { selector: "dt" }).nextElementSibling.textContent;
    expect(available).toBe("999.9 MB");
    expect(screen.queryByText(/1000\.0 MB/)).not.toBeInTheDocument();
  });
});
