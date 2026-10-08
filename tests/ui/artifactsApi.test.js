import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: "session-token", version: 4, electron: false }));
vi.mock("../../src/ui/lib/session", () => ({
  getToken: () => session.token,
  getSessionVersion: () => session.version,
  isElectron: () => session.electron,
}));

import {
  ArtifactsApiError,
  downloadArtifact,
  getArtifact,
  getArtifactProvenance,
  getStorageUsage,
  listArtifacts,
  normalizeArtifact,
} from "../../src/ui/lib/artifactsApi";

const artifactId = "11111111-1111-4111-8111-111111111111";
const rawArtifact = Object.freeze({
  artifact_id: artifactId,
  reference: "artifact:internal-reference",
  name: "Differential expression report",
  description: "Authorized output",
  artifact_type: "report",
  format: "html",
  size_bytes: 2048,
  storage_uri: "s3://secret-bucket/private/key",
  storage_path: "/srv/private/key",
  object_key: "private/key",
  checksum: "do-not-render",
  checksum_algorithm: "sha256",
  mime_type: "text/html",
  created_at: "2026-09-01T12:00:00Z",
  created_by: "scientist@example.test",
  project_id: "project-reference",
  run_id: "run-1",
  workflow_id: "workflow-1",
  parent_artifact_id: null,
  family_id: "internal-family",
  version: 1,
  versioned_name: "internal-version",
  tags: ["rnaseq"],
  metadata: { object_key: "another-private-key" },
  status: "available",
  archived_at: null,
  deleted_at: null,
});

function response({ body, status = 200, headers = {}, blob } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] || null },
    json: vi.fn(async () => body),
    blob: vi.fn(async () => blob ?? new Blob(["artifact"])),
  };
}

beforeEach(() => {
  session.token = "session-token";
  session.version = 4;
  session.electron = false;
  vi.restoreAllMocks();
});

describe("Artifacts API", () => {
  it("loads and validates personal managed-storage usage", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ body: {
      owner_type: "USER", owner_id: "7", used_bytes: 240000000, reserved_bytes: 1000,
      quota_bytes: 1000000000, available_bytes: 759999000, membership_plan: "free",
      over_quota: false, quota_mode: "enforce", enforcement_active: true,
      entitlement_status: "fresh", last_reconciled_at: null,
    } }));
    const usage = await getStorageUsage();
    expect(fetchSpy.mock.calls[0][0]).toBe("/_svc/workbench/api/storage/me/usage");
    expect(usage).toMatchObject({ usedBytes: 240000000, availableBytes: 759999000, plan: "free", enforcementActive: true });
  });

  it("lists through the Workbench browser proxy without client-controlled organization context", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({
      body: { results: [rawArtifact], total: 1, limit: 200, offset: 0 },
    }));
    const result = await listArtifacts({ query: " expression ", limit: 200, offset: 0 });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/_svc/workbench/plugins/artifact_manager/artifacts?limit=200&offset=0&q=expression",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", Authorization: "Bearer session-token" },
      }),
    );
    const requestedUrl = String(fetchSpy.mock.calls[0][0]);
    expect(requestedUrl).not.toMatch(/organization/i);
    expect(result.total).toBe(1);
    expect(result.artifacts[0]).toMatchObject({ artifactId, artifactType: "report", sizeBytes: 2048 });
  });

  it("normalizes only safe canonical metadata and drops storage and arbitrary metadata fields", () => {
    const artifact = normalizeArtifact(rawArtifact);
    expect(artifact).toEqual(expect.objectContaining({
      artifactId,
      name: rawArtifact.name,
      projectId: "project-reference",
      runId: "run-1",
      workflowId: "workflow-1",
    }));
    for (const field of ["storage_uri", "storageUri", "storage_path", "storagePath", "object_key", "objectKey", "checksum", "metadata", "reference", "familyId"]) {
      expect(artifact).not.toHaveProperty(field);
    }
    expect(() => normalizeArtifact({ ...rawArtifact, artifact_type: "invented-type" })).toThrow(ArtifactsApiError);
  });

  it("uses exact detail and provenance endpoints and normalizes every related artifact", async () => {
    const input = { ...rawArtifact, artifact_id: "22222222-2222-4222-8222-222222222222", name: "Input table", artifact_type: "table" };
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({ body: rawArtifact }))
      .mockResolvedValueOnce(response({ body: {
        artifact: rawArtifact,
        inputs: [{ relationship: "input", artifact: input, producing_tool: "DESeq2", producing_plugin: "rnaseq", software: { secret: true }, actor: "private", execution_timestamp: rawArtifact.created_at }],
        outputs: [],
      } }));
    const detail = await getArtifact(artifactId);
    const graph = await getArtifactProvenance(artifactId);
    expect(fetchSpy.mock.calls.map(call => call[0])).toEqual([
      `/_svc/workbench/plugins/artifact_manager/artifacts/${artifactId}`,
      `/_svc/workbench/plugins/artifact_manager/artifacts/${artifactId}/provenance`,
    ]);
    expect(detail.artifactId).toBe(artifactId);
    expect(graph.inputs[0]).toMatchObject({ relationship: "input", producingTool: "DESeq2", producingPlugin: "rnaseq" });
    expect(graph.inputs[0]).not.toHaveProperty("software");
    expect(graph.inputs[0]).not.toHaveProperty("actor");
    expect(graph.inputs[0].artifact).not.toHaveProperty("storageUri");
  });

  it("downloads bytes through the canonical endpoint with a sanitized response filename", async () => {
    const blob = new Blob(["report"]);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({
      blob,
      headers: { "Content-Disposition": "attachment; filename*=UTF-8''results%2Freport.html" },
    }));
    const result = await downloadArtifact(artifactId, { filename: "fallback.html" });
    expect(fetchSpy).toHaveBeenCalledWith(
      `/_svc/workbench/plugins/artifact_manager/artifacts/${artifactId}/download`,
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/octet-stream" }) }),
    );
    expect(result.blob).toBe(blob);
    expect(result.filename).toBe("resultsreport.html");
  });

  it("keeps authorization and transport failures opaque", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(response({ status: 404, body: { detail: "s3://secret-bucket/key" } }));
    await expect(getArtifact(artifactId)).rejects.toMatchObject({ name: "ArtifactsApiError", code: "not_found", message: "not_found" });
    fetchSpy.mockRejectedValueOnce(new Error("connect ECONNREFUSED /srv/private"));
    await expect(listArtifacts()).rejects.toMatchObject({ code: "unavailable", message: "unavailable" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [409, "conflict"],
    [413, "quota_exceeded"],
    [500, "unavailable"],
  ])("maps HTTP %s without parsing sensitive response details", async (status, code) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({
      status,
      body: { detail: "s3://secret-bucket/private-key" },
    }));
    await expect(getArtifact(artifactId)).rejects.toMatchObject({ code, message: code });
  });

  it("rejects invalid identifiers and payloads without guessing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(getArtifact("../private/key")).rejects.toMatchObject({ code: "invalid" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockResolvedValue(response({ body: { results: "not-an-array", total: 1 } }));
    await expect(listArtifacts()).rejects.toMatchObject({ code: "invalid" });
  });

  it("uses the existing Electron Workbench proxy origin convention", async () => {
    session.electron = true;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ body: { results: [], total: 0 } }));
    await listArtifacts();
    expect(fetchSpy.mock.calls[0][0]).toMatch(/^http:\/\/localhost(?::5174)?\/_svc\/workbench\/plugins\/artifact_manager\/artifacts\?/);
  });

  it("discards a response if the authenticated session changes while its body is read", async () => {
    let release;
    const body = new Promise(resolve => { release = resolve; });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ...response(),
      json: vi.fn(() => body),
    });
    const pending = listArtifacts();
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    session.version += 1;
    release({ results: [rawArtifact], total: 1 });
    await expect(pending).rejects.toMatchObject({ code: "stale" });
  });
});
