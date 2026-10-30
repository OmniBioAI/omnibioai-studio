import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/components/workbench/AsyncAnalysisRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="async-workflow">Async {descriptor.plugin.slug}</div>,
}));
vi.mock("../../src/ui/components/workbench/QueryRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="query-workflow">Query {descriptor.plugin.slug}</div>,
}));

import { SCIENTIFIC_PLUGIN_RENDERERS } from "../../src/ui/components/workbench/ScientificPluginRenderers";

afterEach(cleanup);

const EXECUTION = [
  "assembly_qc", "nanopore_qc", "gene_annotation", "gwas_popgen", "phenotype_association",
  "protein_quantification", "ptm_analysis", "metabolomics_sample_qc", "metabolomics_normalize",
  "metabolomics_stats", "alpha_diversity", "beta_diversity", "microbiome_taxonomic_classifier",
  "amr_gene_classifier", "mag_quality", "binding_site_predictor", "docking_pose_viewer",
  "target_prediction", "drug_response_predictor", "protein_stability_ddg_predictor",
];
const QUERY = ["opentargets", "pubchem", "rcsb_pdb", "reactome", "gtex"];

describe("scientific promoted plugin React renderers", () => {
  it("registers exactly the twenty-five promoted plugins", () => {
    expect(Object.keys(SCIENTIFIC_PLUGIN_RENDERERS).sort()).toEqual([...EXECUTION, ...QUERY].sort());
  });

  it.each(EXECUTION)("uses the execution lifecycle for %s", slug => {
    const Renderer = SCIENTIFIC_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer: "generic_runner" }} />);
    expect(screen.getByTestId("async-workflow")).toHaveTextContent(slug);
  });

  it.each(QUERY)("uses the query lifecycle for %s", slug => {
    const Renderer = SCIENTIFIC_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer: "query" }} />);
    expect(screen.getByTestId("query-workflow")).toHaveTextContent(slug);
  });
});
