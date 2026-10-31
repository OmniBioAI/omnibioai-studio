import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { nativePluginRequest, loadWorkbenchCatalog } = vi.hoisted(() => ({
  nativePluginRequest: vi.fn(), loadWorkbenchCatalog: vi.fn(),
}));
vi.mock("../../src/ui/lib/nativePluginApi", () => ({ nativePluginRequest }));
vi.mock("../../src/ui/lib/workbenchApi", () => ({ loadWorkbenchCatalog }));
import {
  AlertingRenderer, ApiAnalyticsRenderer, DataManagerRenderer, HomeDashboardRenderer,
  IntegrationConnectionsRenderer, NotificationCenterRenderer, ProvenanceRenderer,
  ResourceMonitoringRenderer, SecurityDashboardRenderer,
} from "../../src/ui/components/workbench/DashboardPluginRenderers";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("historical dashboard React renderers", () => {
  it.each([
    [AlertingRenderer, "Alerting & Notifications"],
    [ApiAnalyticsRenderer, "API Analytics Dashboard"],
    [DataManagerRenderer, "Data Manager"],
    [HomeDashboardRenderer, "Workbench Home"],
    [IntegrationConnectionsRenderer, "Integration Connections"],
    [NotificationCenterRenderer, "Notification Center"],
    [ProvenanceRenderer, "Provenance"],
    [ResourceMonitoringRenderer, "Resource & Cost Monitoring"],
    [SecurityDashboardRenderer, "Security Dashboard"],
  ])("mounts %s without template content", async (Renderer, title) => {
    nativePluginRequest.mockResolvedValue({});
    loadWorkbenchCatalog.mockResolvedValue({ schema_version: 1, total_count: 0, categories: [] });
    render(<Renderer />);
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(document.querySelector("iframe, webview")).toBeNull();
  });
});
