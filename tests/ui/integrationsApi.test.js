import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: "session-token", version: 9, electron: false }));
vi.mock("../../src/ui/lib/session", () => ({
  authUrl: path => `/auth-service${path}`,
  getToken: () => session.token,
  getSessionVersion: () => session.version,
  isElectron: () => session.electron,
}));

import {
  IntegrationsApiError,
  getIntegrationProvider,
  getIntegrationStatus,
  listCredentialMetadata,
  listIntegrationProviders,
  loadIntegrationCatalog,
  revokePersonalCredential,
  savePersonalCredential,
} from "../../src/ui/lib/integrationsApi";

const provider = {
  provider_id: "github", display_name: "GitHub", category: "source_control", description: "GitHub capabilities.",
  setup_state: "free_account", plugin_slugs: ["git_hosting", "github_actions", "ghcr"], capabilities: ["source_control", "actions"],
  plugin_count: 3, capability_count: 12,
  plugins: ["git_hosting", "github_actions", "ghcr"].map(plugin_id => ({
    plugin_id, plugin_name: plugin_id.replaceAll("_", " "), category: "integration", description: `${plugin_id} capabilities.`,
    capability_count: 4, capabilities: ["search", "metadata", "execute", "status"], runtime_available: true,
    implementation_status: "implemented", documentation_url: "UNKNOWN",
  })),
  connection_test_supported: false,
  authentication: { type: "token", allowed_scopes: ["user", "organization"], anonymous_access: false, resolution_policy: ["user", "organization"],
    fields: [{ name: "token", label: "Personal access token", secret: true, required: true }, { name: "username", label: "Username", secret: false, required: false }] },
};
const metadata = { provider_id: "github", scope: "user", configured: true, status: "active", masked_hint: "••••1234", display_metadata: null, created_at: "2026-10-07T01:00:00", updated_at: "2026-10-07T01:00:00" };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: vi.fn(async () => body) });

beforeEach(() => { session.token = "session-token"; session.version = 9; session.electron = false; vi.restoreAllMocks(); });

describe("Integrations API", () => {
  it("loads and validates the canonical provider catalog through Workbench", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ providers: [provider], count: 1 }));
    await expect(listIntegrationProviders()).resolves.toEqual([expect.objectContaining({ providerId: "github", displayName: "GitHub", pluginSlugs: ["git_hosting", "github_actions", "ghcr"], pluginCount: 3, capabilityCount: 12 })]);
    expect(fetcher).toHaveBeenCalledWith("/_svc/workbench/plugins/integration_connections/providers/", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer session-token" }), credentials: "same-origin" }));
  });

  it("loads provider details from the canonical provider endpoint", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(provider));
    await expect(getIntegrationProvider("github")).resolves.toEqual(expect.objectContaining({ capabilities: ["source_control", "actions"] }));
    expect(fetcher.mock.calls[0][0]).toBe("/_svc/workbench/plugins/integration_connections/providers/github/");
  });

  it("reads only safe credential metadata and authoritative status from Auth", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response([{ ...metadata, credentials: { token: "must-not-surface" } }])).mockResolvedValueOnce(response({ provider_id: "github", status: "CONNECTED_USER", scope: "user" }));
    const safe = await listCredentialMetadata();
    expect(safe).toEqual([expect.objectContaining({ providerId: "github", maskedHint: "••••1234" })]);
    expect(safe[0]).not.toHaveProperty("credentials");
    await expect(getIntegrationStatus("github")).resolves.toEqual({ status: "CONNECTED_USER", scope: "user" });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(["/auth-service/integrations/credentials", "/auth-service/integrations/credentials/github/status"]);
  });

  it("aggregates provider definitions with effective status and personal metadata", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({ providers: [provider], count: 1 }))
      .mockResolvedValueOnce(response([metadata]));
    await expect(loadIntegrationCatalog()).resolves.toEqual([expect.objectContaining({ providerId: "github", effectiveStatus: "CONNECTED_USER", personalCredential: expect.objectContaining({ scope: "user" }) })]);
  });

  it("derives organization and anonymous statuses without per-provider request fan-out", async () => {
    const ncbi = { ...provider, provider_id: "ncbi", authentication: { ...provider.authentication,
      allowed_scopes: ["user", "organization", "platform"], anonymous_access: true,
      resolution_policy: ["user", "organization", "platform", "anonymous"] } };
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({ providers: [provider, ncbi], count: 2 }))
      .mockResolvedValueOnce(response([{ ...metadata, scope: "organization" }]));
    await expect(loadIntegrationCatalog()).resolves.toEqual([
      expect.objectContaining({ providerId: "github", effectiveStatus: "CONNECTED_ORGANIZATION", effectiveScope: "organization" }),
      expect.objectContaining({ providerId: "ncbi", effectiveStatus: "READY_NO_CREDENTIALS", effectiveScope: "anonymous" }),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("creates and replaces personal credentials with a metadata-defined narrow body", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(metadata));
    const normalized = (await listIntegrationProvidersFromFixture())[0];
    await savePersonalCredential(normalized, { token: " secret-token ", username: "octocat" });
    const [url, options] = fetcher.mock.calls[1];
    expect(url).toBe("/auth-service/integrations/credentials/github/user");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body)).toEqual({ credentials: { token: "secret-token", username: "octocat" } });
    expect(options.body).not.toContain("organization_id");
    expect(options.body).not.toContain("user_id");
  });

  it("revokes only the authenticated caller's personal credential", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 204 });
    await revokePersonalCredential("github");
    expect(fetcher).toHaveBeenCalledWith("/auth-service/integrations/credentials/github/user", expect.objectContaining({ method: "DELETE" }));
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty("body");
  });

  it("rejects unknown fields and malformed identifiers before sending secrets", async () => {
    const normalized = (await listIntegrationProvidersFromFixture())[0];
    const fetcher = vi.spyOn(globalThis, "fetch");
    fetcher.mockClear();
    await expect(savePersonalCredential(normalized, { token: "secret", organization_id: "7" })).rejects.toBeInstanceOf(IntegrationsApiError);
    await expect(revokePersonalCredential("../github")).rejects.toMatchObject({ code: "invalid" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps authorization and service failures without parsing backend details and rejects stale responses", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    for (const [status, code] of [[401, "unauthorized"], [403, "forbidden"], [404, "not_found"], [500, "server_error"]]) {
      const denied = response({ detail: "private ownership data" }, status);
      fetcher.mockResolvedValueOnce(denied);
      await expect(getIntegrationStatus("github")).rejects.toMatchObject({ code });
      expect(denied.json).not.toHaveBeenCalled();
    }

    let release;
    fetcher.mockResolvedValueOnce({ ...response(provider), json: vi.fn(() => new Promise(resolve => { release = resolve; })) });
    const pending = getIntegrationProvider("github");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    session.version += 1; release(provider);
    await expect(pending).rejects.toMatchObject({ code: "stale" });
  });

  it("bounds unreachable requests and reports a network error", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    const pending = listIntegrationProviders();
    const rejection = expect(pending).rejects.toMatchObject({ code: "network_error" });
    await vi.advanceTimersByTimeAsync(10000);
    await rejection;
    vi.useRealTimers();
  });
});

async function listIntegrationProvidersFromFixture() {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response({ providers: [provider], count: 1 }));
  return listIntegrationProviders();
}
