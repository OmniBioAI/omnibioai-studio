import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/components/workbench/AsyncAnalysisRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="async-workflow">Async {descriptor.plugin.slug}</div>,
}));
vi.mock("../../src/ui/components/workbench/QueryRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="query-workflow">Query {descriptor.plugin.slug}</div>,
}));

import {
  BROAD_PLUGIN_GROUPS,
  BROAD_PLUGIN_RENDERERS,
  BROAD_PLUGIN_SLUGS,
} from "../../src/ui/components/workbench/BroadPluginRenderers";
import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";
import { ANALYSIS_PLUGIN_RENDERERS } from "../../src/ui/components/workbench/AnalysisPluginRenderers";
import { ML_PLUGIN_RENDERERS } from "../../src/ui/components/workbench/MLPluginReactRenderer";

afterEach(cleanup);

const QUERY = new Set([
  "clinicaltrials_gov", "dbsnp", "encode", "expression_atlas", "gene_ontology",
  "all_of_us", "bindingdb", "cbioportal", "depmap", "disgenet",
]);
const GENERIC = new Set([
  "atac_footprinting", "chromatin_accessibility", "chromatin_state", "dmr_analysis", "hic_analysis",
  "admixture_analysis", "eqtl_linker", "fst_calculator", "ld_analysis", "phasing_haplotype_analysis",
  "orf_finder", "pathogenicity_scoring", "rare_variant_burden", "selection_scan", "sra_submission_manager",
  "metabolomics_alignment", "metabolomics_annotate", "metabolomics_batch_correct", "metabolomics_batch_detect",
  "metabolomics_biomarkers", "metabolomics_feature_matrix", "metabolomics_imputation",
  "metabolomics_outlier_detect", "metabolomics_peak_detect", "metabolomics_report", "admet_property_predictor",
]);

describe("broad promoted plugin React renderers", () => {
  it("defines fifteen complete Studio groups and seventy-five unique plugins", () => {
    expect(BROAD_PLUGIN_GROUPS).toHaveLength(15);
    expect(BROAD_PLUGIN_GROUPS.every(group => group.plugins.length === 5)).toBe(true);
    expect(BROAD_PLUGIN_SLUGS).toHaveLength(75);
    expect(new Set(BROAD_PLUGIN_SLUGS).size).toBe(75);
    expect(Object.keys(BROAD_PLUGIN_RENDERERS).sort()).toEqual([...BROAD_PLUGIN_SLUGS].sort());
  });

  const bespokeML = new Set(Object.keys(ML_PLUGIN_RENDERERS));
  it.each(BROAD_PLUGIN_SLUGS.filter(slug => !bespokeML.has(slug)))("uses the descriptor lifecycle and dedicated override for %s", slug => {
    const renderer = QUERY.has(slug) ? "query" : GENERIC.has(slug) ? "generic_runner" : "async_analysis";
    const Renderer = BROAD_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer }} />);
    expect(screen.getByTestId(QUERY.has(slug) ? "query-workflow" : "async-workflow")).toHaveTextContent(slug);
    const resolved = resolveWorkbenchRenderer(renderer, slug);
    expect(typeof resolved).toBe("function");
    if (ANALYSIS_PLUGIN_RENDERERS[slug]) expect(resolved).toBe(ANALYSIS_PLUGIN_RENDERERS[slug]);
    expect(resolved).not.toBe(resolveWorkbenchRenderer(renderer));
  });
});
