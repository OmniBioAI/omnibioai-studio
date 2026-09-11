import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  getToken: vi.fn(() => "token-123"),
  clearSession: vi.fn(),
}));

vi.mock("../../src/ui/lib/session", () => session);

import {
  getBillingSummary,
  getCostBreakdown,
  getCostHistory,
  getSubscription,
  getUsageLimits,
  getUsageSummary,
} from "../../src/ui/lib/billingApi";

beforeEach(() => {
  session.getToken.mockReturnValue("token-123");
  session.clearSession.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("billing API client", () => {
  it("uses authenticated GET requests for every reporting endpoint", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await getSubscription("org/7");
    await getUsageLimits("org/7");
    await getBillingSummary("org/7");
    await getUsageSummary("org/7", "2026-01-01", null);
    await getCostHistory("org/7", "2026-01-01", "2026-01-31");
    await getCostBreakdown("org/7", "2026-01-01", "2026-01-31");
    await getCostBreakdown("org/7", "2026-01-01", "2026-01-31", "month");

    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/billing/organizations/org/7/subscription", expect.objectContaining({
      method: "GET",
      headers: { Accept: "application/json", Authorization: "Bearer token-123" },
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/billing/organizations/org/7/usage?start_date=2026-01-01", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(6, "/billing/organizations/org/7/cost-breakdown?start_date=2026-01-01&end_date=2026-01-31&group_by=service", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(7, "/billing/organizations/org/7/cost-breakdown?start_date=2026-01-01&end_date=2026-01-31&group_by=month", expect.anything());
  });

  it("omits authorization when there is no token", async () => {
    session.getToken.mockReturnValue("");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await getSubscription("org-1");

    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Accept: "application/json" });
  });

  it("clears the session and reports JSON error details for 401 responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "expired token" }), {
      status: 401,
      statusText: "Unauthorized",
      headers: { "content-type": "application/json" },
    })));

    await expect(getBillingSummary("org-1")).rejects.toMatchObject({ message: "expired token", status: 401 });
    expect(session.clearSession).toHaveBeenCalledOnce();
  });

  it("falls back to status text when an error has no JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream unavailable", {
      status: 502,
      statusText: "Bad Gateway",
    })));

    await expect(getCostHistory("org-1", "a", "b")).rejects.toMatchObject({ message: "Bad Gateway", status: 502 });
    expect(session.clearSession).not.toHaveBeenCalled();
  });

  it("falls back to status text when an error JSON body has no detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "content-type": "application/json" },
    })));

    await expect(getSubscription("org-1")).rejects.toMatchObject({ message: "Internal Server Error", status: 500 });
  });
});
