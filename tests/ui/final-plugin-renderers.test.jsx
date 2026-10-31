import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/components/workbench/AsyncAnalysisRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="async-workflow">Async {descriptor.plugin.slug}</div>,
}));
vi.mock("../../src/ui/components/workbench/InformationalRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="informational-workflow">Information {descriptor.plugin.slug}</div>,
}));

import {
  FINAL_PLUGIN_GROUPS,
  FINAL_PLUGIN_MODES,
  FINAL_PLUGIN_RENDERERS,
  FINAL_PLUGIN_SLUGS,
} from "../../src/ui/components/workbench/FinalPluginRenderers";
import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";
import { ANALYSIS_PLUGIN_RENDERERS } from "../../src/ui/components/workbench/AnalysisPluginRenderers";

afterEach(cleanup);

describe("final one-hundred-and-one promoted plugin React renderers", () => {
  it("defines the final twenty Studio groups and one-hundred-and-one unique plugins", () => {
    expect(FINAL_PLUGIN_GROUPS).toHaveLength(20);
    expect(FINAL_PLUGIN_SLUGS).toHaveLength(101);
    expect(new Set(FINAL_PLUGIN_SLUGS).size).toBe(101);
    expect(Object.keys(FINAL_PLUGIN_RENDERERS).sort()).toEqual([...FINAL_PLUGIN_SLUGS].sort());
    expect(Object.values(FINAL_PLUGIN_MODES).filter(mode => mode === "generic_runner")).toHaveLength(12);
    expect(Object.values(FINAL_PLUGIN_MODES).filter(mode => mode === "informational")).toHaveLength(89);
  });

  it.each(FINAL_PLUGIN_SLUGS)("uses the live lifecycle and dedicated override for %s", slug => {
    const renderer = FINAL_PLUGIN_MODES[slug];
    const Renderer = FINAL_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer }} />);
    expect(screen.getByTestId(renderer === "informational" ? "informational-workflow" : "async-workflow"))
      .toHaveTextContent(slug);
    const resolved = resolveWorkbenchRenderer(renderer, slug);
    expect(typeof resolved).toBe("function");
    if (ANALYSIS_PLUGIN_RENDERERS[slug]) expect(resolved).toBe(ANALYSIS_PLUGIN_RENDERERS[slug]);
    expect(resolved).not.toBe(resolveWorkbenchRenderer(renderer));
  });
});
