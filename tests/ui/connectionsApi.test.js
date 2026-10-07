import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getConnection, putConnection, removeConnection } from "../../src/ui/lib/connectionsApi";
import { setSession } from "../../src/ui/lib/session";
const data = { organization_id: 11, owner_scope: "ORGANIZATION", configured: true, provider: "openai", allowed_actions: ["replace", "remove"], credential_version: "private", api_key: "secret" };
const response = (body = data, status = 200) => ({ status, ok: status < 400, json: vi.fn().mockResolvedValue(body) });
beforeEach(() => { localStorage.setItem("omnibioai_access_token", "token"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response())); });
afterEach(() => vi.unstubAllGlobals());
it("projects only safe metadata and uses canonical no-store authenticated URL", async () => {
  expect(await getConnection(11)).toEqual({ configured: true, provider: "openai", canReplace: true, canRemove: true });
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/orgs/11/provider-keys/metadata"), expect.objectContaining({ cache: "no-store", credentials: "omit", headers: { Accept: "application/json", Authorization: "Bearer token" } }));
});
it.each([null, {}, { ...data, organization_id: 22 }, { ...data, owner_scope: "USER" }, { ...data, configured: "true" }, { ...data, provider: "other" }, { ...data, allowed_actions: null }])("rejects malformed/wrong-scope metadata %#", async body => {
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
it.each([401, 403, 400, 422, 500])("sanitizes HTTP %s", async status => {
  fetch.mockResolvedValue(response({ secret: "sensitive" }, status)); await expect(getConnection(11)).rejects.toMatchObject({ code: [401, 403].includes(status) ? "denied" : [400, 422].includes(status) ? "validation" : "unavailable" });
});
it("rejects stale responses before and after JSON parsing", async () => {
  fetch.mockImplementationOnce(async () => { setSession("new-token"); return response(); }); await expect(getConnection(11)).rejects.toMatchObject({ code: "stale" });
  fetch.mockResolvedValueOnce({ ...response(), json: async () => { setSession("another-token"); return data; } }); await expect(getConnection(11)).rejects.toMatchObject({ code: "stale" });
});
