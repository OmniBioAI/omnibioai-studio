import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/components/workbench/AsyncAnalysisRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="async-workflow">Async {descriptor.plugin.slug}</div>,
}));
vi.mock("../../src/ui/components/workbench/QueryRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="query-workflow">Query {descriptor.plugin.slug}</div>,
}));

import { NEXT_PLUGIN_RENDERERS } from "../../src/ui/components/workbench/NextPluginRenderers";

afterEach(cleanup);

const EXECUTION = [
  "fastq_trimmer", "variant_qc_filtering", "vcf_liftover", "bedtools_intersect", "deepvariant",
  "prs_builder", "spliceai", "scanpy_qc_metrics", "scanpy_markers", "single_cell_annotation",
  "spatial_clustering", "spatial_marker_identification", "atac_peak_calling", "atac_differential",
  "chipseq_qc_metrics", "chipseq_peak_annotation", "methylation_qc", "admet_prediction",
  "molecular_descriptors", "toxicity_prediction", "druglikeness_scoring", "auto_ml_biomarker_discovery",
];
const QUERY = ["clinvar", "ensembl", "uniprot"];

describe("next promoted plugin React renderers", () => {
  it("registers exactly the twenty-five promoted plugins", () => {
    expect(Object.keys(NEXT_PLUGIN_RENDERERS).sort()).toEqual([...EXECUTION, ...QUERY].sort());
  });

  it.each(EXECUTION)("uses the execution lifecycle for %s", slug => {
    const Renderer = NEXT_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer: "async_analysis" }} />);
    expect(screen.getByTestId("async-workflow")).toHaveTextContent(slug);
  });

  it.each(QUERY)("uses the query lifecycle for %s", slug => {
    const Renderer = NEXT_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer: "query" }} />);
    expect(screen.getByTestId("query-workflow")).toHaveTextContent(slug);
  });
});
