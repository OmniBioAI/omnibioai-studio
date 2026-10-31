import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  checkBioAgentModel: vi.fn(), loadBioAgentContext: vi.fn(), loadBioAgentStatus: vi.fn(),
  sendBioAgentPrompt: vi.fn(), uploadBioAgentFile: vi.fn(),
}));
vi.mock("../../src/ui/lib/bioAgentApi", () => api);

import BioAgentRenderer from "../../src/ui/components/workbench/BioAgentRenderer";
import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("OmniBioAgent native React renderer", () => {
  it("uses the dedicated React renderer and preserves the legacy workspace modes", async () => {
    api.checkBioAgentModel.mockResolvedValue({ ok: true });
    api.loadBioAgentContext.mockResolvedValue({ omniobjects: [{ id: "obj-1", label: "RNA counts" }], run_ids: ["run-1"] });
    render(<BioAgentRenderer />);
    expect(resolveWorkbenchRenderer("query", "bio_agent")).toBe(BioAgentRenderer);
    expect(await screen.findByText("LLM Connected")).toBeInTheDocument();
    expect(screen.getByLabelText("Mode")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "bioquery" } });
    expect(screen.getByText("BioQueryAI input")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("OmniObject", { selector: "input[type=radio]" }));
    expect(await screen.findByRole("option", { name: "RNA counts" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "workflow_planner" } });
    expect(screen.getByText("Planner selection")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "ragbio" } });
    expect(screen.getByText("RAGBio search")).toBeInTheDocument();
  });

  it("submits a prompt and renders the response as React text", async () => {
    api.checkBioAgentModel.mockResolvedValue({ ok: true });
    api.loadBioAgentContext.mockResolvedValue({ omniobjects: [], run_ids: [] });
    api.sendBioAgentPrompt.mockResolvedValue({ response: "A concise answer." });
    render(<BioAgentRenderer />);
    await screen.findByText("LLM Connected");
    fireEvent.change(screen.getByPlaceholderText(/Message/), { target: { value: "What is RNA-seq?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("A concise answer.")).toBeInTheDocument();
    expect(api.sendBioAgentPrompt).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "What is RNA-seq?", mode: "llm", model_name: "llama3:latest",
    }), expect.any(Object));
  });
});
