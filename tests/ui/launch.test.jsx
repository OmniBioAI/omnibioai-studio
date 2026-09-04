import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Launch from "../../src/ui/pages/Launch";

beforeEach(() => { delete window.api; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); delete window.api; });

describe("Launch page — local mode", () => {
  it("shows idle status, polls health via window.api, and renders the summary table", async () => {
    window.api = {
      checkHealth: vi.fn().mockResolvedValue({ mysql: true, workbench: true, tes: true, ollama: false, rag: false }),
    };
    const config = { mode: "local", llm: { enable_ollama: true, enable_claude: true }, cloud: { enable_aws_batch: true }, hpc: { scheduler: "slurm" } };
    render(<Launch config={config} onStatusChange={vi.fn()} />);
    expect(screen.getByText("Boot System")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("● UP").length).toBe(3));
    expect(screen.getByText("◐ INIT")).toBeInTheDocument(); // ollama false -> warn
    expect(screen.getAllByText("Enabled").length).toBeGreaterThan(0);
    cleanup();

    // Inverted health + fully-enabled config: covers the opposite half of
    // every up/down ternary and every summary-row branch above.
    window.api = {
      checkHealth: vi.fn().mockResolvedValue({ mysql: false, workbench: false, tes: false, ollama: true, rag: true }),
    };
    const fullConfig = {
      mode: "local",
      llm: { enable_ollama: true, enable_claude: true, enable_openai: true },
      cloud: { enable_aws_batch: true },
      hpc: { scheduler: "slurm" },
    };
    render(<Launch config={fullConfig} onStatusChange={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText("✕ DOWN").length).toBe(3));
    expect(screen.getAllByText("Enabled").length).toBe(4); // ollama, claude, openai, aws batch
  });

  it("shows the beta-mode default in the summary when mode is unset", async () => {
    render(<Launch config={{}} onStatusChange={vi.fn()} />);
    expect(await screen.findByText("beta")).toBeInTheDocument();
  });

  it("shows disabled/not-configured summary rows and skips polling with no window.api", async () => {
    render(<Launch config={{}} onStatusChange={vi.fn()} />);
    expect(screen.getByText("Not configured")).toBeInTheDocument();
    expect(screen.getAllByText("Disabled").length).toBeGreaterThan(0);
    expect(screen.getAllByText("— —").length).toBeGreaterThan(0); // health never resolved
  });

  it("registers a docker log listener and appends streamed lines", async () => {
    let onLog;
    window.api = { onDockerLog: vi.fn((cb) => { onLog = cb; }) };
    render(<Launch config={{ mode: "local" }} onStatusChange={vi.fn()} />);
    await waitFor(() => expect(window.api.onDockerLog).toHaveBeenCalled());
    onLog("pulling image...");
    await waitFor(() => expect(screen.getByText("pulling image...")).toBeInTheDocument());
  });

  it("boots the system through the full Electron API path and reflects running state", async () => {
    window.api = {
      saveConfig: vi.fn().mockResolvedValue(),
      startDocker: vi.fn().mockResolvedValue(),
      openWorkbench: vi.fn().mockResolvedValue(),
    };
    const onStatusChange = vi.fn();
    render(<Launch config={{ mode: "local" }} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByText("Boot System"));
    expect(screen.getByText("Booting...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("● Running")).toBeInTheDocument());
    expect(onStatusChange).toHaveBeenCalledWith("starting");
    expect(onStatusChange).toHaveBeenCalledWith("running");
    expect(screen.getByText("OmniBioAI Studio is running")).toBeInTheDocument();
    // clicking again while running is a no-op guard
    fireEvent.click(screen.getByText("● Running"));
    expect(window.api.startDocker).toHaveBeenCalledTimes(1);
  });

  it("falls back to a simulated boot with a warning when no Electron API is present", async () => {
    vi.useFakeTimers();
    render(<Launch config={{ mode: "local" }} onStatusChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Boot System"));
    await vi.advanceTimersByTimeAsync(1200);
    await vi.waitFor(() => expect(screen.getByText("Electron API not available — run via: npm run dev")).toBeInTheDocument());
    await vi.waitFor(() => expect(screen.getByText("● Running")).toBeInTheDocument());
  });

  it("surfaces a boot failure and sets error status", async () => {
    window.api = { saveConfig: vi.fn().mockRejectedValue(new Error("disk full")) };
    const onStatusChange = vi.fn();
    render(<Launch config={{ mode: "local" }} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByText("Boot System"));
    await waitFor(() => expect(screen.getByText("Boot failed: disk full")).toBeInTheDocument());
    expect(onStatusChange).toHaveBeenCalledWith("error");
  });

  it("stops the stack via window.api, and simulates a stop without it", async () => {
    window.api = { stopDocker: vi.fn().mockResolvedValue() };
    const onStatusChange = vi.fn();
    render(<Launch config={{ mode: "local" }} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByText("Stop Stack"));
    await waitFor(() => expect(screen.getByText("Stack stopped cleanly")).toBeInTheDocument());
    expect(onStatusChange).toHaveBeenCalledWith("idle");

    cleanup();
    delete window.api;
    vi.useFakeTimers();
    render(<Launch config={{ mode: "local" }} onStatusChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Stop Stack"));
    await vi.advanceTimersByTimeAsync(600);
    await vi.waitFor(() => expect(screen.getByText("Stack stopped cleanly")).toBeInTheDocument());
  });

  it("surfaces a stop failure", async () => {
    window.api = { stopDocker: vi.fn().mockRejectedValue(new Error("timeout")) };
    render(<Launch config={{ mode: "local" }} onStatusChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Stop Stack"));
    await waitFor(() => expect(screen.getByText("Stop failed: timeout")).toBeInTheDocument());
  });

  it("clears the log panel", async () => {
    render(<Launch config={{ mode: "local" }} onStatusChange={vi.fn()} />);
    expect(screen.getByText("Studio initialized — waiting for boot")).toBeInTheDocument();
    fireEvent.click(screen.getByText("CLEAR"));
    expect(screen.queryByText("Studio initialized — waiting for boot")).not.toBeInTheDocument();
  });
});

describe("Launch page — beta mode", () => {
  it("shows the connected-to-cloud badge and polls tunnel URLs, logging state transitions", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation((url) =>
      Promise.resolve(new Response("", { status: String(url).includes("mysql") || String(url).includes("lims") ? 500 : 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<Launch config={{ mode: "beta" }} onStatusChange={vi.fn()} />);
    expect(screen.getByText("Connected to Cloud")).toBeInTheDocument();
    expect(screen.getByText("Connection Events")).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getAllByText("● UP").length).toBeGreaterThan(0));
    expect(screen.getByText("✕ DOWN")).toBeInTheDocument(); // lims/mysql tunnel

    // flip the failing tunnel to healthy on the next poll to trigger a transition log
    fetchMock.mockImplementation(() => Promise.resolve(new Response("", { status: 200 })));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(screen.getAllByText(/tunnel — reachable/).length).toBeGreaterThan(0));

    fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(screen.getAllByText(/tunnel — unreachable/).length).toBeGreaterThan(0));
  });
});
