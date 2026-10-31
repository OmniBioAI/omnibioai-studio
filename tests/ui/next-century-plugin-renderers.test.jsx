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
  NEXT_CENTURY_PLUGIN_GROUPS,
  NEXT_CENTURY_PLUGIN_MODES,
  NEXT_CENTURY_PLUGIN_RENDERERS,
  NEXT_CENTURY_PLUGIN_SLUGS,
} from "../../src/ui/components/workbench/NextCenturyPluginRenderers";
import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";
import { ANALYSIS_PLUGIN_RENDERERS } from "../../src/ui/components/workbench/AnalysisPluginRenderers";
import { ML_PLUGIN_RENDERERS } from "../../src/ui/components/workbench/MLPluginReactRenderer";
import { GENOMICS_TEMPLATE_RENDERERS } from "../../src/ui/components/workbench/GenomicsTemplateRenderers";
import { OMICS_CATEGORY_PLUGIN_RENDERERS } from "../../src/ui/components/workbench/OmicsCategoryReactRenderers";

afterEach(cleanup);

describe("next one-hundred promoted plugin React renderers", () => {
  it("defines twenty complete Studio groups and one hundred unique plugins", () => {
    expect(NEXT_CENTURY_PLUGIN_GROUPS).toHaveLength(20);
    expect(NEXT_CENTURY_PLUGIN_GROUPS.every(group => group.plugins.length === 5)).toBe(true);
    expect(NEXT_CENTURY_PLUGIN_SLUGS).toHaveLength(100);
    expect(new Set(NEXT_CENTURY_PLUGIN_SLUGS).size).toBe(100);
    expect(Object.keys(NEXT_CENTURY_PLUGIN_RENDERERS).sort()).toEqual([...NEXT_CENTURY_PLUGIN_SLUGS].sort());
    expect(Object.values(NEXT_CENTURY_PLUGIN_MODES).filter(mode => mode === "query")).toHaveLength(40);
    expect(Object.values(NEXT_CENTURY_PLUGIN_MODES).filter(mode => mode === "async_analysis")).toHaveLength(12);
    expect(Object.values(NEXT_CENTURY_PLUGIN_MODES).filter(mode => mode === "generic_runner")).toHaveLength(7);
    expect(Object.values(NEXT_CENTURY_PLUGIN_MODES).filter(mode => mode === "informational")).toHaveLength(41);
  });

  const bespokeML = new Set(Object.keys(ML_PLUGIN_RENDERERS));
  const separatelyRegisteredOverrides = new Set([
    "workflow_explorer", "workflow_registry_admin", "jaspar_search", "kegg_search",
    "biostudies", "clinical_report", "phenopacket", "crispr_off_target_analysis",
    "crispr_screen_analysis", "structure_visualizer", "lipidomics_analysis",
  ]);
  it.each(NEXT_CENTURY_PLUGIN_SLUGS.filter(slug => slug !== "home" && !bespokeML.has(slug)))("uses the live lifecycle and grouped override for %s", slug => {
    const renderer = NEXT_CENTURY_PLUGIN_MODES[slug];
    const Renderer = NEXT_CENTURY_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer }} />);
    const testId = renderer === "query"
      ? "query-workflow"
      : renderer === "informational" ? "informational-workflow" : "async-workflow";
    expect(screen.getByTestId(testId)).toHaveTextContent(slug);
    if (OMICS_CATEGORY_PLUGIN_RENDERERS[slug]) {
      expect(resolveWorkbenchRenderer(renderer, slug)).toBe(OMICS_CATEGORY_PLUGIN_RENDERERS[slug]);
    } else if (ANALYSIS_PLUGIN_RENDERERS[slug]) {
      expect(resolveWorkbenchRenderer(renderer, slug)).toBe(ANALYSIS_PLUGIN_RENDERERS[slug]);
    } else if (separatelyRegisteredOverrides.has(slug)) {
      expect(resolveWorkbenchRenderer(renderer, slug)).not.toBe(Renderer);
    } else if (GENOMICS_TEMPLATE_RENDERERS[slug]) {
      expect(resolveWorkbenchRenderer(renderer, slug)).toBe(GENOMICS_TEMPLATE_RENDERERS[slug]);
    } else {
      expect(resolveWorkbenchRenderer(renderer, slug)).toBe(Renderer);
    }
    expect(resolveWorkbenchRenderer(renderer, slug)).not.toBe(resolveWorkbenchRenderer(renderer));
  });
});
