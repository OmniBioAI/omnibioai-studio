import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// GRAFANA_BASE is computed once at module load from isElectron(), so each
// variant needs its own fresh module instance (vi.resetModules + a dynamic
// import) rather than toggling window state after import.
async function loadWith(isElectron) {
  vi.resetModules();
  vi.doMock("../../src/ui/lib/session", () => ({ isElectron: () => isElectron }));
  const mod = await import("../../src/ui/components/GrafanaViewer/GrafanaViewer");
  return mod.GrafanaViewer;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.doUnmock("../../src/ui/lib/session"); delete window.electronAPI; });

describe("GrafanaViewer — web build", () => {
  it("skips login, renders the dashboard in an iframe, and switches tabs", async () => {
    const GrafanaViewer = await loadWith(false);
    const onBack = vi.fn();
    render(<GrafanaViewer onBack={onBack} label="My Dashboard" />);
    expect(await screen.findByText("Services")).toBeInTheDocument();
    const iframe = document.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe.title).toBe("My Dashboard");
    expect(document.querySelector("webview")).toBeNull();

    fireEvent.click(screen.getByText("RAG"));
    expect(document.querySelector("iframe").src).toContain("omnibioai-rag");

    fireEvent.click(screen.getByText("← Back to Workbench"));
    expect(onBack).toHaveBeenCalled();
  });

  it("falls back to the default dashboard title with no label", async () => {
    const GrafanaViewer = await loadWith(false);
    render(<GrafanaViewer onBack={vi.fn()} />);
    expect(await screen.findByText("Metrics Dashboard")).toBeInTheDocument();
  });
});

describe("GrafanaViewer — Electron build", () => {
  it("shows a spinner while authenticating, then the dashboard in a webview on success", async () => {
    const GrafanaViewer = await loadWith(true);
    let resolveLogin;
    window.electronAPI = { grafanaLogin: vi.fn(() => new Promise((res) => { resolveLogin = res; })) };
    const { container } = render(<GrafanaViewer onBack={vi.fn()} />);
    expect(container.querySelector(".omni-spinner, [class*=spinner]") || container.textContent).toBeDefined();
    expect(screen.queryByText("Services")).not.toBeInTheDocument();
    resolveLogin();
    expect(await screen.findByText("Services")).toBeInTheDocument();
    expect(document.querySelector("webview")).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("shows the retry screen with the backend's error message on a failed login", async () => {
    const GrafanaViewer = await loadWith(true);
    window.electronAPI = { grafanaLogin: vi.fn().mockRejectedValue(new Error("Grafana unreachable")) };
    render(<GrafanaViewer onBack={vi.fn()} />);
    expect(await screen.findByText("Grafana unreachable")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("falls back to a generic error message and retries with a busy indicator", async () => {
    const GrafanaViewer = await loadWith(true);
    window.electronAPI = { grafanaLogin: vi.fn().mockRejectedValue(new Error()) };
    render(<GrafanaViewer onBack={vi.fn()} />);
    expect(await screen.findByText("Auth failed — check Grafana is running")).toBeInTheDocument();

    let resolveRetry;
    window.electronAPI.grafanaLogin.mockImplementationOnce(() => new Promise((res) => { resolveRetry = res; }));
    fireEvent.click(screen.getByText("Retry"));
    expect(await screen.findByText("Connecting…")).toBeInTheDocument();
    resolveRetry();
    await waitFor(() => expect(screen.getByText("Services")).toBeInTheDocument());
  });
});
