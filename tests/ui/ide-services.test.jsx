import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IdeServices from "../../src/ui/pages/IdeServices";

const admin = { email: "a@test", permissions: ["manage_config"] };

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function mockFetch(overrides = {}) {
  return vi.fn((url) => {
    const u = String(url);
    for (const [match, respond] of Object.entries(overrides)) {
      if (u.includes(match)) return respond();
    }
    return Promise.resolve(jsonRes({ status: "stopped" }));
  });
}

beforeEach(() => { delete window.api; delete window.electronAPI; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete window.api; delete window.electronAPI; });

describe("IdeServices page", () => {
  it("maps running, starting, and a non-ok status response to their badges", async () => {
    vi.stubGlobal("fetch", mockFetch({
      "status/jupyter/": () => Promise.resolve(jsonRes({ status: "Running" })),
      "status/rstudio/": () => Promise.resolve(jsonRes({ status: "Starting" })),
      "status/vscode/": () => Promise.resolve(new Response("", { status: 500 })),
    }));
    render(<IdeServices currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("RUNNING")).toBeInTheDocument());
    expect(screen.getByText("STARTING")).toBeInTheDocument();
    expect(screen.getByText("STOPPED")).toBeInTheDocument();
    expect(screen.getByText("Open →")).toBeInTheDocument();
    expect(screen.getByText("Starting...")).toBeInTheDocument();
    expect(screen.getByText("Stopped — start from Services")).toBeInTheDocument();
  });

  it("falls back to stopped when the status fetch throws", async () => {
    vi.stubGlobal("fetch", mockFetch({ "status/jupyter/": () => Promise.reject(new Error("offline")) }));
    render(<IdeServices currentUser={admin} />);
    await waitFor(() => expect(screen.getAllByText("STOPPED").length).toBeGreaterThan(0));
  });

  it("opens a running tool via a nginx-proxied web path, or a direct Electron URL with a Jupyter token", async () => {
    vi.stubGlobal("fetch", mockFetch({ "status/jupyter/": () => Promise.resolve(jsonRes({ status: "running" })) }));
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => {});
    render(<IdeServices currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("Open →")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Open →"));
    expect(openSpy).toHaveBeenCalledWith("/jupyter/?token=devtoken", "_blank");
    cleanup();

    window.api = {};
    window.electronAPI = { openExternal: vi.fn() };
    vi.stubGlobal("fetch", mockFetch({
      "status/jupyter/": () => Promise.resolve(jsonRes({ status: "running" })),
      "status/rstudio/": () => Promise.resolve(jsonRes({ status: "running" })),
    }));
    render(<IdeServices currentUser={admin} />);
    const openButtons = await screen.findAllByText("Open →");
    fireEvent.click(openButtons[0]);
    expect(window.electronAPI.openExternal).toHaveBeenCalledWith("http://192.168.86.234:8888?token=devtoken");
    fireEvent.click(openButtons[1]);
    expect(window.electronAPI.openExternal).toHaveBeenCalledWith("http://192.168.86.234:8787");
  });

  it("refreshes on demand and dims the Open button on hover out", async () => {
    const fetchMock = mockFetch({ "status/jupyter/": () => Promise.resolve(jsonRes({ status: "running" })) });
    vi.stubGlobal("fetch", fetchMock);
    render(<IdeServices currentUser={admin} />);
    const openBtn = await screen.findByText("Open →");
    fireEvent.mouseEnter(openBtn);
    expect(openBtn.style.opacity).toBe("0.85");
    fireEvent.mouseLeave(openBtn);
    expect(openBtn.style.opacity).toBe("1");

    const before = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByText("↻ Refresh"));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });
});
