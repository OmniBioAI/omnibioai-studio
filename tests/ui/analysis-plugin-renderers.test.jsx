import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/components/workbench/AsyncAnalysisRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="analysis-engine">run:{descriptor.plugin.slug}</div>,
}));
vi.mock("../../src/ui/components/workbench/InformationalRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="analysis-engine">read:{descriptor.plugin.slug}</div>,
}));
vi.mock("../../src/ui/components/workbench/QueryRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="analysis-engine">query:{descriptor.plugin.slug}</div>,
}));

import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";
import {
  ANALYSIS_PLUGIN_RENDERERS,
  ANALYSIS_PLUGIN_SLUGS,
} from "../../src/ui/components/workbench/AnalysisPluginRenderers";

afterEach(cleanup);

describe("Analysis category React workspaces", () => {
  it("registers a dedicated React workspace for all 54 Analysis plugins", () => {
    expect(ANALYSIS_PLUGIN_SLUGS).toHaveLength(54);
    expect(new Set(ANALYSIS_PLUGIN_SLUGS).size).toBe(54);
    expect(Object.keys(ANALYSIS_PLUGIN_RENDERERS).sort()).toEqual([...ANALYSIS_PLUGIN_SLUGS].sort());
    for (const slug of ANALYSIS_PLUGIN_SLUGS) {
      expect(resolveWorkbenchRenderer("async_analysis", slug)).toBe(ANALYSIS_PLUGIN_RENDERERS[slug]);
      expect(resolveWorkbenchRenderer("informational", slug)).toBe(ANALYSIS_PLUGIN_RENDERERS[slug]);
    }
  });

  it.each([
    ["exome_analysis", "async_analysis", "run:exome_analysis"],
    ["rnaseq_analysis", "async_analysis", "run:rnaseq_analysis"],
    ["differential_abundance", "informational", "read:differential_abundance"],
    ["gsea_enrichment", "query", "query:gsea_enrichment"],
  ])("renders the legacy-page layout and preserves backend mode for %s", (slug, renderer, result) => {
    const Renderer = ANALYSIS_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{
      renderer,
      plugin: { slug, name: `Plugin ${slug}`, description: "Descriptor summary" },
      inputs: [{ id: "data", label: "Data" }],
      outputs: [{ id: "result", label: "Result" }],
    }} />);
    expect(document.querySelector(`[data-plugin-slug="${slug}"]`)).toBeInTheDocument();
    expect(document.querySelector(".analysis-legacy-summary").textContent).not.toBe("");
    if (slug === "differential_abundance") {
      expect(screen.getByRole("heading", { name: /Inputs/ })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /Outputs/ })).toBeInTheDocument();
    }
    expect(screen.getByTestId("analysis-engine")).toHaveTextContent(result);
  });

  it("restores the Exome Analysis labels and keeps the declared runner mounted", () => {
    const Renderer = ANALYSIS_PLUGIN_RENDERERS.exome_analysis;
    render(<Renderer descriptor={{
      renderer: "async_analysis",
      plugin: { slug: "exome_analysis", name: "Exome Analysis", description: "Prioritize + report from annotated VCF" },
      inputs: [{ id: "vcf", label: "Annotated VCF" }], outputs: [{ id: "variants", label: "Variants table" }],
    }} />);
    expect(screen.getByText("Input: annotated VCF")).toBeInTheDocument();
    expect(screen.getByText("Engine: RunStore")).toBeInTheDocument();
    expect(screen.getByText("Run Exome Analysis")).toBeInTheDocument();
  });
});
