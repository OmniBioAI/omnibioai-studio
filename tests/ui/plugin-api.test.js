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
    download: "/plugins/deseq2_analysis/api/ui-artifacts/{run_id}/{artifact_id}/download/",
  },
  artifacts: { presentation: "list", max_items: 100 },
};

const queryDescriptor = {
  schema_version: 1,
  plugin: { slug: "clinvar", name: "ClinVar", version: "1.0.0", description: "desc", category: "reference_db" },
  renderer: "query", native_supported: true,
  inputs: [{ id: "query", component: "text", label: "Query", description: "Search", required: true, format: "text" }],
  outputs: [], capabilities: { query: true, detail: true },
  endpoints: { query: "/plugins/clinvar/search/", detail: "/plugins/clinvar/variants/{detail_id}/" },
  result: { presentation: "table", rows_path: "results", detail_key: "accession", columns: [{ key: "accession", label: "Accession" }] },
};

const noDetailQueryDescriptor = {
  ...queryDescriptor,
  plugin: { ...queryDescriptor.plugin, slug: "clinvitae" },
  capabilities: { query: true },
  endpoints: { query: "/plugins/clinvitae/search/" },
  result: { presentation: "table", rows_path: "results", columns: [{ key: "query", label: "Query" }] },
};

const informationalDescriptor = {
  schema_version: 1,
  plugin: { slug: "biosamples", name: "BioSamples", version: "1.0.0", description: "desc", category: "reference_db" },
  renderer: "informational", native_supported: true,
  inputs: [], outputs: [], capabilities: { read_only: true },
  content: { summary: "Read-only sample records.", sections: [] },
};

const staticPngDescriptor = {
  ...descriptor,
  plugin: { ...descriptor.plugin, slug: "volcano_plot" },
  result: { presentation: "static_png", primary: { kind: "plot", media_type: "image/png", label: "Volcano Plot", alt: "Volcano plot result" } },
  capabilities: { ...descriptor.capabilities, render: true },
  endpoints: {
    submit: "/plugins/volcano_plot/api/run/",
    status: "/plugins/volcano_plot/api/status/{run_id}/",
    logs: "/plugins/volcano_plot/api/log/{run_id}/",
    artifacts: "/plugins/volcano_plot/api/artifacts/{run_id}/",
    download: "/plugins/volcano_plot/api/ui-artifacts/{run_id}/{artifact_id}/download/",
    render: "/plugins/volcano_plot/api/render/{run_id}/",
  },
  artifacts: { presentation: "list", max_items: 100 },
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

  it("accepts independent finite conditional effects and rejects unsafe condition metadata", () => {
    const conditional = {
      ...descriptor,
      inputs: [
        { id: "mode", label: "Mode", description: "Mode", required: true, format: "text", widget: "select", choices: ["infer", "train"], default: "infer" },
        { ...descriptor.inputs[0], id: "labels", required: false, conditions: [
          { controller: "mode", operator: "equals", value: "train", effect: "visible" },
          { controller: "mode", operator: "equals", value: "train", effect: "required" },
        ] },
      ],
    };
    expect(validatePluginDescriptor(conditional, "deseq2_analysis").inputs[1].conditions).toHaveLength(2);
    for (const condition of [
      { controller: "missing", operator: "equals", value: "train", effect: "visible" },
      { controller: "mode", operator: "not_equals", value: "train", effect: "visible" },
      { controller: "mode", operator: "equals", value: "predict", effect: "visible" },
      { controller: "mode", operator: "equals", value: "train", effect: "callback" },
    ]) {
      expect(() => validatePluginDescriptor({ ...conditional, inputs: [conditional.inputs[0], { ...conditional.inputs[1], conditions: [condition] }] }, "deseq2_analysis"))
        .toThrow();
    }
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

  it("accepts only the finite artifact presentation and fixed opaque-ID endpoint", () => {
    expect(validatePluginDescriptor(descriptor, "deseq2_analysis").artifacts).toEqual({ presentation: "list", max_items: 100 });
    expect(() => validatePluginDescriptor({ ...descriptor, artifacts: { ...descriptor.artifacts, path: "/tmp" } }, "deseq2_analysis"))
      .toThrow("Invalid artifact presentation schema");
    expect(() => validatePluginDescriptor({ ...descriptor, endpoints: { ...descriptor.endpoints, download: "/plugins/deseq2_analysis/api/file/{run_id}/" } }, "deseq2_analysis"))
      .toThrow("Invalid artifact presentation schema");
  });

  it("accepts only the finite static PNG result contract", () => {
    expect(validatePluginDescriptor(staticPngDescriptor, "volcano_plot").result.presentation).toBe("static_png");
    expect(() => validatePluginDescriptor({ ...staticPngDescriptor, result: { ...staticPngDescriptor.result, primary: { ...staticPngDescriptor.result.primary, media_type: "image/svg+xml" } } }, "volcano_plot"))
      .toThrow("Invalid static PNG result schema");
    expect(() => validatePluginDescriptor({ ...staticPngDescriptor, endpoints: { ...staticPngDescriptor.endpoints, render: "https://evil.example/image.png" } }, "volcano_plot"))
      .toThrow("Invalid plugin endpoint");
  });

  it("accepts the narrow query contract and rejects unsafe query extensions", () => {
    expect(validatePluginDescriptor(queryDescriptor, "clinvar").renderer).toBe("query");
    expect(() => validatePluginDescriptor({ ...queryDescriptor, capabilities: { query: true, detail: true, pagination: true } }, "clinvar"))
      .toThrow("Invalid query capability schema");
    expect(() => validatePluginDescriptor({ ...queryDescriptor, endpoints: { ...queryDescriptor.endpoints, query: "https://evil.example/search/" } }, "clinvar"))
      .toThrow("Invalid plugin endpoint");
    expect(() => validatePluginDescriptor({ ...queryDescriptor, endpoints: { ...queryDescriptor.endpoints, query: "/plugins/uniprot/search/" } }, "clinvar"))
      .toThrow("Plugin endpoint scope mismatch");
    expect(() => validatePluginDescriptor({ ...queryDescriptor, endpoints: { ...queryDescriptor.endpoints, detail: "/plugins/reactome/pathways/placeholder/" } }, "clinvar"))
      .toThrow("Plugin endpoint scope mismatch");
    expect(() => validatePluginDescriptor({ ...queryDescriptor, endpoints: { ...queryDescriptor.endpoints, query: "/plugins/clinvar-other/search/" } }, "clinvar"))
      .toThrow("Plugin endpoint scope mismatch");
    expect(() => validatePluginDescriptor({ ...queryDescriptor, endpoints: { ...queryDescriptor.endpoints, detail: "/plugins/clinvar/../other/search/" } }, "clinvar"))
      .toThrow("Invalid plugin endpoint");
    expect(() => validatePluginDescriptor({ ...queryDescriptor, result: { ...queryDescriptor.result, presentation: "json" } }, "clinvar"))
      .toThrow("Invalid query result schema");
  });

  it("accepts the finite informational contract and rejects executable or structured-content extensions", () => {
    expect(validatePluginDescriptor(informationalDescriptor, "biosamples").renderer).toBe("informational");
    expect(() => validatePluginDescriptor({ ...informationalDescriptor, content: { ...informationalDescriptor.content, html: "<script>" } }, "biosamples"))
      .toThrow("Invalid informational descriptor");
    expect(() => validatePluginDescriptor({ ...informationalDescriptor, content: { summary: "x", sections: [{ heading: "x", paragraphs: ["ok"], html: "<b>" }] } }, "biosamples"))
      .toThrow("Invalid informational descriptor");
  });

  it("accepts a query table without detail and rejects inconsistent detail metadata", () => {
    expect(validatePluginDescriptor(noDetailQueryDescriptor, "clinvitae").capabilities).toEqual({ query: true });
    expect(() => validatePluginDescriptor({ ...noDetailQueryDescriptor, capabilities: { query: true, detail: true } }, "clinvitae"))
      .toThrow("Invalid query endpoint schema");
    expect(() => validatePluginDescriptor({ ...noDetailQueryDescriptor, result: { ...noDetailQueryDescriptor.result, detail_key: "query" } }, "clinvitae"))
      .toThrow("Invalid query result schema");
    expect(() => validatePluginDescriptor({ ...noDetailQueryDescriptor, endpoints: { query: noDetailQueryDescriptor.endpoints.query, detail: "/plugins/clinvitae/search/" } }, "clinvitae"))
      .toThrow("Invalid query endpoint schema");
    expect(() => validatePluginDescriptor({ ...queryDescriptor, capabilities: { query: true, detail: false }, endpoints: { query: queryDescriptor.endpoints.query, detail: queryDescriptor.endpoints.detail }, result: { ...queryDescriptor.result, detail_key: undefined } }, "clinvar"))
      .toThrow("Invalid query endpoint schema");
  });

  it.each([
    ["clinvar", "/plugins/clinvar/search/", "/plugins/clinvar/variants/placeholder/"],
    ["arrayexpress", "/plugins/arrayexpress/api/search/", "/plugins/arrayexpress/api/experiments/placeholder/"],
    ["biostudies", "/plugins/biostudies/api/search/", "/plugins/biostudies/api/studies/placeholder/"],
    ["gwas_catalog", "/plugins/gwas_catalog/studies/", "/plugins/gwas_catalog/studies/placeholder/"],
    ["pharmgkb", "/plugins/pharmgkb/genes/search/", "/plugins/pharmgkb/genes/placeholder/"],
    ["reactome", "/plugins/reactome/search/", "/plugins/reactome/pathways/placeholder/"],
  ])("accepts exact plugin namespace for %s", (slug, query, detail) => {
    expect(validatePluginDescriptor({ ...queryDescriptor, plugin: { ...queryDescriptor.plugin, slug }, endpoints: { query, detail } }, slug).renderer).toBe("query");
  });

  it("rejects executable and sensitive descriptor metadata", () => {
    const unsafe = {
      ...descriptor,
      callback: "javascript:alert(1)",
      component: "../../evil",
      credentials: { password: "secret", api_key: "token" },
      html: "<script>alert(1)</script>",
    };
    expect(() => validatePluginDescriptor(unsafe, "deseq2_analysis")).toThrow("Forbidden plugin metadata");
  });
});
