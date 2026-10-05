import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  authUrl: vi.fn(path => `http://auth${path}`),
  getToken: vi.fn(() => "token-a"),
  getSessionVersion: vi.fn(() => 1),
  clearSession: vi.fn(),
}));
vi.mock("../../src/ui/lib/session", () => session);

import { listMfaDevices, listSessions, revokeSession } from "../../src/ui/lib/securityApi";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  session.getToken.mockReturnValue("token-a");
  session.getSessionVersion.mockReturnValue(1);
  session.clearSession.mockReset();
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
