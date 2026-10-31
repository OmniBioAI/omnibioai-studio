import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/components/workbench/AsyncAnalysisRenderer", () => ({ default: () => <div data-testid="omics-run-controls">Workbench run lifecycle</div> }));
vi.mock("../../src/ui/components/workbench/InformationalRenderer", () => ({ default: () => <div data-testid="omics-run-controls">Informational capability</div> }));

import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";
import {
  OMICS_HISTORIC_INPUT_OVERRIDES,
  OMICS_HISTORIC_PARAMETER_FIELDS,
  OMICS_HISTORIC_TEMPLATE_COUNT,
  OMICS_HISTORIC_TEMPLATE_FILES,
  OMICS_HISTORIC_TEMPLATE_PAGES,
  OMICS_HISTORIC_TEMPLATE_SLUGS,
  OMICS_TEMPLATE_REACT_RENDERERS,
} from "../../src/ui/components/workbench/OmicsTemplateReactRenderers";

afterEach(cleanup);

describe("remaining Omics historical template React conversions", () => {
  it("covers and registers all 39 plugin pages and their 67 historical templates", () => {
    expect(OMICS_HISTORIC_TEMPLATE_SLUGS).toHaveLength(39);
    expect(new Set(OMICS_HISTORIC_TEMPLATE_SLUGS).size).toBe(39);
    expect(Object.keys(OMICS_HISTORIC_TEMPLATE_FILES)).toHaveLength(39);
    expect(OMICS_HISTORIC_TEMPLATE_COUNT).toBe(67);
    expect(Object.keys(OMICS_HISTORIC_TEMPLATE_PAGES).sort()).toEqual([...OMICS_HISTORIC_TEMPLATE_SLUGS].sort());
    expect(Object.keys(OMICS_TEMPLATE_REACT_RENDERERS).sort()).toEqual([...OMICS_HISTORIC_TEMPLATE_SLUGS].sort());
    const historicPages = Object.entries(OMICS_HISTORIC_TEMPLATE_FILES).flatMap(([slug, files]) => files.map(file => `${slug}/${file}`));
    expect(historicPages).toHaveLength(67);
    expect(new Set(historicPages).size).toBe(67);
    for (const slug of OMICS_HISTORIC_TEMPLATE_SLUGS) {
      expect(resolveWorkbenchRenderer("async_analysis", slug)).toBeTypeOf("function");
      expect(OMICS_HISTORIC_TEMPLATE_PAGES[slug].sections.length).toBeGreaterThan(0);
    }
  });

  it.each(OMICS_HISTORIC_TEMPLATE_SLUGS)("renders the React page and current lifecycle for %s", slug => {
    const Renderer = OMICS_TEMPLATE_REACT_RENDERERS[slug];
    render(<Renderer descriptor={{
      renderer: "async_analysis",
      plugin: { slug, name: `Test ${slug}`, description: "test" },
      inputs: [], outputs: [],
    }} />);
    expect(screen.getByRole("region", { name: `${OMICS_HISTORIC_TEMPLATE_PAGES[slug].title} React workspace` })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Converted from Workbench template\\(s\\): ${OMICS_HISTORIC_TEMPLATE_FILES[slug][0]}`))).toBeInTheDocument();
    expect(screen.getByTestId("omics-run-controls")).toBeInTheDocument();
  });

  it("does not duplicate classifier fields already supplied by current descriptors", () => {
    expect(OMICS_HISTORIC_PARAMETER_FIELDS).not.toHaveProperty("atac_accessibility_classifier");
    expect(OMICS_HISTORIC_PARAMETER_FIELDS).not.toHaveProperty("ms_spectrum_classifier");
    for (const [slug, overrides] of Object.entries(OMICS_HISTORIC_INPUT_OVERRIDES)) {
      expect(OMICS_HISTORIC_TEMPLATE_SLUGS).toContain(slug);
      expect(overrides).toHaveProperty("model_ref.placeholder");
      expect(overrides).toHaveProperty("hyperparams.placeholder");
    }
  });

  it("defines unique, supported historical parameters only for registered plugins", () => {
    for (const [slug, fields] of Object.entries(OMICS_HISTORIC_PARAMETER_FIELDS)) {
      expect(OMICS_HISTORIC_TEMPLATE_SLUGS).toContain(slug);
      expect(new Set(fields.map(field => field.id)).size).toBe(fields.length);
      for (const field of fields) expect(["text", "textarea", "number", "select", "checkbox", "multiselect"]).toContain(field.component);
    }
  });
});
