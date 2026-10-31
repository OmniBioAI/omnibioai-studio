import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/components/workbench/AsyncAnalysisRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="async-workflow">Run UI for {descriptor.plugin.slug}</div>,
}));
vi.mock("../../src/ui/components/workbench/InformationalRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="read-only-workspace">Read-only UI for {descriptor.plugin.slug}</div>,
}));

import { CRISPR_DRUG_PLUGIN_RENDERERS, CRISPR_DRUG_PLUGIN_SLUGS } from "../../src/ui/components/workbench/CrisprDrugReactRenderers";

afterEach(cleanup);

const READ_ONLY = ["crispr_screen_analysis", "crispr_off_target_analysis", "drug_discovery_intelligence", "molecular_docking"];

describe("CRISPR and Drug Discovery React workspaces", () => {
  it.each(CRISPR_DRUG_PLUGIN_SLUGS)("renders a domain-specific workflow and the correct capability for %s", slug => {
    const readOnly = READ_ONLY.includes(slug);
    const Renderer = CRISPR_DRUG_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer: readOnly ? "informational" : "async_analysis" }} />);
    expect(screen.getByRole("list", { name: "Workflow steps" })).toBeTruthy();
    expect(screen.getByTestId(readOnly ? "read-only-workspace" : "async-workflow").textContent.includes(slug)).toBe(true);
  });
});
