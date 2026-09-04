import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isElectron, getCurrentUserSync, getCurrentUser, onSessionChange } = vi.hoisted(() => ({
  isElectron: vi.fn(() => false),
  getCurrentUserSync: vi.fn(() => null),
  getCurrentUser: vi.fn().mockResolvedValue(null),
  onSessionChange: vi.fn(() => vi.fn()),
}));
vi.mock("../../src/ui/lib/session", () => ({ isElectron, getCurrentUserSync, getCurrentUser, onSessionChange }));

import Workbench from "../../src/ui/pages/Workbench";

beforeEach(() => {
  isElectron.mockReturnValue(false);
  getCurrentUserSync.mockReturnValue(null);
  getCurrentUser.mockResolvedValue(null);
  onSessionChange.mockReturnValue(vi.fn());
  delete window.api;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete window.api; });

describe("Workbench page", () => {
  it("shows online status once the health check succeeds and opens local links", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Workbench />);
    expect(screen.getByText("Checking...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());
    expect(screen.queryByText(/Workbench offline/)).not.toBeInTheDocument();

    const opened = vi.fn();
    window.addEventListener("open-service", opened);
    fireEvent.click(screen.getAllByRole("button", { name: "Open plugin catalog" })[0]);
    expect(opened).toHaveBeenCalled();

    const homeTile = screen.getByRole("button", { name: /^Home — /i });
    fireEvent.mouseEnter(homeTile);
    expect(homeTile.style.background).toBe("rgba(255, 255, 255, 0.03)");
    fireEvent.mouseLeave(homeTile);
    expect(homeTile.style.background).toBe("var(--bg3)");
    fireEvent.click(homeTile);
    expect(opened).toHaveBeenCalledTimes(2);
    window.removeEventListener("open-service", opened);
  });

  it("shows the offline banner and navigates to Launch from it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    render(<Workbench />);
    await waitFor(() => expect(screen.getByText("Offline")).toBeInTheDocument());
    expect(screen.getByText(/Workbench offline/)).toBeInTheDocument();

    const navigated = vi.fn();
    window.addEventListener("navigate", navigated);
    fireEvent.click(screen.getByText("Go to Launch →"));
    expect(navigated).toHaveBeenCalled();
    window.removeEventListener("navigate", navigated);

    // a non-local plugin tile is disabled while offline
    const catalogTile = screen.getAllByRole("button", { name: "Open plugin catalog" })[0];
    expect(catalogTile).toHaveAttribute("aria-disabled", "true");
  });

  it("launches the workbench dashboard from the header and the explore-more banner", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Workbench />);
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());
    const opened = vi.fn();
    window.addEventListener("open-service", opened);

    fireEvent.click(screen.getAllByRole("button", { name: "Launch workbench dashboard" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Open plugin catalog" })[1]);
    fireEvent.click(screen.getAllByRole("button", { name: "Launch workbench dashboard" })[1]);
    expect(opened).toHaveBeenCalledTimes(3);
    window.removeEventListener("open-service", opened);
  });

  it("re-checks health on demand via the refresh button", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Workbench />);
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());
    const before = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Refresh connection status" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });

  it("loads a saved host from window.api.loadConfig", async () => {
    window.api = { loadConfig: vi.fn().mockResolvedValue({ server: { host_ip: "10.1.1.1" } }) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Workbench />);
    await waitFor(() => expect(screen.getByText("10.1.1.1")).toBeInTheDocument());
  });

  it("hides the Admin Console tile without the required permission, and shows it when the user has it or is still unknown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    getCurrentUserSync.mockReturnValue({ permissions: [] });
    getCurrentUser.mockResolvedValue({ permissions: [] });
    render(<Workbench />);
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());
    expect(screen.queryByText("Admin Console")).not.toBeInTheDocument();
    cleanup();

    getCurrentUserSync.mockReturnValue({ permissions: ["platform.manage_infra"] });
    getCurrentUser.mockResolvedValue({ permissions: ["platform.manage_infra"] });
    render(<Workbench />);
    await waitFor(() => expect(screen.getByText("Admin Console")).toBeInTheDocument());
    cleanup();

    getCurrentUserSync.mockReturnValue(null);
    getCurrentUser.mockResolvedValue(null);
    render(<Workbench />);
    await waitFor(() => expect(screen.getByText("Admin Console")).toBeInTheDocument());
  });

  it("unsubscribes from session changes on unmount", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    const unsubscribe = vi.fn();
    onSessionChange.mockReturnValue(unsubscribe);
    const { unmount } = render(<Workbench />);
    await waitFor(() => expect(onSessionChange).toHaveBeenCalled());
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("builds an absolute Electron webview URL for local links", async () => {
    isElectron.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Workbench />);
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());
    const opened = vi.fn();
    window.addEventListener("open-service", opened);
    fireEvent.click(screen.getAllByRole("button", { name: "Open plugin catalog" })[0]);
    expect(opened.mock.calls[0][0].detail.url).toMatch(/^http:\/\/localhost/);
    window.removeEventListener("open-service", opened);
  });
});
