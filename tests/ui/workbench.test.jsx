import React, { useState } from "react";
import { render, screen, within, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Workbench, { categoriesForDiscoveryView } from "../../src/ui/pages/Workbench";
import { catalog, catalogResponse } from "./workbench-fixture";

function Harness({ onOpen = vi.fn(), initial = {}, view = "all" }) {
  const [state, setState] = useState({ query: "", category: "__all__", focusSlug: null, ...initial });
  return <Workbench state={state} onStateChange={setState} onOpen={onOpen} view={view} />;
}
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(catalogResponse())));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Native Workbench catalog", () => {
  it("partitions the plugin catalog into integrations, general plugins, and agentic entries without duplicates", () => {
    const categories = [
      { key: "integration", title: "Integrations", plugins: [{ slug: "github", category: "integration" }] },
      { key: "reference_db", title: "Reference Databases", plugins: [{ slug: "pubmed", category: "reference_db" }] },
      { key: "ai", title: "AI", plugins: [{ slug: "bio_agent", category: "ai" }] },
      { key: "analysis", title: "Analysis", plugins: [{ slug: "rnaseq", category: "analysis" }] },
    ];
    const partitions = ["integrations", "plugins", "agentic"].map(view =>
      categoriesForDiscoveryView(categories, view).flatMap(category => category.plugins.map(plugin => plugin.slug)));
    expect(partitions).toEqual([["github", "pubmed"], ["rnaseq"], ["bio_agent"]]);
    expect(partitions.flat().sort()).toEqual(["bio_agent", "github", "pubmed", "rnaseq"]);
  });

  it("renders server-ordered cards, metadata, and category counts", async () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    expect(await screen.findByRole("button", { name: "Open System Health" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Workbench" })).toBeInTheDocument();
    expect(screen.getByText("3 bioinformatics applications")).toBeInTheDocument();
    expect(screen.getByText("Plugins", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("OmniBioAI")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map(el => el.textContent)).toEqual(["System Health", "RNA Analysis", "Quality Control"]);
    expect(screen.getByText("Transcript processing")).toBeInTheDocument();
    expect(screen.getByText("v2.0")).toBeInTheDocument();
    expect(screen.getByText("v")).toBeInTheDocument();
    const filters = within(screen.getByRole("group", { name: "Plugin categories" }));
    expect(filters.getByRole("button", { name: "All 3" })).toHaveAttribute("aria-pressed", "true");
    expect(filters.getByRole("button", { name: "Analysis 2" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 3 of 3 applications");
    expect(screen.queryByRole("button", { name: /legacy Workbench catalog/i })).not.toBeInTheDocument();
  });
  it("renders the filtered Plugins view as a colorful app launcher", async () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} view="plugins" />);
    const app = await screen.findByRole("button", { name: "Open RNA Analysis" });
    expect(screen.getByRole("heading", { level: 1, name: "Plugins" })).toBeInTheDocument();
    expect(app).toHaveClass("native-workbench-app-launch");
    expect(app.closest(".native-workbench-app-shell")).toHaveStyle({ "--plugin-accent": "#5ad7c2" });
    expect(within(app).getByText("Analysis")).toBeInTheDocument();
    expect(within(app).getByText("Transcript processing")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 3 of 3 plugins");
    await userEvent.click(app);
    expect(onOpen).toHaveBeenCalledWith("/_svc/workbench/plugins/rna/", "RNA Analysis", expect.objectContaining({ slug: "rna" }));
  });
  it("searches title/slug/category, temporarily selects All, restores category on Escape and derives all counts from cards", async () => {
    const user = userEvent.setup(); render(<Harness />);
    await screen.findByRole("button", { name: "Open System Health" });
    await user.click(screen.getByRole("button", { name: "Dashboard 1" }));
    expect(screen.queryByRole("button", { name: "Open RNA Analysis" })).not.toBeInTheDocument();
    const search = screen.getByRole("textbox", { name: "Search applications" });
    expect(search).toHaveAttribute("placeholder", "Search applications…");
    await user.type(search, "RNA");
    expect(screen.getByRole("button", { name: "Open RNA Analysis" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Dashboard 0" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 of 3");
    await user.keyboard("{Escape}");
    expect(search).toHaveValue("");
    expect(screen.getByRole("button", { name: "Dashboard 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Open System Health" })).toBeInTheDocument();
    await user.type(search, "analysis");
    expect(screen.getByRole("status")).toHaveTextContent("Showing 2 of 3");
    await user.clear(search); await user.type(search, "qc");
    expect(screen.getByRole("button", { name: "Open Quality Control" })).toBeInTheDocument();
    await user.clear(search); await user.type(search, "Transcript processing");
    expect(screen.getByText("No applications match your search or category.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Analysis 0" }));
    expect(search).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("Showing 2 of 3");
  });
  it("supports keyboard focus, filter activation, and launching without clicking the card div", async () => {
    const user = userEvent.setup(); const onOpen = vi.fn(); render(<Harness onOpen={onOpen} />);
    await screen.findByRole("button", { name: "Open System Health" });
    await user.tab(); expect(screen.getByRole("textbox", { name: "Search applications" })).toHaveFocus();
    await user.tab(); expect(screen.getByRole("button", { name: "All 3" })).toHaveFocus();
    await user.tab(); await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "Dashboard 1" })).toHaveAttribute("aria-pressed", "true");
    await user.tab(); await user.tab();
    expect(screen.getByRole("button", { name: "Open System Health" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith("/_svc/workbench/ops/", "System Health", expect.objectContaining({ slug: "ops_dashboard" }));
  });
  it("shows loading, safely aborts on unmount, and handles empty inventories", async () => {
    fetch.mockImplementationOnce(() => new Promise(() => {}));
    const { unmount } = render(<Harness />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading applications");
    const signal = fetch.mock.calls[0][1].signal;
    unmount(); expect(signal.aborted).toBe(true);
    fetch.mockResolvedValue({ ok: true, json: async () => ({ schema_version: 1, total_count: 0, categories: [] }) });
    render(<Harness />);
    expect(await screen.findByText("No applications are available.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All 0" })).toBeInTheDocument();
  });
  it("shows a retriable API error and keeps the legacy fallback available", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    fetch.mockResolvedValueOnce({ ok: false, status: 503 });
    render(<Harness onOpen={onOpen} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the Workbench catalog. Please try again.");
    const legacy = screen.getByRole("button", { name: "Use legacy Workbench catalog" });
    expect(legacy).toBeEnabled();
    await user.click(legacy);
    expect(onOpen).toHaveBeenCalledWith("/_svc/workbench/", "Workbench Dashboard");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Open RNA Analysis" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("restores the selected category, search, and launching card focus", async () => {
    render(<Harness initial={{ category: "analysis", query: "rna", focusSlug: "rna" }} />);
    const card = await screen.findByRole("button", { name: "Open RNA Analysis" });
    await waitFor(() => expect(card).toHaveFocus());
    expect(screen.getByRole("textbox", { name: "Search applications" })).toHaveValue("rna");
  });
  it("renders metadata as text, never as executable HTML", async () => {
    const data = structuredClone(catalog);
    data.categories[0].plugins[0].description = '<img src=x onerror="alert(1)">';
    fetch.mockResolvedValue({ ok: true, json: async () => data });
    render(<Harness />);
    expect(await screen.findByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(document.querySelector(".native-workbench img")).toBeNull();
  });

  it("shows the Agentic catalog as a dedicated AI plugin view", async () => {
    const data = structuredClone(catalog);
    data.categories[1].plugins.push({ slug: "bio_agent", title: "OmniBioAgent", description: "Agent assistant", version: "1.0", category: "ai", launch_path: "/plugins/bio_agent/" });
    data.categories[1].count = data.categories[1].plugins.length;
    data.total_count += 1;
    fetch.mockResolvedValue({ ok: true, json: async () => data });
    render(<Harness view="agentic" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Agentic" })).toBeInTheDocument();
    const agentCard = screen.getByRole("button", { name: "Open OmniBioAgent" });
    expect(agentCard).toHaveClass("native-agentic-launch");
    expect(screen.getByRole("heading", { name: "Tools that reason, plan, and act" })).toBeInTheDocument();
    expect(screen.getByText("AI AGENT")).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 of 1 plugins");
    expect(screen.queryByRole("button", { name: "Open RNA Analysis" })).not.toBeInTheDocument();
  });
});
