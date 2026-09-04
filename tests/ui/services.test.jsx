import React from "react";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Services from "../../src/ui/pages/Services";

const admin = { email: "a@test", permissions: ["manage_config"] };

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Generic router: health-check URLs (/_svc/*) resolve ok by default; launcher
// status/start/stop/restart calls resolve via explicit per-test overrides.
function mockFetch(overrides = {}) {
  return vi.fn((url, opts) => {
    const u = String(url);
    for (const [match, respond] of Object.entries(overrides)) {
      if (u.includes(match)) return respond(u, opts);
    }
    if (u.includes("/api/launcher/status/")) return Promise.resolve(jsonRes({ status: "stopped" }));
    if (u.includes("/api/launcher/")) return Promise.resolve(new Response("", { status: 200 }));
    return Promise.resolve(new Response("", { status: 200 }));
  });
}

beforeEach(() => { delete window.api; delete window.electronAPI; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); delete window.api; delete window.electronAPI; });

describe("Services page", () => {
  it("polls direct health checks only (no window.api) and shows up/down counts", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/_svc/auth": () => Promise.resolve(new Response("", { status: 500 })) }));
    render(<Services config={{ mode: "local" }} currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("MySQL")).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText("● Running").length).toBeGreaterThan(0));
    expect(screen.getAllByText("✕ Stopped").length).toBeGreaterThan(0); // auth-service (and IDE tools) forced down
    expect(screen.getByText(/last check:/)).toBeInTheDocument();
  });

  it("maps window.api.checkHealth results including the ollama warn branch", async () => {
    window.api = {
      checkHealth: vi.fn().mockResolvedValue({ mysql: true, redis: false, workbench: true, tes: true, toolserver: false, ollama: false, rag: true }),
    };
    vi.stubGlobal("fetch", mockFetch());
    render(<Services config={{ mode: "local" }} currentUser={admin} />);
    await waitFor(() => expect(window.api.checkHealth).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("◐ Starting")).toBeInTheDocument()); // ollama -> warn
    cleanup();

    // Inverted health: covers the other half of every up/down ternary above.
    window.api = {
      checkHealth: vi.fn().mockResolvedValue({ mysql: false, redis: true, workbench: false, tes: false, toolserver: true, ollama: true, rag: false }),
    };
    vi.stubGlobal("fetch", mockFetch());
    render(<Services config={{ mode: "local" }} currentUser={admin} />);
    await waitFor(() => expect(window.api.checkHealth).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText("✕ Stopped").length).toBeGreaterThan(0));
  });

  it("maps IDE launcher status to running/starting/stopped, and to down on a bad response or network error", async () => {
    vi.stubGlobal("fetch", mockFetch({
      "/api/launcher/status/jupyter/": () => Promise.resolve(jsonRes({ status: "Running" })),
      "/api/launcher/status/rstudio/": () => Promise.resolve(jsonRes({ status: "Starting" })),
      "/api/launcher/status/vscode/": () => Promise.resolve(new Response("", { status: 500 })),
    }));
    render(<Services config={{ mode: "local" }} currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("Open ↗")).toBeInTheDocument()); // jupyter running
    expect(screen.getByText("Starting...")).toBeInTheDocument(); // rstudio starting
    expect(screen.getAllByText("Start").length).toBeGreaterThan(0); // vscode down/unknown
  });

  it("starts, restarts, and stops an IDE tool via the launcher API", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<Services config={{ mode: "local" }} currentUser={admin} />);
    await waitFor(() => expect(screen.getAllByText("Start").length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByText("Start")[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/launcher/start/"), expect.anything()));

    // now simulate it running so Restart/Stop render
    const fetchMock2 = mockFetch({ "/api/launcher/status/jupyter/": () => Promise.resolve(jsonRes({ status: "running" })) });
    vi.stubGlobal("fetch", fetchMock2);
    cleanup();
    render(<Services config={{ mode: "local" }} currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("MySQL").closest("tr")).toBeTruthy());
    const jupyterRow = screen.getByText("JupyterLab").closest("tr");
    fireEvent.click(within(jupyterRow).getByText("↻ Restart"));
    await waitFor(() => expect(fetchMock2).toHaveBeenCalledWith(expect.stringContaining("/api/launcher/stop/jupyter/"), expect.anything()));
    await waitFor(() => expect(fetchMock2).toHaveBeenCalledWith(expect.stringContaining("/api/launcher/start/jupyter/"), expect.anything()));
    fireEvent.click(within(screen.getByText("JupyterLab").closest("tr")).getByText("Stop"));
    await waitFor(() => expect(fetchMock2).toHaveBeenCalledWith(expect.stringContaining("/api/launcher/stop/jupyter/"), expect.anything()));
  });

  it("opens a running IDE tool with a nginx-proxied web path, or a direct Electron URL with a Jupyter token", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/api/launcher/status/jupyter/": () => Promise.resolve(jsonRes({ status: "running" })) }));
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => {});
    render(<Services config={{ mode: "local" }} currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("Open ↗")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Open ↗"));
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("/jupyter/?token="), "_blank");
    cleanup();

    window.api = {}; // isElectron() true
    window.electronAPI = { openExternal: vi.fn() };
    vi.stubGlobal("fetch", mockFetch({ "/api/launcher/status/jupyter/": () => Promise.resolve(jsonRes({ status: "running" })) }));
    render(<Services config={{ mode: "local" }} currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("Open ↗")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Open ↗"));
    expect(window.electronAPI.openExternal).toHaveBeenCalledWith(expect.stringContaining("192.168.86.234:8888?token="));
  });

  it("restarts a non-IDE service via window.api, and simulates the restart without it", async () => {
    window.api = { restartService: vi.fn().mockResolvedValue() };
    vi.stubGlobal("fetch", mockFetch());
    render(<Services config={{ mode: "local" }} currentUser={admin} />);
    await waitFor(() => expect(screen.getAllByText("↻ Restart").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText("↻ Restart")[0]);
    await waitFor(() => expect(window.api.restartService).toHaveBeenCalled());

    cleanup();
    delete window.api;
    vi.useFakeTimers();
    vi.stubGlobal("fetch", mockFetch());
    render(<Services config={{ mode: "local" }} currentUser={admin} />);
    await vi.waitFor(() => expect(screen.getAllByText("↻ Restart").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText("↻ Restart")[0]);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(screen.getAllByText("↻ Restart").length).toBeGreaterThan(0));
  });

  it("marks a service down when its restart call fails", async () => {
    window.api = { restartService: vi.fn().mockRejectedValue(new Error("nope")) };
    vi.stubGlobal("fetch", mockFetch());
    render(<Services config={{ mode: "local" }} currentUser={admin} />);
    await waitFor(() => expect(screen.getAllByText("↻ Restart").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText("↻ Restart")[0]);
    await waitFor(() => expect(window.api.restartService).toHaveBeenCalled());
  });

  it("refreshes on demand and highlights a row on hover", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<Services config={{ mode: "local" }} currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("MySQL")).toBeInTheDocument());
    const before = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByText("↻ Refresh"));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));

    const row = screen.getByText("MySQL").closest("tr");
    fireEvent.mouseEnter(row);
    expect(row.style.background).toBe("rgba(255, 255, 255, 0.02)");
    fireEvent.mouseLeave(row);
    expect(row.style.background).toBe("transparent");
  });

  it("labels itself for beta mode", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(<Services config={{ mode: "beta" }} currentUser={admin} />);
    expect(screen.getByText(/monitoring remote cloud services via tunnel/)).toBeInTheDocument();
  });
});
