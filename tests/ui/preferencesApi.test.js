import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ getToken: vi.fn(), getSessionVersion: vi.fn(), clearSession: vi.fn(), authUrl: path => path }));
vi.mock("../../src/ui/lib/session", () => session);
import { getPreferences, updatePreferences, validTimezone } from "../../src/ui/lib/preferencesApi";
import { PERSONALIZATION_DEFAULTS, validatePersonalization } from "../../src/ui/lib/personalization";
beforeEach(() => { vi.clearAllMocks(); session.getToken.mockReturnValue("TEST-A"); session.getSessionVersion.mockReturnValue(1); });
afterEach(() => vi.unstubAllGlobals());
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
describe("preferences client", () => {
  it("loads and saves only canonical personalization data through the personal API", async () => {
    const data = { timezone: "UTC", ...PERSONALIZATION_DEFAULTS, personal_instructions: "Plain text", preferred_language: "fr" };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => json({ ...data, user_id: 9, unknown: true })));
    expect(await getPreferences()).toEqual(data);
    expect(await updatePreferences({ personal_instructions: "Plain text", preferred_language: "fr" })).toEqual(data);
    expect(fetch).toHaveBeenLastCalledWith("/me/preferences", expect.objectContaining({ method: "PATCH", cache: "no-store", credentials: "omit" }));
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ personal_instructions: "Plain text", preferred_language: "fr" });
  });
  it.each([{ user_id: 2 }, { organization_id: 1 }, { timezone: "CST" }, { response_style: "verbose" }, { technical_level: "admin" }, { preferred_language: "en-US" }, { personal_instructions: "x".repeat(2001) }, { personal_instructions: 42 }])("rejects invalid or identity-bearing PATCH data before fetching", async changes => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(updatePreferences(changes)).rejects.toMatchObject({ code: "PREFERENCES_VALIDATION" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reports server validation without exposing echoed instructions or backend details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "private input" }, 422)));
    await expect(updatePreferences({ response_style: "concise" })).rejects.toMatchObject({ message: "Check your preference values and try again.", code: "PREFERENCES_VALIDATION" });
  });
  it.each([{ response_style: "concise" }, { ...PERSONALIZATION_DEFAULTS, technical_level: null }, { ...PERSONALIZATION_DEFAULTS, personal_instructions: "x".repeat(2001) }, { ...PERSONALIZATION_DEFAULTS, preferred_language: "zz" }])("rejects partial or malformed personalization responses", async fields => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ timezone: null, ...fields })));
    await expect(getPreferences()).rejects.toThrow("Invalid preferences response");
  });
  it("does not confirm a personalization save from a legacy timezone-only response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ timezone: null })));
    await expect(updatePreferences({ response_style: "concise" })).rejects.toThrow("Invalid preferences response");
  });
  it("validates every supported language and Unicode instruction length consistently", () => {
    for (const language of [null, "en", "es", "fr", "de", "pt", "hi", "ja", "ko", "zh", "ar"]) {
      expect(validatePersonalization({ ...PERSONALIZATION_DEFAULTS, preferred_language: language, personal_instructions: "🧬".repeat(2000) })).toEqual({});
    }
    expect(validatePersonalization({ ...PERSONALIZATION_DEFAULTS, response_style: "__proto__", technical_level: "constructor", preferred_language: "toString" })).toHaveProperty("response_style");
    expect(Object.keys(validatePersonalization({ ...PERSONALIZATION_DEFAULTS, response_style: ["balanced"], technical_level: ["general"], preferred_language: ["en"] }))).toHaveLength(3);
  });
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
  it.each([403, 500])("normalizes HTTP %s without raw server errors", async status => {
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
