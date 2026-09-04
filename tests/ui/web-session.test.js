import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authUrl, clearSession, confirmOAuthLink, consumeOAuthRedirectParams,
  getCurrentUser, getCurrentUserSync, getOAuthLoginUrl, getRefreshToken, getToken,
  hasPermission, isElectron, loginWithLicenseKey, loginWithPassword, logout,
  oauthProviders, onSessionChange, refresh, setSession,
} from "../../src/ui/lib/web/session";

afterEach(() => vi.restoreAllMocks());

describe("web session boundary", () => {
  it("resolves auth URLs as same-origin relative paths", () => {
    expect(authUrl("/auth/login")).toBe("/auth/login");
  });

  it("stores and clears cookie-backed sessions", () => {
    setSession("access", "refresh");
    expect(getToken()).toBe("access");
    expect(getRefreshToken()).toBe("refresh");
    expect(document.cookie).toContain("omnibioai_access_token=access");
    clearSession();
    expect(getToken()).toBeNull();
    expect(document.cookie).not.toContain("omnibioai_access_token=access");
  });

  it("notifies session-change listeners and supports unsubscribe", () => {
    const cb = vi.fn();
    const off = onSessionChange(cb);
    setSession("a");
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    setSession("b");
    expect(cb).toHaveBeenCalledTimes(1);
    clearSession();
  });

  it("logs in with a password, maps a 401 to a friendly message, and logs a generic failure", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok", refresh_token: "ref" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ valid: true, user_id: 1, email: "a@b.test", roles: ["admin"], permissions: ["manage_roles"] }), { status: 200 }));
    const user = await loginWithPassword("a@b.test", "secret");
    expect(user).toMatchObject({ userId: 1, email: "a@b.test", roles: ["admin"], permissions: ["manage_roles"] });
    expect(getCurrentUserSync()).toMatchObject({ email: "a@b.test" });
    expect(hasPermission("manage_roles")).toBe(true);
    expect(hasPermission("manage_config")).toBe(false);
    clearSession();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(loginWithPassword("a@b.test", "wrong")).rejects.toThrow("Invalid email or password");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 500 }));
    await expect(loginWithPassword("a@b.test", "wrong")).rejects.toThrow("Login failed");
  });

  it("maps every known license failure reason and falls back through backend message then status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ valid: false, reason: "revoked" }), { status: 400 }));
    await expect(loginWithLicenseKey("k", "a@b.test")).rejects.toThrow("This license key has been revoked");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ valid: false, error: "custom backend error" }), { status: 400 }));
    await expect(loginWithLicenseKey("k", "a@b.test")).rejects.toThrow("custom backend error");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<html>gateway error</html>", { status: 502 }));
    await expect(loginWithLicenseKey("k", "a@b.test")).rejects.toThrow("License validation failed (502)");

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ valid: true, access_token: "t", refresh_token: "r" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ valid: true, user_id: 2, email: "c@d.test" }), { status: 200 }));
    const user = await loginWithLicenseKey(" KEY ", "c@d.test", "desktop");
    expect(user).toMatchObject({ userId: 2, email: "c@d.test", roles: [], permissions: [] });
    clearSession();
  });

  it("caches the current user and only refetches when forced or invalid", async () => {
    expect(await getCurrentUser()).toBeNull(); // no token yet

    setSession("tok");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ valid: true, user_id: 7, email: "a@b.test" }), { status: 200 }));
    const first = await getCurrentUser();
    expect(first).toMatchObject({ userId: 7 });
    const second = await getCurrentUser();
    expect(second).toBe(first); // served from cache, no second fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ valid: false }), { status: 200 }));
    expect(await getCurrentUser({ force: true })).toBeNull();
    expect(getToken()).toBeNull(); // cleared

    setSession("tok2");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("not json", { status: 200 }));
    expect(await getCurrentUser({ force: true })).toBeNull();

    setSession("tok3");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    expect(await getCurrentUser({ force: true })).toBeNull();
    clearSession();
  });

  it("refreshes access tokens and clears state on an expired or failed refresh", async () => {
    expect(await refresh()).toBeNull(); // no refresh token

    setSession("old", "ref");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "new", refresh_token: "ref" }), { status: 200 }));
    await expect(refresh()).resolves.toBe("new");
    expect(getToken()).toBe("new");

    setSession("old2", "ref2");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(refresh()).resolves.toBeNull();
    expect(getToken()).toBeNull();

    setSession("old3", "ref3");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    await expect(refresh()).resolves.toBeNull();
    clearSession();
  });

  it("logs out locally on both a successful and an unreachable server, and skips the call with no refresh token", async () => {
    setSession("access", "refresh");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 200 }));
    await logout();
    expect(getToken()).toBeNull();

    setSession("access2", "refresh2");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    await logout();
    expect(getToken()).toBeNull();

    setSession("access3"); // no refresh token at all
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockClear();
    await logout();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getToken()).toBeNull();
  });

  it("confirms an OAuth account link and surfaces backend or status-coded failures", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "t", refresh_token: "r" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ valid: true, user_id: 3, email: "e@f.test" }), { status: 200 }));
    const user = await confirmOAuthLink("link-token", "pw");
    expect(user).toMatchObject({ userId: 3 });
    clearSession();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ detail: "wrong password" }), { status: 400 }));
    await expect(confirmOAuthLink("link-token", "bad")).rejects.toThrow("wrong password");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 500 }));
    await expect(confirmOAuthLink("link-token", "bad")).rejects.toThrow("Could not confirm the link (500)");
  });

  it("reports platform, providers, and static OAuth login URLs", () => {
    expect(isElectron()).toBe(false);
    expect(oauthProviders()).toEqual(["google", "github", "microsoft"]);
    expect(getOAuthLoginUrl("github")).toBe("/auth/github/login");
  });

  it("parses every OAuth redirect outcome and strips the query string", () => {
    expect(consumeOAuthRedirectParams()).toBeNull(); // no status param

    window.history.replaceState({}, "", "/?status=error&error=denied");
    expect(consumeOAuthRedirectParams()).toEqual({ type: "error", message: "denied" });
    expect(window.location.search).toBe("");

    window.history.replaceState({}, "", "/?status=error");
    expect(consumeOAuthRedirectParams()).toEqual({ type: "error", message: "Sign-in failed" });

    window.history.replaceState({}, "", "/?status=link_required&link_token=lt&provider=github&email=a%40b.test");
    expect(consumeOAuthRedirectParams()).toEqual({ type: "link_required", linkToken: "lt", provider: "github", email: "a@b.test" });

    window.history.replaceState({}, "", "/?status=success");
    expect(consumeOAuthRedirectParams()).toEqual({ type: "success" });

    window.history.replaceState({}, "", "/?status=success&access_token=at&refresh_token=rt");
    expect(consumeOAuthRedirectParams()).toEqual({ type: "success" });
    expect(getToken()).toBe("at");
    clearSession();
  });
});
