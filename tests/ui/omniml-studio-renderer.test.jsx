import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { nativePluginRequest } = vi.hoisted(() => ({ nativePluginRequest: vi.fn() }));
vi.mock("../../src/ui/lib/nativePluginApi", () => ({ nativePluginRequest }));

import OmniMLStudioRenderer from "../../src/ui/components/workbench/OmniMLStudioRenderer";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => {
  nativePluginRequest.mockImplementation(path => path.includes("api/index")
    ? Promise.resolve({ ok: true, items: [
      { id: "intro", title: "Getting Started", summary: "Introductory guide", slug: "basics" },
      { id: "model", title: "Model Training", summary: "Train a model", slug: "training" },
    ] })
    : Promise.resolve({
      ok: true, title: "Getting Started", slug: "basics", relpath: "private/path.md",
      toc_html: '<ul><li><a href="#intro">Introduction</a></li></ul>',
      html: '<h1 id="intro">Introduction</h1><p>Safe <strong>React</strong> content <a href="javascript:alert(1)">unsafe link</a>.</p><pre><code>print("hello")</code></pre><script>alert("x")</script>',
    }));
});

describe("OmniML Studio React tutorial browser", () => {
  it("loads, searches, and reads tutorial content without injecting HTML", async () => {
    render(<OmniMLStudioRenderer />);
    const intro = await screen.findByRole("button", { name: /Getting Started/ });
    expect(screen.getByText("2 shown · 2 total")).toBeInTheDocument();
    fireEvent.click(intro);
    expect(await screen.findByRole("heading", { name: "Introduction" })).toBeInTheDocument();
    expect(screen.getByText("React").tagName).toBe("STRONG");
    expect(screen.getByText(/unsafe link/).tagName).toBe("SPAN");
    expect(screen.queryByText(/alert\("x"\)/)).not.toBeInTheDocument();
    expect(screen.getByText('print("hello")')).toBeInTheDocument();
    expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/omniml_studio/api/index/", expect.any(Object));
    expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/omniml_studio/api/doc/?id=intro", expect.any(Object));

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "model" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /Model Training/ })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Getting Started/ })).not.toBeInTheDocument();
    expect(screen.getByText("1 shown · 2 total")).toBeInTheDocument();
  });

  it("shows an empty state when the catalog is empty", async () => {
    nativePluginRequest.mockResolvedValueOnce({ ok: true, items: [] });
    render(<OmniMLStudioRenderer />);
    expect(await screen.findByText("No tutorials are available.")).toBeInTheDocument();
  });
});
