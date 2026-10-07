import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isElectron, getToken } = vi.hoisted(() => ({ isElectron: vi.fn(() => false), getToken: vi.fn(() => "tok") }));
vi.mock("../../src/ui/lib/session", () => ({ isElectron, getToken }));
vi.mock("../../src/ui/lib/workbenchApi", () => ({
  applicationUrl: path => `/_svc/workbench${path}`,
  loadWorkbenchCatalog: vi.fn(async () => ({ schema_version: 1, total_count: 0, categories: [] })),
}));

import { loadExploreResources, runtimeCapabilities, workflowResources } from "../../src/ui/lib/exploreApi";

const workflow = { id: 17, name: "rnaseq", display_name: "RNA-seq workflow", category: "transcriptomics", engine: "nextflow", description: "Canonical registry workflow", enabled: true };

beforeEach(() => { isElectron.mockReturnValue(false); getToken.mockReturnValue("tok"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Explore discovery adapters", () => {
  it("normalizes canonical workflow registry records and derives engine capability metadata", () => {
    const resources = workflowResources([workflow]);
    expect(resources[0]).toMatchObject({ type: "workflow", name: "RNA-seq workflow", source: "workflow-registry" });
    expect(resources[0].destination).toEqual({ kind: "service", url: "/_svc/workflows", label: "Workflow Registry" });
    expect(resources[1]).toMatchObject({ type: "capability", name: "nextflow workflows", source: "workflow-registry" });
  });

  it("derives runtime capabilities from registered TES server metadata", () => {
    expect(runtimeCapabilities([{ server_id: "slurm-1", adapter_type: "slurm", capabilities: { cpu: 32, gpu: 2 } }])).toEqual([
      expect.objectContaining({ type: "capability", name: "slurm runtime", tags: ["slurm", "cpu", "gpu"], source: "tes-runtime-registry" }),
    ]);
  });

  it("loads workflow and runtime registries through the existing authenticated endpoints", async () => {
    vi.stubGlobal("fetch", vi.fn(url => {
      if (url === "/_svc/workflows/v1/workflows") return Promise.resolve({ ok: true, json: async () => [workflow] });
      if (url === "/_tes/api/tools") return Promise.resolve({ ok: true, json: async () => [] });
      if (url === "/_tes/api/servers") return Promise.resolve({ ok: true, json: async () => [] });
      throw new Error(`unexpected URL ${url}`);
    }));
    const result = await loadExploreResources();
    expect(result.resources.some(resource => resource.type === "workflow")).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/_svc/workflows/v1/workflows", expect.objectContaining({ credentials: "same-origin", headers: expect.objectContaining({ Authorization: "Bearer tok" }) }));
  });
});
