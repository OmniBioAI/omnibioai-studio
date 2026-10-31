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
  CENTURY_PLUGIN_GROUPS,
  CENTURY_PLUGIN_MODES,
  CENTURY_PLUGIN_RENDERERS,
  CENTURY_PLUGIN_SLUGS,
} from "../../src/ui/components/workbench/CenturyPluginRenderers";
import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";
import { ML_PLUGIN_UI_SLUGS } from "../../src/ui/components/workbench/MLPluginReactRenderer";

afterEach(cleanup);

describe("one-hundred promoted plugin React renderers", () => {
  it("defines twenty complete Studio groups and one hundred unique plugins", () => {
    expect(CENTURY_PLUGIN_GROUPS).toHaveLength(20);
    expect(CENTURY_PLUGIN_GROUPS.every(group => group.plugins.length === 5)).toBe(true);
    expect(CENTURY_PLUGIN_SLUGS).toHaveLength(100);
    expect(new Set(CENTURY_PLUGIN_SLUGS).size).toBe(100);
    expect(Object.keys(CENTURY_PLUGIN_RENDERERS).sort()).toEqual([...CENTURY_PLUGIN_SLUGS].sort());
    expect(Object.values(CENTURY_PLUGIN_MODES).filter(mode => mode === "query")).toHaveLength(47);
    expect(Object.values(CENTURY_PLUGIN_MODES).filter(mode => mode === "async_analysis")).toHaveLength(20);
    expect(Object.values(CENTURY_PLUGIN_MODES).filter(mode => mode === "generic_runner")).toHaveLength(33);
  });

  const bespokePages = new Set([...ML_PLUGIN_UI_SLUGS, "audit_log", "dataset_catalog", "genome_viewer", "alerting", "api_analytics", "integration_connections", "notification_center", "resource_monitoring", "security_dashboard", "omniml_studio", "histopathology_cv", "drug_target_intelligence", "celltype_classification_sc"]);
  it.each(CENTURY_PLUGIN_SLUGS.filter(slug => !bespokePages.has(slug)))("uses the live lifecycle and grouped override for %s", slug => {
    const renderer = CENTURY_PLUGIN_MODES[slug];
    const Renderer = CENTURY_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer }} />);
    expect(screen.getByTestId(renderer === "query" ? "query-workflow" : "async-workflow")).toHaveTextContent(slug);
    expect(resolveWorkbenchRenderer(renderer, slug)).toBe(Renderer);
    expect(resolveWorkbenchRenderer(renderer, slug)).not.toBe(resolveWorkbenchRenderer(renderer));
  });

  it("uses the dedicated React tutorial browser for OmniML Studio", () => {
    const Renderer = CENTURY_PLUGIN_RENDERERS.omniml_studio;
    expect(Renderer).toBeTruthy();
    expect(resolveWorkbenchRenderer("query", "omniml_studio")).toBe(Renderer);
  });

  it("uses the dedicated React segmentation workspace for Histopathology CV", () => {
    const Renderer = CENTURY_PLUGIN_RENDERERS.histopathology_cv;
    expect(Renderer).toBeTruthy();
    expect(resolveWorkbenchRenderer("query", "histopathology_cv")).toBe(Renderer);
  });
});
