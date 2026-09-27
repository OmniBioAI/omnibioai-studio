import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isElectron } = vi.hoisted(() => ({ isElectron: vi.fn(() => false) }));
vi.mock("../../src/ui/lib/session", () => ({ isElectron }));

import { endpointUrl, loadPluginDescriptor, pluginDescriptorUrl, validatePluginDescriptor } from "../../src/ui/lib/pluginApi";

const descriptor = {
  schema_version: 1,
  plugin: { slug: "deseq2_analysis", name: "DESeq2", version: "1.0.0", description: "desc", category: "analysis" },
  renderer: "generic_runner",
  native_supported: true,
  inputs: [
    { id: "counts_matrix", label: "Counts Matrix", description: "Input", required: true, format: "tsv", widget: "file", multiple: false, accept: ".tsv,.txt,.csv,text/tab-separated-values,text/csv" },
    { id: "groups", label: "Groups", description: "Optional metadata", required: false, format: "tsv", widget: "file", multiple: false, accept: ".tsv,.txt,.csv,text/tab-separated-values,text/csv" },
  ],
  outputs: [{ id: "de_results", label: "De Results", description: "Output", format: "tsv" }],
  capabilities: { submit: true, status: true, logs: true, artifacts: true, downloads: true },
  endpoints: {
    submit: "/plugins/deseq2_analysis/api/run/",
    status: "/plugins/deseq2_analysis/api/status/{run_id}/",
    logs: "/plugins/deseq2_analysis/api/log/{run_id}/",
    artifacts: "/plugins/deseq2_analysis/api/artifacts/{run_id}/",
    download: "/plugins/deseq2_analysis/api/file/{run_id}/",
  },
};

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("plugin descriptor API boundary", () => {
  it("uses the same-origin Workbench proxy and validates the allowlisted contract", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => descriptor });
    expect(await loadPluginDescriptor("deseq2_analysis")).toEqual(descriptor);
    expect(fetch).toHaveBeenCalledWith("/_svc/workbench/plugins/deseq2_analysis/api/ui-schema/", {
      headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store", signal: undefined,
    });
  });

  it("uses the Electron development proxy without accepting unsafe endpoint paths", () => {
    isElectron.mockReturnValue(true);
    expect(pluginDescriptorUrl("deseq2_analysis", { development: true })).toBe("http://localhost:5174/_svc/workbench/plugins/deseq2_analysis/api/ui-schema/");
    expect(endpointUrl("/plugins/deseq2_analysis/api/status/run-1/")).toContain("/_svc/workbench/");
    expect(() => endpointUrl("/plugins/deseq2_analysis/api/file/../../etc/")).toThrow("Invalid plugin endpoint");
    expect(() => pluginDescriptorUrl("../etc")).toThrow("Invalid plugin identifier");
  });

  it("accepts explicit legacy capability descriptors and rejects unknown native renderers", () => {
    expect(validatePluginDescriptor({ schema_version: 1, plugin: { slug: "workflow_builder" }, renderer: "legacy", native_supported: false }, "workflow_builder").native_supported).toBe(false);
    expect(() => validatePluginDescriptor({ ...descriptor, renderer: "unknown" }, "deseq2_analysis")).toThrow("Unsupported plugin renderer");
  });
});
