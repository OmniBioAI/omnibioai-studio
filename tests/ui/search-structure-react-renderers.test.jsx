import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/components/workbench/AsyncAnalysisRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="async-workflow">Run UI for {descriptor.plugin.slug}</div>,
}));
vi.mock("../../src/ui/components/workbench/QueryRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="query-workflow">Query UI for {descriptor.plugin.slug}</div>,
}));
vi.mock("../../src/ui/components/workbench/InformationalRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="read-only-workspace">Read-only UI for {descriptor.plugin.slug}</div>,
}));

import { SEARCH_STRUCTURE_PLUGIN_RENDERERS, SEARCH_STRUCTURE_PLUGIN_SLUGS } from "../../src/ui/components/workbench/SearchStructureReactRenderers";

afterEach(cleanup);

const MODES = { europepmc: "informational", biostudies: "query" };

describe("Search and Structure React workspaces", () => {
  it.each(SEARCH_STRUCTURE_PLUGIN_SLUGS)("renders a domain-specific workflow and the declared Workbench lifecycle for %s", slug => {
    const mode = MODES[slug] || "async_analysis";
    const testId = mode === "query" ? "query-workflow" : mode === "informational" ? "read-only-workspace" : "async-workflow";
    const Renderer = SEARCH_STRUCTURE_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer: mode }} />);
    expect(screen.getByRole("list", { name: "Workflow steps" })).toBeTruthy();
    expect(screen.getByTestId(testId).textContent.includes(slug)).toBe(true);
  });
});
