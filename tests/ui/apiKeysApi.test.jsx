import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  authUrl: vi.fn((p) => `http://auth${p}`),
  getToken: vi.fn(() => "tok"),
  getSessionVersion: vi.fn(() => 1),
  clearSession: vi.fn(),
}));
vi.mock("../../src/ui/lib/session", () => session);

import { createMyApiKey, listMyApiKeys, revokeMyApiKey } from "../../src/ui/lib/apiKeysApi";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => { session.getToken.mockReturnValue("tok"); session.getSessionVersion.mockReturnValue(1); session.clearSession.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe("API keys client", () => {
  it("lists, creates and revokes with the bearer token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ key: "omni_sk_x" }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await listMyApiKeys()).toEqual([]);
    expect(await createMyApiKey("ci")).toEqual({ key: "omni_sk_x" });
    expect(await revokeMyApiKey(7)).toBeNull();

    expect(fetchMock.mock.calls[0][0]).toBe("http://auth/me/api-keys");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", body: JSON.stringify({ name: "ci" }) });
    expect(fetchMock.mock.calls[2][0]).toBe("http://auth/me/api-keys/7");
    expect(fetchMock.mock.calls[2][1].method).toBe("DELETE");
  });

  it("omits Authorization without a token and surfaces errors", async () => {
    session.getToken.mockReturnValue(null);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ detail: "Not an active member" }, 403))
      .mockResolvedValueOnce(new Response("nope", { status: 500, statusText: "Server Error" }))
      .mockResolvedValueOnce(json({}, 401)));

    await expect(listMyApiKeys()).rejects.toMatchObject({ message: "Not an active member", status: 403 });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
    await expect(listMyApiKeys()).rejects.toMatchObject({ message: "Server Error", status: 500 });
    await expect(listMyApiKeys()).resolves.toBeNull();
    expect(session.clearSession).toHaveBeenCalledOnce();
  });

  it("forwards abort signals and rejects stale account responses", async () => {
    const signal = new AbortController().signal;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([{ id: 1 }])));
    session.getSessionVersion.mockReturnValueOnce(1).mockReturnValueOnce(2);
    expect(await listMyApiKeys({ signal })).toBeNull();
    expect(fetch.mock.calls[0][1].signal).toBe(signal);
  });
});
