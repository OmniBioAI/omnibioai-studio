import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/components/workbench/AsyncAnalysisRenderer", () => ({ default: ({ descriptor }) => <div data-testid="omics-lifecycle">Async {descriptor.plugin.slug}</div> }));
vi.mock("../../src/ui/components/workbench/InformationalRenderer", () => ({ default: ({ descriptor }) => <div data-testid="omics-lifecycle">Read-only {descriptor.plugin.slug}</div> }));
vi.mock("../../src/ui/components/workbench/QueryRenderer", () => ({ default: ({ descriptor }) => <div data-testid="omics-lifecycle">Query {descriptor.plugin.slug}</div> }));

import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";
import { OMICS_CATEGORY_PLUGIN_RENDERERS } from "../../src/ui/components/workbench/OmicsCategoryPluginRenderers";
import { OMICS_CATEGORY_PLUGIN_SLUGS } from "../../src/ui/components/workbench/OmicsCategoryReactRenderers";

afterEach(cleanup);

describe("Microbiome, Proteomics, Single-cell, and Spatial React workspaces", () => {
  it("registers all 35 category plugins with dedicated React renderers", () => {
    expect(OMICS_CATEGORY_PLUGIN_SLUGS).toHaveLength(35);
    expect(new Set(OMICS_CATEGORY_PLUGIN_SLUGS).size).toBe(35);
    expect(new Set(Object.values(OMICS_CATEGORY_PLUGIN_RENDERERS)).size).toBe(35);
    expect(Object.keys(OMICS_CATEGORY_PLUGIN_RENDERERS).sort()).toEqual([...OMICS_CATEGORY_PLUGIN_SLUGS].sort());
    for (const slug of OMICS_CATEGORY_PLUGIN_SLUGS) {
      if (["proteomics", "single_cell_loom_viewer"].includes(slug)) continue;
      expect(resolveWorkbenchRenderer("async_analysis", slug)).toBe(OMICS_CATEGORY_PLUGIN_RENDERERS[slug]);
    }
  });

  it.each(OMICS_CATEGORY_PLUGIN_SLUGS)("renders a descriptor-backed workspace and lifecycle for %s", slug => {
    if (["proteomics", "single_cell_loom_viewer"].includes(slug)) return;
    const Renderer = OMICS_CATEGORY_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{
      renderer: "async_analysis",
      plugin: { slug, name: `Test ${slug}`, category: "omics" },
      inputs: [{ id: "evidence", label: "Evidence file", format: "tsv", description: "Declared by the plugin I/O contract.", required: true }],
      outputs: [{ id: "result", label: "Result table", format: "tsv" }],
      endpoints: { submit: "/submit/", status: "/status/", logs: "/logs/", artifacts: "/artifacts/" },
      capabilities: { submit: true, status: true, logs: true, artifacts: true },
    }} />);
    expect(screen.getByText(new RegExp(`Test ${slug}`))).toBeInTheDocument();
    expect(document.querySelector(`[data-plugin="${slug}"]`)).toBeInTheDocument();
    expect(screen.getByText("Evidence file")).toBeInTheDocument();
    expect(screen.getByText(/evidence · tsv · Declared by the plugin I\/O contract/)).toBeInTheDocument();
    expect(screen.getByText("Result table")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connected Workbench operations" })).toBeInTheDocument();
    expect(screen.getByText("/submit/")).toBeInTheDocument();
    expect(screen.getByTestId("omics-lifecycle")).toHaveTextContent(`Async ${slug}`);
  });

  it("keeps query and read-only behavior descriptor-driven", () => {
    const Query = OMICS_CATEGORY_PLUGIN_RENDERERS.taxonomic_abundance;
    const Static = OMICS_CATEGORY_PLUGIN_RENDERERS.microbiome_report;
    const { rerender } = render(<Query descriptor={{ plugin: { slug: "taxonomic_abundance" }, renderer: "query", inputs: [], outputs: [] }} />);
    expect(screen.getByTestId("omics-lifecycle")).toHaveTextContent("Query taxonomic_abundance");
    rerender(<Static descriptor={{ plugin: { slug: "microbiome_report" }, renderer: "informational", capabilities: { read_only: true }, inputs: [], outputs: [] }} />);
    expect(screen.getByTestId("omics-lifecycle")).toHaveTextContent("Read-only microbiome_report");
    expect(screen.getByText(/currently exposes this plugin as read-only/)).toBeInTheDocument();
  });
});
