import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PluginManagerRenderer from "../../src/ui/components/workbench/PluginManagerRenderer";
import AuditLogRenderer from "../../src/ui/components/workbench/AuditLogRenderer";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const response = payload => ({ ok: true, json: async () => payload });

describe("Plugin Manager React renderer", () => {
  it("loads registry cards and enables a plugin through the staff API", async () => {
    const fetch = vi.fn(async (url, options = {}) => {
      if (String(url).includes("/api/catalog/")) return response({ categories: ["analysis"], restart_required: true, plugins: [
        { slug: "demo_tool", name: "Demo Tool", category: "analysis", version: "1.2", description: "Test plugin", enabled: false,
          mount_path: "/plugins/demo_tool/", app: "plugins.demo_tool.apps.DemoToolConfig", urls: "plugins.demo_tool.urls" },
      ] });
      if (String(url).includes("/api/toggle/demo_tool/") && options.method === "POST") return response({ status: "ok", enabled: true, restart_required: true });
      return { ok: false, status: 404, json: async () => ({ error: "Not found" }) };
    });
    vi.stubGlobal("fetch", fetch); vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup(); render(<PluginManagerRenderer />);
    expect(await screen.findByText("Demo Tool")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Enable" }));
    await waitFor(() => expect(screen.getByText(/demo_tool enabled\. Restart the Workbench/)).toBeInTheDocument());
    expect(fetch.mock.calls.some(([url, options]) => String(url).includes("/api/toggle/demo_tool/") && options.method === "POST" && JSON.parse(options.body).enabled === true)).toBe(true);
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/plugins/demo_tool/");
  });

  it("applies audit filters and opens a selected event detail", async () => {
    const fetch = vi.fn(async url => {
      if (String(url).includes("/api/events/10")) return response({ ok: true, event: { id: 10, action: "workflow.completed", metadata: { result: "ok" } } });
      if (String(url).includes("/api/events?")) return response({ ok: true, page: 1, total_pages: 1, total_events: 1, events: [
        { id: 10, created_at: "2026-10-30T12:00:00Z", severity: "INFO", action: "workflow.completed", source: "workflow_runner", actor: "user@example.org", object_id: "object-1", run_id: "run-10", workflow_id: "wf-3" },
      ] });
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup(); render(<AuditLogRenderer />);
    const eventRow = await screen.findByRole("row", { name: "Inspect event 10" });
    await user.click(eventRow);
    const details = await screen.findByRole("region", { name: "Selected audit event" });
    expect(within(details).getByText(/workflow\.completed/)).toBeInTheDocument();
    const search = screen.getByLabelText("Search");
    await user.type(search, "workflow");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes("q=workflow"))).toBe(true));
    expect(within(screen.getByRole("table")).getByText("run-10")).toBeInTheDocument();
  });
});
