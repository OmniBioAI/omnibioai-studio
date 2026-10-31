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

import { ADDITIONAL_PLUGIN_RENDERERS } from "../../src/ui/components/workbench/AdditionalPluginRenderers";

afterEach(cleanup);

const QUERY = [
  "data_manager", "checksum_integrity_manager", "storage_quota_manager", "format_converter",
  "workflow_validator", "pdf_report_builder", "job_queue_manager", "environment_manager", "gnomad",
];
const ASYNC = [
  "fair_data_packager", "collaboration", "counts_matrix_qc", "volcano_plot", "heatmap_generator",
  "cell_comm_visualization", "clinical_trial_matching", "privacy_deidentification",
  "clinical_data_quality_validator", "clinical_consent_manager",
];
const INFORMATIONAL = [
  "pca_analysis", "differential_abundance", "immune_deconvolution", "mutational_signatures",
  "tcr_bcr_repertoire", "rna_velocity_analysis",
];

describe("additional promoted plugin React renderers", () => {
  it("registers exactly the twenty-five promoted plugins", () => {
    expect(Object.keys(ADDITIONAL_PLUGIN_RENDERERS).sort()).toEqual([...QUERY, ...ASYNC, ...INFORMATIONAL].sort());
  });

  it.each(QUERY)("uses the query lifecycle for %s", slug => {
    const Renderer = ADDITIONAL_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer: "query" }} />);
    expect(screen.getByTestId("query-workflow")).toHaveTextContent(slug);
  });

  it.each(ASYNC)("uses the execution lifecycle for %s", slug => {
    const Renderer = ADDITIONAL_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer: "generic_runner" }} />);
    expect(screen.getByTestId("async-workflow")).toHaveTextContent(slug);
  });

  it.each(INFORMATIONAL)("preserves the informational contract for %s", slug => {
    const Renderer = ADDITIONAL_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer: "informational" }} />);
    expect(screen.getByTestId("informational-workflow")).toHaveTextContent(slug);
    expect(screen.queryByTestId("async-workflow")).not.toBeInTheDocument();
  });
});
