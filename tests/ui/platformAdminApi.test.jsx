import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  getToken: vi.fn(() => "token-123"),
  clearSession: vi.fn(),
  authUrl: vi.fn((path) => path),
}));

vi.mock("../../src/ui/lib/session", () => session);

import { listAllOrganizations } from "../../src/ui/lib/platformAdminApi";

beforeEach(() => {
  session.getToken.mockReturnValue("token-123");
  session.clearSession.mockReset();
  session.authUrl.mockImplementation((path) => path);
});

afterEach(() => vi.unstubAllGlobals());

describe("platform-admin API client", () => {
  it("GETs every organization with default pagination and no search", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{ id: 1, name: "Acme", status: "active", owner_email: "a@acme.test" }],
      total: 1, page: 1, page_size: 100, total_pages: 1,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listAllOrganizations();

    expect(fetchMock).toHaveBeenCalledWith("/platform/orgs?page=1&page_size=100", expect.objectContaining({
      headers: { Accept: "application/json", Authorization: "Bearer token-123" },
    }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Acme");
  });

  it("includes the search param when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [], total: 0, page: 1, page_size: 100, total_pages: 0,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await listAllOrganizations({ search: "acme" });

    expect(fetchMock).toHaveBeenCalledWith("/platform/orgs?page=1&page_size=100&search=acme", expect.anything());
  });

  it("omits an empty search param rather than sending search=", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [], total: 0, page: 1, page_size: 100, total_pages: 0,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await listAllOrganizations({ search: "" });

    expect(fetchMock).toHaveBeenCalledWith("/platform/orgs?page=1&page_size=100", expect.anything());
  });

  it("omits authorization when there is no token", async () => {
    session.getToken.mockReturnValue("");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await listAllOrganizations();

    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Accept: "application/json" });
  });

  it("clears the session on a 401 and reports the JSON error detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "expired token" }), {
      status: 401, statusText: "Unauthorized", headers: { "content-type": "application/json" },
    })));

    await expect(listAllOrganizations()).rejects.toMatchObject({ message: "expired token", status: 401 });
    expect(session.clearSession).toHaveBeenCalledOnce();
  });

  it("falls back to status text when an error has no JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream unavailable", {
      status: 502, statusText: "Bad Gateway",
    })));

    await expect(listAllOrganizations()).rejects.toMatchObject({ message: "Bad Gateway", status: 502 });
  });
});
