import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authUrl, clearSession, confirmOAuthLink, consumeOAuthRedirectParams, getCurrentUser,
  getCurrentUserSync, getOAuthLoginUrl, hasPermission, isElectron, loginWithLicenseKey,
  loginWithPassword, logout, oauthProviders, onSessionChange, refresh, setSession,
} from "../../src/ui/lib/session";

afterEach(() => vi.restoreAllMocks());

describe("session boundary", () => {
  it("builds auth URLs from configured host and stores cookie-backed sessions", () => {
    window.__OMNIBIOAI_CONFIG__ = { hostIp: "auth.example" };
    expect(authUrl("/auth/login")).toBe("http://auth.example:8001/auth/login");
    setSession("access", "refresh");
    expect(localStorage.getItem("omnibioai_access_token")).toBe("access");
    expect(localStorage.getItem("omnibioai_refresh_token")).toBe("refresh");
    expect(document.cookie).toContain("omnibioai_access_token=access");
    clearSession();
    expect(localStorage.length).toBe(0);
  });

  it("validates and caches the current user, then clears invalid sessions", async () => {
    setSession("token");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ valid: true, user_id: 7, email: "a@b.test", permissions: ["manage_roles"] }), { status: 200 }));
    const user = await getCurrentUser();
    expect(user).toMatchObject({ userId: 7, email: "a@b.test", permissions: ["manage_roles"] });
    await getCurrentUser();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ valid: false }), { status: 200 }));
    expect(await getCurrentUser({ force: true })).toBeNull();
    expect(localStorage.getItem("omnibioai_access_token")).toBeNull();
  });

  it("refreshes successfully and clears state for rejected refreshes", async () => {
    setSession("old", "refresh");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "new", refresh_token: "refresh" }), { status: 200 }));
    await expect(refresh()).resolves.toBe("new");
    expect(localStorage.getItem("omnibioai_access_token")).toBe("new");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(refresh()).resolves.toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("logs out locally even when the server is unreachable", async () => {
    setSession("access", "refresh");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    await logout();
    expect(localStorage.length).toBe(0);
  });

  it("maps license failures and consumes OAuth redirects without replay", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ valid: false, reason: "expired" }), { status: 400 }));
    await expect(loginWithLicenseKey(" K ", "a@b.test")).rejects.toThrow("This license key has expired");

    window.history.replaceState({}, "", "/?status=link_required&link_token=lt&provider=github&email=a%40b.test");
    expect(consumeOAuthRedirectParams()).toEqual({ type: "link_required", linkToken: "lt", provider: "github", email: "a@b.test" });
    expect(window.location.search).toBe("");
    expect(getOAuthLoginUrl("google")).toContain("/auth/google/login");
  });

  it("falls back to a generic license error for an unmapped reason", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ valid: false, reason: "unknown_thing" }), { status: 400 }));
    await expect(loginWithLicenseKey("k", "a@b.test")).rejects.toThrow("License validation failed");
  });

  it("activates a valid license key and starts a session", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ valid: true, access_token: "t", refresh_token: "r" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ valid: true, user_id: 4, email: "k@k.test" }), { status: 200 }));
    const user = await loginWithLicenseKey(" KEY ", "k@k.test", "desktop");
    expect(user).toMatchObject({ userId: 4, email: "k@k.test" });
    clearSession();
  });

  it("falls back to a fixed LAN IP when no host is configured", () => {
    delete window.__OMNIBIOAI_CONFIG__;
    expect(authUrl("/x")).toBe("http://192.168.86.234:8001/x");
  });

  it("logs in with a password and rejects on a 401 or other failure", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok", refresh_token: "ref" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ valid: true, user_id: 1, email: "a@b.test" }), { status: 200 }));
    const user = await loginWithPassword("a@b.test", "secret");
    expect(user).toMatchObject({ userId: 1, email: "a@b.test" });
    expect(getCurrentUserSync()).toMatchObject({ email: "a@b.test" });
    expect(hasPermission("manage_roles")).toBe(false);
    clearSession();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(loginWithPassword("a@b.test", "wrong")).rejects.toThrow("Invalid email or password");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 500 }));
    await expect(loginWithPassword("a@b.test", "wrong")).rejects.toThrow("Login failed");
  });

  it("skips the logout request entirely when there is no refresh token", async () => {
    setSession("access-only");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await logout();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no-ops a refresh with no refresh token and fails open on a network error", async () => {
    expect(await refresh()).toBeNull();
    setSession("a", "r");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    await expect(refresh()).resolves.toBeNull();
  });

  it("fails open on a network error while validating the current user", async () => {
    setSession("tok");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    expect(await getCurrentUser({ force: true })).toBeNull();
  });

  it("detects Electron via either preload bridge", () => {
    delete window.api; delete window.electronAPI;
    expect(isElectron()).toBe(false);
    window.api = {};
    expect(isElectron()).toBe(true);
    delete window.api;
  });

  it("subscribes and unsubscribes from session-change events", () => {
    const cb = vi.fn();
    const off = onSessionChange(cb);
    setSession("x");
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    setSession("y");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("lists OAuth providers and confirms an account link, surfacing JSON and non-JSON failures", async () => {
    expect(oauthProviders()).toEqual(["google", "github", "microsoft"]);

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "t", refresh_token: "r" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ valid: true, user_id: 9, email: "z@z.test" }), { status: 200 }));
    const user = await confirmOAuthLink("lt", "pw");
    expect(user).toMatchObject({ userId: 9 });
    clearSession();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ detail: "bad password" }), { status: 400 }));
    await expect(confirmOAuthLink("lt", "bad")).rejects.toThrow("bad password");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<html></html>", { status: 500 }));
    await expect(confirmOAuthLink("lt", "bad")).rejects.toThrow("Could not confirm the link");
  });

  it("parses an error redirect and a bare success redirect with no tokens", () => {
    expect(consumeOAuthRedirectParams()).toBeNull();

    window.history.replaceState({}, "", "/?status=error&error=denied");
    expect(consumeOAuthRedirectParams()).toEqual({ type: "error", message: "denied" });

    window.history.replaceState({}, "", "/?status=success");
    expect(consumeOAuthRedirectParams()).toEqual({ type: "success" });

    window.history.replaceState({}, "", "/?status=success&access_token=at&refresh_token=rt");
    expect(consumeOAuthRedirectParams()).toEqual({ type: "success" });
    expect(localStorage.getItem("omnibioai_access_token")).toBe("at");
    clearSession();
  });
});
