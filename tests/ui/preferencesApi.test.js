import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ getToken: vi.fn(), getSessionVersion: vi.fn(), clearSession: vi.fn(), authUrl: path => path }));
vi.mock("../../src/ui/lib/session", () => session);
import { getPreferences, updatePreferences, validTimezone } from "../../src/ui/lib/preferencesApi";
beforeEach(() => { vi.clearAllMocks(); session.getToken.mockReturnValue("TEST-A"); session.getSessionVersion.mockReturnValue(1); });
afterEach(() => vi.unstubAllGlobals());
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
describe("preferences client", () => {
  it("uses canonical authenticated GET and partial PATCH with no-store", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ timezone: null })).mockResolvedValueOnce(json({ timezone: "UTC", ignored: true })));
    expect(await getPreferences()).toEqual({ timezone: null });
    expect(await updatePreferences({ timezone: "UTC" })).toEqual({ timezone: "UTC" });
    expect(fetch).toHaveBeenNthCalledWith(1, "/me/preferences", expect.objectContaining({ method: "GET", cache: "no-store", credentials: "omit", headers: expect.objectContaining({ Authorization: "Bearer TEST-A" }) }));
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ timezone: "UTC" });
  });
  it("does not request unauthenticated preferences", async () => {
    session.getToken.mockReturnValue(null); vi.stubGlobal("fetch", vi.fn());
    expect(await getPreferences()).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
  it("invalidates only the current session on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 401)));
    expect(await getPreferences()).toBeNull(); expect(session.clearSession).toHaveBeenCalledOnce();
  });
  it.each([403, 422, 500])("normalizes HTTP %s without raw server errors", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "internal" }, status)));
    await expect(updatePreferences({ timezone: "UTC" })).rejects.toThrow("Preferences service unavailable");
  });
  it.each([{}, null, { timezone: "CST" }, { timezone: "Invalid/Zone" }])("rejects malformed data %j", async value => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(value)));
    await expect(getPreferences()).rejects.toThrow("Invalid preferences response");
  });
  it("propagates network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    await expect(getPreferences()).rejects.toThrow("network");
  });
  it("rejects stale fetch and body responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { session.getToken.mockReturnValue("TEST-B"); return json({}, 401); }));
    expect(await getPreferences()).toBeNull(); expect(session.clearSession).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { session.getSessionVersion.mockReturnValue(2); return { timezone: "UTC" }; } }));
    expect(await updatePreferences({ timezone: "UTC" })).toBeNull();
  });
  it("validates IANA identifiers and UTC, not abbreviations", () => {
    for (const value of [null, "UTC", "America/Indiana/Indianapolis", "Asia/Kolkata"]) expect(validTimezone(value)).toBe(true);
    for (const value of [undefined, 1, "CST", "", "Invalid/Zone"]) expect(validTimezone(value)).toBe(false);
  });
});
