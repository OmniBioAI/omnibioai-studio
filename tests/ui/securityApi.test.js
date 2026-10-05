import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  authUrl: vi.fn(path => `http://auth${path}`),
  getToken: vi.fn(() => "token-a"),
  getSessionVersion: vi.fn(() => 1),
  clearSession: vi.fn(),
}));
vi.mock("../../src/ui/lib/session", () => session);

import { listMfaDevices, listSessions, revokeSession } from "../../src/ui/lib/securityApi";
import { startMfaEnrollment, verifyMfaEnrollment, removeMfaDevice, getRecoveryCodeStatus, generateRecoveryCodes, regenerateRecoveryCodes } from "../../src/ui/lib/securityApi";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  session.getToken.mockReturnValue("token-a");
  session.getSessionVersion.mockReturnValue(1);
  session.clearSession.mockReset();
});

describe("canonical MFA lifecycle client", () => {
  const operations = [
    ["start", startMfaEnrollment, "/totp/enroll", "POST", { device_id: 7, otpauth_uri: "otpauth://totp/TEST?secret=TEST-MFA-SECRET-NOT-REAL" }, 201],
    ["verify", () => verifyMfaEnrollment(7, "000000"), "/totp/verify", "POST", { id: 7, verified_at: "2026-01-01" }, 200],
    ["remove", () => removeMfaDevice(7), "/devices/7", "DELETE", null, 204],
    ["status", getRecoveryCodeStatus, "/recovery-codes", undefined, { remaining: 0 }, 200],
    ["generate", generateRecoveryCodes, "/recovery-codes", "POST", { codes: ["TEST-RECOVERY-CODE-0001"] }, 201],
    ["regenerate", regenerateRecoveryCodes, "/recovery-codes/regenerate", "POST", { codes: ["TEST-RECOVERY-CODE-0002"] }, 200],
  ];
  it.each(operations)("%s sends the canonical request with no-store", async (_, call, path, method, body, status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status === 204 ? new Response(null, { status }) : json(body, status)));
    expect(await call()).toEqual(body);
    expect(fetch.mock.calls[0][0]).toBe(`http://auth/users/me/mfa${path}`);
    expect(fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store", credentials: "omit" });
    expect(fetch.mock.calls[0][1].method).toBe(method);
    if (path === "/totp/verify") {
      expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ device_id: 7, code: "000000" });
      expect(fetch.mock.calls[0][1].headers["Content-Type"]).toBe("application/json");
    }
  });
  it.each(operations)("%s handles service failure without leaking error bodies", async (_, call) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "TEST-MFA-SECRET-NOT-REAL" }, 500)));
    await expect(call()).rejects.toMatchObject({ status: 500, message: "Personal security service unavailable. Please try again." });
  });
  it.each(operations)("%s rejects a stale response without invalidating the new account", async (_, call) => {
    vi.stubGlobal("fetch", vi.fn(async () => { session.getSessionVersion.mockReturnValue(2); return json({}, 401); }));
    expect(await call()).toBeNull();
    expect(session.clearSession).not.toHaveBeenCalled();
  });
  it.each([
    ["Invalid verification code", "Invalid verification code. Try a new code from your authenticator."],
    ["This enrollment is no longer active -- start a new one", "This enrollment is no longer active. Start again."],
    ["This device is already verified", "This authenticator is already verified. Close setup and refresh the device list."],
  ])("maps the verified IAM error %s", async (detail, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail }, 400)));
    await expect(verifyMfaEnrollment(7, "000000")).rejects.toMatchObject({ status: 400, mfaMessage: message });
  });
  it.each([403, 404, 422, 429])("preserves HTTP %s without inventing error detail", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "private" }, status)));
    await expect(verifyMfaEnrollment(7, "000000")).rejects.toMatchObject({ status });
  });
  it("sanitizes unexpected and non-JSON 400s", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ detail: "TEST-MFA-SECRET-NOT-REAL" }, 400)).mockResolvedValueOnce(new Response("internal", { status: 400 })));
    for (let i = 0; i < 2; i++) await expect(verifyMfaEnrollment(7, "000000")).rejects.toMatchObject({ message: "Personal security service unavailable. Please try again." });
  });
  it("discards session changes during error parsing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => {
      session.getToken.mockReturnValue("token-b"); return { detail: "Invalid verification code" };
    } }));
    expect(await verifyMfaEnrollment(7, "000000")).toBeNull();
  });
  it("forwards network and abort failures without automatic retries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("network")).mockRejectedValueOnce(new DOMException("aborted", "AbortError")));
    await expect(startMfaEnrollment()).rejects.toBeInstanceOf(TypeError);
    await expect(listMfaDevices({ signal: new AbortController().signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("personal security API client", () => {
  it("lists MFA devices and sessions with canonical authenticated routes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json([{ id: 2 }])).mockResolvedValueOnce(json([{ session_id: "s1" }]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await listMfaDevices()).toEqual([{ id: 2 }]);
    expect(await listSessions()).toEqual([{ session_id: "s1" }]);
    expect(fetchMock.mock.calls[0][0]).toBe("http://auth/users/me/mfa/devices");
    expect(fetchMock.mock.calls[1][0]).toBe("http://auth/sessions");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit", cache: "no-store" });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer token-a");
  });

  it("revokes a URL-encoded session and accepts a no-content response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    expect(await revokeSession("family/id")).toBeNull();
    expect(fetch.mock.calls[0][0]).toBe("http://auth/sessions/family%2Fid/revoke");
    expect(fetch.mock.calls[0][1].method).toBe("POST");
  });

  it.each([403, 404, 409, 500])("surfaces sanitized HTTP %s failures", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "internal detail" }, status)));
    await expect(listSessions()).rejects.toMatchObject({
      message: "Personal security service unavailable. Please try again.", status,
    });
  });

  it("clears an invalid session on 401 without returning stale data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 401)));
    await expect(listMfaDevices()).resolves.toBeNull();
    expect(session.clearSession).toHaveBeenCalledOnce();
  });

  it("omits authorization when signed out and forwards abort signals", async () => {
    session.getToken.mockReturnValue(null);
    const signal = new AbortController().signal;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    await listSessions({ signal });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(fetch.mock.calls[0][1].signal).toBe(signal);
  });

  it("rejects responses after the session generation or token changes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([{ session_id: "user-a" }])));
    session.getSessionVersion.mockReturnValueOnce(1).mockReturnValueOnce(2);
    expect(await listSessions()).toBeNull();

    session.getSessionVersion.mockReturnValue(1);
    session.getToken.mockReturnValueOnce("token-a").mockReturnValueOnce("token-b");
    expect(await listSessions()).toBeNull();
  });

  it("rejects a session change that occurs while parsing JSON", async () => {
    const response = { ok: true, status: 200, json: vi.fn(async () => {
      session.getSessionVersion.mockReturnValue(2);
      return [{ id: 1 }];
    }) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    expect(await listMfaDevices()).toBeNull();
  });
});
