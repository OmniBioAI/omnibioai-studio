import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/components/workbench/AsyncAnalysisRenderer", () => ({
  default: ({ descriptor }) => <div data-testid="ai-run-form">Run form for {descriptor.plugin.slug}</div>,
}));

import { AI_PLUGIN_RENDERERS, AI_PLUGIN_SLUGS } from "../../src/ui/components/workbench/AiPluginRenderers";
import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";

afterEach(cleanup);

describe("AI category React plugin pages", () => {
  it("registers guided React experiences for the remaining executable AI plugins", () => {
    expect(AI_PLUGIN_SLUGS).toEqual([
      "agent_workflow_studio", "bio_hypothesis_ai", "bio_narrator_ai",
      "literature_summarizer",
    ]);
  });

  it.each(AI_PLUGIN_SLUGS)("uses the authenticated run renderer for %s", slug => {
    const Renderer = AI_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug }, renderer: "async_analysis" }} />);
    expect(screen.getByText("Studio React")).toBeInTheDocument();
    expect(screen.getByTestId("ai-run-form")).toHaveTextContent(slug);
    expect(resolveWorkbenchRenderer("async_analysis", slug)).toBe(Renderer);
  });
});
