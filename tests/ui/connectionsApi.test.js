import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getConnection, putConnection, removeConnection } from "../../src/ui/lib/connectionsApi";
import { setSession } from "../../src/ui/lib/session";
const data = { provider: "openai", has_key: true, updated_at: null, updated_by_email: null };
const response = (body = data, status = 200) => ({ status, ok: status < 400, json: vi.fn().mockResolvedValue(body) });
beforeEach(() => { localStorage.setItem("omnibioai_access_token", "token"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response())); });
afterEach(() => vi.unstubAllGlobals());
it("projects only safe metadata and uses canonical no-store authenticated URL", async () => {
  expect(await getConnection(11)).toEqual({ configured: true, provider: "openai", canReplace: true, canRemove: true });
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/orgs\/11\/provider-keys$/), expect.objectContaining({ method: "GET", cache: "no-store", credentials: "omit", headers: { Accept: "application/json", Authorization: "Bearer token" } }));
});
it.each([null, [], {}, { ...data, has_key: "true" }, { ...data, provider: "other" }, { ...data, provider: null }, { configured: true, provider: "openai", allowed_actions: ["replace"] }])("rejects malformed or noncanonical metadata %#", async body => {
  fetch.mockResolvedValue(response(body)); await expect(getConnection(11)).rejects.toMatchObject({ code: "unavailable" });
});
it("rejects malformed JSON without leaking it", async () => {
  fetch.mockResolvedValue({ ...response(), json: () => { throw Error("secret"); } }); await expect(getConnection(11)).rejects.toMatchObject({ message: "unavailable" });
});
it.each(["", "has space", "é", "a".repeat(513), null])("validates secret before transport %#", async secret => {
  await expect(putConnection(11, "openai", secret)).rejects.toMatchObject({ code: "validation" }); expect(fetch).not.toHaveBeenCalled();
});
it("rejects unknown providers and invalid organization contexts", async () => {
  await expect(removeConnection(11, "other")).rejects.toMatchObject({ code: "validation" });
  await expect(getConnection("../11")).rejects.toMatchObject({ code: "denied" });
  localStorage.clear(); await expect(getConnection(11)).rejects.toMatchObject({ code: "denied" }); expect(fetch).not.toHaveBeenCalled();
});
it("does not read mutation bodies", async () => {
  const result = response(); fetch.mockResolvedValue(result); await putConnection(11, "claude", "sk-safe"); await removeConnection(11, "claude"); expect(result.json).not.toHaveBeenCalled();
});
it.each([401, 403, 400, 405, 422, 500, 502, 503])("sanitizes HTTP %s", async status => {
  fetch.mockResolvedValue(response({ secret: "sensitive" }, status)); await expect(getConnection(11)).rejects.toMatchObject({ code: [401, 403].includes(status) ? "denied" : [400, 422].includes(status) ? "validation" : "unavailable" });
});
it("rejects stale responses before and after JSON parsing", async () => {
  fetch.mockImplementationOnce(async () => { setSession("new-token"); return response(); }); await expect(getConnection(11)).rejects.toMatchObject({ code: "stale" });
  fetch.mockResolvedValueOnce({ ...response(), json: async () => { setSession("another-token"); return data; } }); await expect(getConnection(11)).rejects.toMatchObject({ code: "stale" });
});

it("accepts a canonical empty slot with nullable metadata", async () => {
  fetch.mockResolvedValue(response({ provider: null, has_key: false, updated_at: null, updated_by_email: null }));
  expect(await getConnection(11)).toEqual({ configured: false, provider: null, canReplace: true, canRemove: true });
});
it("discards all secret and private response fields", async () => {
  fetch.mockResolvedValue(response({ ...data, api_key: "secret", access_token: "secret", refresh_token: "secret", password: "secret", client_secret: "secret", llm_api_key_encrypted: "secret", updated_by_email: "private@example.test" }));
  expect(await getConnection(11)).toEqual({ configured: true, provider: "openai", canReplace: true, canRemove: true });
});
it("uses only public canonical routes and preserves org and authentication on all operations", async () => {
  await getConnection(22); await putConnection(22, "claude", "sk-test"); await removeConnection(22, "claude");
  expect(fetch.mock.calls.map(([url, options]) => [new URL(url).pathname, options.method])).toEqual([
    ["/orgs/22/provider-keys", "GET"], ["/orgs/22/provider-keys/claude", "PUT"], ["/orgs/22/provider-keys/claude", "DELETE"],
  ]);
  for (const [url, options] of fetch.mock.calls) {
    expect(url).not.toMatch(/internal|reveal|metadata/);
    expect(options.headers.Authorization).toBe("Bearer token");
  }
});
