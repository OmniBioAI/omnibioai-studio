import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/components/workbench/AsyncAnalysisRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="async-workflow">Async {descriptor.plugin.slug}</div>,
}));
vi.mock("../../src/ui/components/workbench/QueryRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="query-workflow">Query {descriptor.plugin.slug}</div>,
}));
vi.mock("../../src/ui/components/workbench/InformationalRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="informational-workflow">Information {descriptor.plugin.slug}</div>,
}));

import { EXPANDED_PLUGIN_RENDERERS } from "../../src/ui/components/workbench/ExpandedPluginRenderers";

afterEach(cleanup);

const QUERY = ["object_registry_explorer", "artifact_manager", "file_transfer_manager", "data_lineage_tracker", "civic"];
const INFORMATIONAL = ["literature_evidence_agent", "experimental_design_agent", "biomarker_discovery_agent", "variant_interpretation_agent"];
const ASYNC = [
  "resource_cost_estimator", "omics_data_qc_harmonizer", "gsea_enrichment", "scanpy_clustering",
  "spatial_analysis", "alphafold", "geo_search", "pubmed_search", "gwas_catalog_search",
  "chembl_search", "clinical_report_generator",
];

describe("expanded promoted plugin React renderers", () => {
  it("registers exactly the twenty promoted plugins", () => {
    expect(Object.keys(EXPANDED_PLUGIN_RENDERERS).sort()).toEqual([...QUERY, ...INFORMATIONAL, ...ASYNC].sort());
  });

  it.each(QUERY)("uses a structured query experience for %s", slug => {
    const Renderer = EXPANDED_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer: "query" }} />);
    expect(screen.getByText("Studio React")).toBeInTheDocument();
    expect(screen.getByTestId("query-workflow")).toHaveTextContent(slug);
  });

  it.each(ASYNC)("uses an executable lifecycle for %s", slug => {
    const Renderer = EXPANDED_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer: "async_analysis" }} />);
    expect(screen.getByTestId("async-workflow")).toHaveTextContent(slug);
  });

  it.each(INFORMATIONAL)("preserves the non-executable contract for %s", slug => {
    const Renderer = EXPANDED_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer: "informational" }} />);
    expect(screen.getByTestId("informational-workflow")).toHaveTextContent(slug);
    expect(screen.getByText(/execution remains disabled|never silently launches|does not replace|preserves uncertainty/i)).toBeInTheDocument();
  });
});
