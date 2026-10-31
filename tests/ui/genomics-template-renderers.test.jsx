import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/components/workbench/AsyncAnalysisRenderer", () => ({ default: () => <div data-testid="run-controls">Workbench run lifecycle</div> }));
vi.mock("../../src/ui/components/workbench/InformationalRenderer", () => ({ default: () => <div data-testid="run-controls">Informational capability</div> }));
vi.mock("../../src/ui/components/workbench/QueryRenderer", () => ({ default: () => <div data-testid="run-controls">Workbench query</div> }));
vi.mock("../../src/ui/components/workbench/GenomeViewerRenderer", () => ({ default: () => <div data-testid="run-controls">Genome track viewer</div> }));

import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";
import { GENOMICS_HISTORIC_INPUT_OVERRIDES, GENOMICS_HISTORIC_PARAMETER_FIELDS, GENOMICS_HISTORIC_TEMPLATE_COUNT, GENOMICS_HISTORIC_TEMPLATE_FILES, GENOMICS_PLUGIN_SLUGS, GENOMICS_TEMPLATE_PAGES, GENOMICS_TEMPLATE_RENDERERS } from "../../src/ui/components/workbench/GenomicsTemplateRenderers";
import { validateConditionalInputs } from "../../src/ui/components/workbench/PluginForm";

afterEach(cleanup);

describe("historical Genomics template React conversions", () => {
  it("registers all 36 Genomics plugin pages", () => {
    expect(GENOMICS_PLUGIN_SLUGS).toHaveLength(36);
    expect(new Set(GENOMICS_PLUGIN_SLUGS).size).toBe(36);
    expect(Object.keys(GENOMICS_HISTORIC_TEMPLATE_FILES)).toHaveLength(36);
    expect(GENOMICS_HISTORIC_TEMPLATE_COUNT).toBe(63);
    const historicPages = Object.entries(GENOMICS_HISTORIC_TEMPLATE_FILES).flatMap(([slug, files]) => files.map(file => `${slug}/${file}`));
    expect(historicPages).toHaveLength(63);
    expect(new Set(historicPages).size).toBe(63);
    expect(Object.keys(GENOMICS_TEMPLATE_RENDERERS).sort()).toEqual([...GENOMICS_PLUGIN_SLUGS].sort());
    for (const slug of GENOMICS_PLUGIN_SLUGS) {
      expect(resolveWorkbenchRenderer("async_analysis", slug)).toBe(GENOMICS_TEMPLATE_RENDERERS[slug]);
      expect(GENOMICS_TEMPLATE_PAGES[slug].sections.length).toBeGreaterThan(0);
    }
  });

  it.each(GENOMICS_PLUGIN_SLUGS)("renders the React template page and Workbench lifecycle for %s", slug => {
    const Renderer = GENOMICS_TEMPLATE_RENDERERS[slug];
    const page = GENOMICS_TEMPLATE_PAGES[slug];
    render(<Renderer descriptor={{
      renderer: "async_analysis",
      plugin: { slug, name: `Test ${slug}`, description: "test" },
      inputs: [], outputs: [],
    }} />);
    expect(screen.getByRole("heading", { name: `Test ${slug}` })).toBeInTheDocument();
    expect(screen.getByTestId("run-controls")).toBeInTheDocument();
  });

  it("defines historical template-specific fields only for registered Genomics plugins", () => {
    for (const [slug, fields] of Object.entries(GENOMICS_HISTORIC_PARAMETER_FIELDS)) {
      expect(GENOMICS_PLUGIN_SLUGS).toContain(slug);
      expect(new Set(fields.map(field => field.id)).size).toBe(fields.length);
      for (const field of fields) expect(["text", "textarea", "number", "select", "checkbox", "multiselect"]).toContain(field.component);
    }
  });

  it("validates all historical conditional field contracts", () => {
    for (const slug of GENOMICS_PLUGIN_SLUGS) {
      const parameterFields = (GENOMICS_HISTORIC_PARAMETER_FIELDS[slug] || []).map(field => ({ ...field, id: `ui_${field.id}` }));
      const inputFields = Object.entries(GENOMICS_HISTORIC_INPUT_OVERRIDES[slug] || {}).map(([id, override]) => ({
        id, component: "file", label: id, description: "historical source input", required: false, format: "file", ...override,
      }));
      expect(() => validateConditionalInputs([...inputFields, ...parameterFields])).not.toThrow();
    }
  });
});
