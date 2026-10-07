import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ServiceViewer from "../../src/ui/pages/ServiceViewer";

beforeEach(() => { delete window.api; delete window.electronAPI; });
afterEach(() => { cleanup(); delete window.api; delete window.electronAPI; });

describe("ServiceViewer", () => {
  it("keeps the canonical Launcher iframe stable until an explicit reopen", () => {
    const onBack = vi.fn();
    const { rerender } = render(<ServiceViewer key={1} url="/_svc/sdk" label="Code" onBack={onBack} />);
    const first = screen.getByTitle("Code");
    expect(first).toHaveAttribute("src", "/_svc/sdk");
    rerender(<ServiceViewer key={1} url="/_svc/sdk" label="Code" onBack={onBack} backLabel="Studio" />);
    expect(screen.getByTitle("Code")).toBe(first);
    rerender(<ServiceViewer key={2} url="/_svc/sdk" label="Code" onBack={onBack} />);
    expect(screen.getByTitle("Code")).not.toBe(first);
    expect(screen.getByTitle("Code")).toHaveAttribute("src", "/_svc/sdk");
    rerender(<ServiceViewer key={3} url="/_svc/workflows" label="Workflows" onBack={onBack} />);
    expect(screen.queryByTitle("Code")).toBeNull();
    expect(screen.getByTitle("Workflows")).toHaveAttribute("src", "/_svc/workflows");
  });

  it("renders an iframe in the web build, titled by label or the URL as a fallback", () => {
    const { unmount } = render(<ServiceViewer url="/service" label="Service" onBack={vi.fn()} />);
    const iframe = document.querySelector("iframe");
    expect(iframe.title).toBe("Service");
    expect(document.querySelector("webview")).toBeNull();
    unmount();

    render(<ServiceViewer url="/service" onBack={vi.fn()} />);
    expect(document.querySelector("iframe").title).toBe("/service");
  });

  it("calls onBack", () => {
    const onBack = vi.fn();
    render(<ServiceViewer url="/service" label="Service" onBack={onBack} />);
    fireEvent.click(screen.getByText("← Back to Studio"));
    expect(onBack).toHaveBeenCalled();
  });

  it("renders a webview under Electron and forwards open-external IPC messages", () => {
    window.api = {};
    window.electronAPI = { openExternal: vi.fn() };
    render(<ServiceViewer url="/service" label="Service" onBack={vi.fn()} />);
    const webview = document.querySelector("webview");
    expect(webview).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();

    const handlerEvent = new Event("ipc-message");
    handlerEvent.channel = "open-external";
    handlerEvent.args = ["https://example.com"];
    webview.dispatchEvent(handlerEvent);
    expect(window.electronAPI.openExternal).toHaveBeenCalledWith("https://example.com");

    const ignoredEvent = new Event("ipc-message");
    ignoredEvent.channel = "something-else";
    webview.dispatchEvent(ignoredEvent);
    expect(window.electronAPI.openExternal).toHaveBeenCalledTimes(1);
  });
});

it("labels the native catalog return action without changing the embedded application URL", () => {
  const onBack = vi.fn();
  render(<ServiceViewer url="/_svc/workbench/plugins/rna/" label="RNA Analysis" backLabel="Back to Workbench" onBack={onBack} />);
  expect(screen.getByTitle("RNA Analysis")).toHaveAttribute("src", "/_svc/workbench/plugins/rna/");
  fireEvent.click(screen.getByRole("button", { name: "← Back to Workbench" }));
  expect(onBack).toHaveBeenCalledOnce();
});
