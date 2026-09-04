import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ServiceViewer from "../../src/ui/pages/ServiceViewer";

beforeEach(() => { delete window.api; delete window.electronAPI; });
afterEach(() => { cleanup(); delete window.api; delete window.electronAPI; });

describe("ServiceViewer", () => {
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
    fireEvent.click(screen.getByText("← Back to Workbench"));
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
