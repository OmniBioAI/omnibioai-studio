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

  it("accepts the allowlisted textarea component and rejects mismatched component metadata", () => {
    const textareaDescriptor = { ...descriptor, inputs: [{ ...descriptor.inputs[0], widget: "textarea" }] };
    expect(validatePluginDescriptor(textareaDescriptor, "deseq2_analysis").inputs[0].widget).toBe("textarea");
    expect(() => validatePluginDescriptor({ ...descriptor, inputs: [{ ...descriptor.inputs[0], widget: "file", component: "text" }] }, "deseq2_analysis"))
      .toThrow("Invalid plugin input schema");
  });

  it("accepts the formal async renderer contract and rejects unsafe capabilities/endpoints", () => {
    expect(validatePluginDescriptor({ ...descriptor, renderer: "async_analysis" }, "deseq2_analysis").renderer).toBe("async_analysis");
    expect(() => validatePluginDescriptor({ ...descriptor, capabilities: { ...descriptor.capabilities, search: true } }, "deseq2_analysis"))
      .toThrow("Unsupported plugin capability");
    expect(() => validatePluginDescriptor({ ...descriptor, endpoints: { ...descriptor.endpoints, submit: "https://evil.example/run" } }, "deseq2_analysis"))
      .toThrow("Invalid plugin endpoint");
    expect(() => validatePluginDescriptor({ ...descriptor, endpoints: { ...descriptor.endpoints, callback: "/plugins/deseq2_analysis/api/run/" } }, "deseq2_analysis"))
      .toThrow("Unsupported plugin endpoint role");
  });

  it("treats descriptor metadata as inert data", () => {
    const unsafe = {
      ...descriptor,
      callback: "javascript:alert(1)",
      component: "../../evil",
      credentials: { password: "secret", api_key: "token" },
      html: "<script>alert(1)</script>",
    };
    expect(validatePluginDescriptor(unsafe, "deseq2_analysis")).toBe(unsafe);
  });
});
