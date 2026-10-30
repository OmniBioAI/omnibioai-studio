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

import {
  DatasetIngestRenderer,
  Deseq2AnalysisRenderer,
  MolecularDockingRenderer,
  MultiQcRenderer,
  ReferenceGenomeManagerRenderer,
  RunInspectorRenderer,
  VariantAnnotationRenderer,
} from "../../src/ui/components/workbench/PriorityPluginRenderers";

afterEach(cleanup);

const CASES = [
  [DatasetIngestRenderer, "dataset_ingest", "Data foundation"],
  [RunInspectorRenderer, "run_inspector", "Operations"],
  [Deseq2AnalysisRenderer, "deseq2_analysis", "RNA-seq"],
  [VariantAnnotationRenderer, "variant_annotation", "Genomics"],
];

describe("priority plugin React renderers", () => {
  it.each(CASES)("provides a guided async workflow for %s", (Renderer, slug, heading) => {
    render(<Renderer descriptor={{ plugin: { slug }, renderer: "generic_runner" }} />);
    expect(screen.getByText(heading)).toBeInTheDocument();
    expect(screen.getByText("Studio React")).toBeInTheDocument();
    expect(screen.getByTestId("async-workflow")).toHaveTextContent(slug);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("uses the bounded query workflow for MultiQC", () => {
    render(<MultiQcRenderer descriptor={{ plugin: { slug: "multiqc_wrapper" }, renderer: "query" }} />);
    expect(screen.getByText("Quality control")).toBeInTheDocument();
    expect(screen.getByTestId("query-workflow")).toHaveTextContent("multiqc_wrapper");
    expect(screen.queryByTestId("async-workflow")).not.toBeInTheDocument();
  });

  it.each([
    [ReferenceGenomeManagerRenderer, "reference_genome_manager", "Reference data"],
    [MolecularDockingRenderer, "molecular_docking", "Drug discovery"],
  ])("preserves the informational backend contract for %s", (Renderer, slug, heading) => {
    render(<Renderer descriptor={{ plugin: { slug }, renderer: "informational" }} />);
    expect(screen.getByText(heading)).toBeInTheDocument();
    expect(screen.getByTestId("informational-workflow")).toHaveTextContent(slug);
    expect(screen.queryByTestId("async-workflow")).not.toBeInTheDocument();
  });
});
