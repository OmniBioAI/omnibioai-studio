import { afterEach, describe, expect, it, vi } from "vitest";
import { isElectron, isWeb } from "../../src/ui/lib/web/platform";
import {
  checkHealth, checkUpdate, getPlatform, loadConfig, startDocker, stopDocker, streamLogs,
} from "../../src/ui/lib/web/webApi";

const { getToken, clearSession } = vi.hoisted(() => ({
  getToken: vi.fn(() => null),
  clearSession: vi.fn(),
}));
vi.mock("../../src/ui/lib/session", () => ({
  authUrl: (path) => `http://auth.test:8001${path}`,
  getToken,
  clearSession,
}));

import { createRole, deleteRole, getRole, getUserRoles, listRoles, setUserRoles, updateRole } from "../../src/ui/lib/rolesApi";

afterEach(() => vi.restoreAllMocks());

describe("web platform detection", () => {
  it("reports web when neither Electron bridge is present, and Electron when either is", () => {
    delete window.api;
    delete window.electronAPI;
    expect(isElectron()).toBe(false);
    expect(isWeb()).toBe(true);
    window.api = {};
    expect(isElectron()).toBe(true);
    expect(isWeb()).toBe(false);
    delete window.api;
    window.electronAPI = {};
    expect(isElectron()).toBe(true);
    delete window.electronAPI;
  });
});

describe("web API stand-in", () => {
  it("returns beta-mode defaults and platform info", async () => {
    expect(await loadConfig()).toMatchObject({ mode: "beta" });
    const platform = await getPlatform();
    expect(platform.platform).toBe("web");
  });

  it("reports router health as ok or not, and never throws when the endpoint is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 200 }));
    expect(await checkHealth()).toEqual({ ok: true });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 503 }));
    expect(await checkHealth()).toEqual({ ok: false });
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    expect(await checkHealth()).toEqual({ ok: false });
  });

  it("no-ops Docker lifecycle calls and update checks in web mode", async () => {
    expect((await startDocker()).web).toBe(true);
    expect((await stopDocker()).web).toBe(true);
    expect(await checkUpdate()).toEqual({ available: false, web: true });
  });

  it("calls back once with an informational line and returns a no-op unsubscribe", () => {
    const cb = vi.fn();
    const unsub = streamLogs(cb);
    expect(cb).toHaveBeenCalledWith("Live log streaming isn't available in web mode.");
    expect(() => unsub()).not.toThrow();
    expect(() => streamLogs()).not.toThrow(); // no callback supplied
  });
});

describe("roles API client", () => {
  it("sends bearer-authenticated requests and parses JSON responses", async () => {
    getToken.mockReturnValue("tok");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: "r1", name: "Reader" }]), { status: 200 })
    );
    const roles = await listRoles();
    expect(roles).toEqual([{ id: "r1", name: "Reader" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://auth.test:8001/roles",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer tok" }) })
    );
  });

  it("omits the Authorization header when there is no token", async () => {
    getToken.mockReturnValue(null);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ id: "r1" }), { status: 200 }));
    await getRole("r1");
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers.Authorization).toBeUndefined();
  });

  it("clears the session on a 401 and still throws using the response detail", async () => {
    getToken.mockReturnValue("tok");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ detail: "expired token" }), { status: 401 }));
    await expect(listRoles()).rejects.toThrow("expired token");
    expect(clearSession).toHaveBeenCalled();
  });

  it("falls back to the status text when an error body isn't JSON", async () => {
    getToken.mockReturnValue("tok");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<html></html>", { status: 500, statusText: "Server Error" }));
    await expect(createRole("Reader", ["view"])).rejects.toThrow("Server Error");
  });

  it("returns null for a 204 and posts JSON bodies for writes", async () => {
    getToken.mockReturnValue("tok");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await deleteRole("r1")).toBeNull();
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe("DELETE");
  });

  it("covers the remaining role and user-role endpoints", async () => {
    getToken.mockReturnValue("tok");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(["r1"]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await updateRole("r1", ["manage_config"]);
    await getUserRoles("u1");
    await setUserRoles("u1", ["r1"]);
  });
});
