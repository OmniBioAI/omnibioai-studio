import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "../../src/ui/pages/Settings";

beforeEach(() => {
  window.api = {};
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue() }, configurable: true });
});
afterEach(() => { cleanup(); delete window.api; vi.restoreAllMocks(); });

function exerciseInputsAndToggles(container) {
  container.querySelectorAll('input[type="text"], input:not([type])').forEach((el) => {
    fireEvent.change(el, { target: { value: `${el.value}x` } });
  });
  container.querySelectorAll("select").forEach((el) => {
    const opts = Array.from(el.options).map((o) => o.value);
    fireEvent.change(el, { target: { value: opts[opts.length - 1] } });
  });
  container.querySelectorAll("button.toggle").forEach((el) => fireEvent.click(el));
}

describe("Settings page", () => {
  it("loads saved settings on mount when window.api is available", async () => {
    window.api.loadConfig = vi.fn().mockResolvedValue({ settings: { host_ip: "10.0.0.5" } });
    render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);
    await waitFor(() => expect(screen.getByDisplayValue("10.0.0.5")).toBeInTheDocument());
  });

  it("skips loading when window.api or its settings are absent", async () => {
    render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);

    window.api = { loadConfig: vi.fn().mockResolvedValue({}) };
    cleanup();
    render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);
    await waitFor(() => expect(window.api.loadConfig).toHaveBeenCalled());
  });

  it("shows the first-run banner until both data and work dirs are set", () => {
    const { container } = render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);
    expect(screen.getByText(/First time setup/)).toBeInTheDocument();
    const [dataDir, workDir] = [
      screen.getByPlaceholderText("/home/username/omnibioai/data"),
      screen.getByPlaceholderText("/home/username/omnibioai/work"),
    ];
    fireEvent.change(dataDir, { target: { value: "/d" } });
    fireEvent.change(workDir, { target: { value: "/w" } });
    expect(screen.queryByText(/First time setup/)).not.toBeInTheDocument();
    void container;
  });

  it("fills default paths, using Windows-style paths when navigator.platform says Win", () => {
    render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);
    fireEvent.click(screen.getByText("Use defaults"));
    expect(screen.getByDisplayValue(/\/home\/omnibioai\/data/)).toBeInTheDocument();

    const platformSpy = vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    cleanup();
    render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);
    fireEvent.click(screen.getByText("Use defaults"));
    expect(screen.getByDisplayValue("C:\\Users/omnibioai/data")).toBeInTheDocument();
    platformSpy.mockRestore();
  });

  it("derives OmniBioAI defaults from an existing work_dir, or a home/user fallback", () => {
    render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);
    fireEvent.change(screen.getByPlaceholderText("/home/username/omnibioai/work"), { target: { value: "/x/y/work" } });
    fireEvent.click(screen.getByText("Use OmniBioAI defaults"));
    expect(screen.getByDisplayValue("/x/y/data")).toBeInTheDocument();

    cleanup();
    window.api.username = "alice";
    render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);
    fireEvent.click(screen.getByText("Use OmniBioAI defaults"));
    expect(screen.getByDisplayValue("/home/alice/Desktop/machine/omnibioai/data")).toBeInTheDocument();

    cleanup();
    delete window.api.username; // window.api present but no username -> "user" fallback
    render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);
    fireEvent.click(screen.getByText("Use OmniBioAI defaults"));
    expect(screen.getByDisplayValue("/home/user/Desktop/machine/omnibioai/data")).toBeInTheDocument();

    const platformSpy = vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    cleanup();
    render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);
    fireEvent.click(screen.getByText("Use OmniBioAI defaults"));
    expect(screen.getByDisplayValue("C:\\Users\\omnibioai/data")).toBeInTheDocument();
    platformSpy.mockRestore();
  });

  it("exercises every general/port/docker field and toggle", () => {
    const { container } = render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);
    exerciseInputsAndToggles(container);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("saves settings via window.api, calls setConfig, and shows the saved indicator", async () => {
    window.api.saveConfig = vi.fn().mockResolvedValue();
    const setConfig = vi.fn();
    render(<Settings config={{ mode: "local" }} setConfig={setConfig} currentUser={null} />);
    fireEvent.click(screen.getByText("Save Settings"));
    await waitFor(() => expect(window.api.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ mode: "local" })));
    expect(setConfig).toHaveBeenCalled();
    expect(await screen.findByText("✓ Saved")).toBeInTheDocument();
  });

  it("saves without window.api.saveConfig or setConfig present", async () => {
    render(<Settings config={{}} setConfig={null} currentUser={null} />);
    fireEvent.click(screen.getByText("Save Settings"));
    expect(await screen.findByText("✓ Saved")).toBeInTheDocument();
  });

  it("resets via window.api.resetConfig and reloads, or just reloads without it", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, writable: true, configurable: true });
    window.api.resetConfig = vi.fn().mockResolvedValue();
    render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);
    fireEvent.click(screen.getByText("Reset All"));
    await waitFor(() => expect(window.api.resetConfig).toHaveBeenCalled());
    expect(reload).toHaveBeenCalled();

    reload.mockClear();
    delete window.api.resetConfig;
    fireEvent.click(screen.getByText("Reset All"));
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("shows and hides credentials, copying each value including the shortened auth secret", async () => {
    window.api.getCredentials = vi.fn().mockResolvedValue({
      grafanaPassword: "gpass", authSecretKey: "abcdefghijklmnop", envPath: "/opt/.env",
      // mysqlPassword/jupyterToken/rstudioPassword/vscodePassword intentionally absent -> "—"
    });
    render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);
    fireEvent.click(screen.getByText("Show Credentials"));
    expect(await screen.findByText("Stored at: /opt/.env")).toBeInTheDocument();
    expect(screen.getByText("abcdefgh••••••••••••••••••••••••")).toBeInTheDocument();
    expect(screen.getByText("gpass")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText("Copy")[0]);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("gpass"));
    expect(await screen.findByText("✓ Copied")).toBeInTheDocument();

    // the grafanaPassword button above now reads "✓ Copied", so the first
    // remaining "Copy" button is mysqlPassword's (value absent -> copies '').
    fireEvent.click(screen.getAllByText("Copy")[0]);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(""));

    fireEvent.click(screen.getByText("Hide"));
    expect(screen.queryByText("Stored at: /opt/.env")).not.toBeInTheDocument();
  });

  it("no-ops Show Credentials when window.api.getCredentials is unavailable", () => {
    render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);
    fireEvent.click(screen.getByText("Show Credentials"));
    expect(screen.getByText("Show Credentials")).toBeInTheDocument();
  });

  it("reverts the saved and copied indicators after their timeouts elapse", async () => {
    vi.useFakeTimers();
    window.api.saveConfig = vi.fn().mockResolvedValue();
    window.api.getCredentials = vi.fn().mockResolvedValue({ grafanaPassword: "gpass" });
    render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);

    fireEvent.click(screen.getByText("Save Settings"));
    await vi.waitFor(() => expect(screen.getByText("✓ Saved")).toBeInTheDocument());
    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByText("Save Settings")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Show Credentials"));
    await vi.waitFor(() => expect(screen.getAllByText("Copy").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText("Copy")[0]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(screen.getAllByText("Copy").length).toBeGreaterThan(0);
  });

  it("opens external links via window.api.openExternal, or window.open as a fallback", () => {
    window.api.openExternal = vi.fn();
    render(<Settings config={{}} setConfig={vi.fn()} currentUser={null} />);
    fireEvent.click(screen.getByText("Docs ↗"));
    expect(window.api.openExternal).toHaveBeenCalledWith("https://docs.omnibioai.org");

    delete window.api.openExternal;
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => {});
    fireEvent.click(screen.getByText("GitHub ↗"));
    expect(openSpy).toHaveBeenCalledWith("https://github.com/OmniBioAI/omnibioai-studio", "_blank", "noopener,noreferrer");
  });
});
