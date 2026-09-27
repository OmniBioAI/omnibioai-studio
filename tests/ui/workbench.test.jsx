import React, { useState } from "react";
import { render, screen, within, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Workbench from "../../src/ui/pages/Workbench";
import { catalog, catalogResponse } from "./workbench-fixture";

function Harness({ onOpen = vi.fn(), initial = {} }) {
  const [state, setState] = useState({ query: "", category: "__all__", focusSlug: null, ...initial });
  return <Workbench state={state} onStateChange={setState} onOpen={onOpen} />;
}
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(catalogResponse())));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Native Workbench catalog", () => {
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
    expect(onOpen).toHaveBeenCalledWith("/_svc/workbench/ops/", "System Health");
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
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load Workbench catalog (503)");
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
});
