import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authUrl, clearSession, consumeOAuthRedirectParams, getCurrentUser,
  getOAuthLoginUrl, loginWithLicenseKey, logout, refresh, setSession,
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
});
