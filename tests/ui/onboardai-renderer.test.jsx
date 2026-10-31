import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { nativePluginRequest } = vi.hoisted(() => ({ nativePluginRequest: vi.fn() }));
vi.mock("../../src/ui/lib/nativePluginApi", () => ({ nativePluginRequest }));

import OnboardAiRenderer from "../../src/ui/components/workbench/OnboardAiRenderer";
import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";

const items = [
  { id: "plugins_onboardai_README.md", title: "OnboardAI README", summary: "How onboarding works", relpath: "plugins/onboardai/README.md", group: "plugins", slug: "onboardai", url_hint: "/plugins/onboardai/", enabled: true },
  { id: "docs_SETUP.md", title: "Setup Guide", summary: "Project setup instructions", relpath: "docs/SETUP.md", group: "docs" },
];

beforeEach(() => {
  nativePluginRequest.mockImplementation(async path => {
    if (path === "/plugins/onboardai/api/index/") return { ok: true, total: items.length, items };
    if (path.startsWith("/plugins/onboardai/api/doc/")) return { ok: true, ...items[0], html: "<h2>Welcome</h2><p>Browse the docs.</p>", toc_html: "<ul><li><a href=\"#welcome\">Welcome</a></li></ul>" };
    if (path === "/plugins/onboardai/api/ask/") return { ok: true, answer: "A useful answer [S1].", sources: [{ sid: "S1", title: "OnboardAI README", relpath: "plugins/onboardai/README.md", score: 0.91 }] };
    return { ok: true, manifest: { count: 12 } };
  });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("OnboardAI React documentation workspace", () => {
  it("registers a dedicated renderer instead of the generic async page", () => {
    expect(resolveWorkbenchRenderer("async_analysis", "onboardai")).toBe(OnboardAiRenderer);
  });

  it("loads and filters the catalog, then displays a selected document and React plugin link", async () => {
    render(<OnboardAiRenderer />);
    const readme = await screen.findByRole("button", { name: /OnboardAI README/ });
    fireEvent.click(readme);
    expect(await screen.findByRole("heading", { name: "Welcome" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open plugin" })).toHaveAttribute("href", "/studio/plugins/onboardai");
    fireEvent.change(screen.getByRole("textbox", { name: "Search documents" }), { target: { value: "setup" } });
    expect(screen.getByRole("button", { name: /Setup Guide/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /OnboardAI README/ })).not.toBeInTheDocument();
  });

  it("asks the documentation API and renders its cited source as a document action", async () => {
    render(<OnboardAiRenderer />);
    await screen.findByRole("button", { name: /OnboardAI README/ });
    fireEvent.change(screen.getByRole("textbox", { name: "Question for OnboardAI" }), { target: { value: "How do I start?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask OnboardAI" }));
    expect(await screen.findByText("A useful answer [S1].")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /S1 · OnboardAI README/ })).toBeInTheDocument();
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/onboardai/api/ask/", {
      method: "POST", body: { question: "How do I start?", top_k: 8, debug: false },
    }));
  });

  it("reports that reindexing is staff-only when the backend rejects the request", async () => {
    nativePluginRequest.mockImplementation(async path => {
      if (path === "/plugins/onboardai/api/index/") return { ok: true, items };
      const error = new Error("Forbidden"); error.status = 403; throw error;
    });
    render(<OnboardAiRenderer />);
    fireEvent.click(await screen.findByRole("button", { name: "Rebuild index" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("restricted to staff accounts");
  });
});
