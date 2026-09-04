import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Logs from "../../src/ui/pages/Logs";

beforeEach(() => { delete window.api; });
afterEach(() => { cleanup(); vi.useRealTimers(); delete window.api; });

describe("Logs page", () => {
  it("renders the demo log stream, filters by source and search text, and clears it", () => {
    render(<Logs />);
    expect(screen.getByText(/Log Stream — 7 entries/)).toBeInTheDocument();
    expect(screen.getByText("● STREAMING")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "mysql" }));
    expect(screen.getByText(/Log Stream — 1 entries/)).toBeInTheDocument();
    expect(screen.getByText("MySQL ready on port 3306")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "all" }));
    fireEvent.change(screen.getByPlaceholderText("search logs..."), { target: { value: "toolserver ready" } });
    expect(screen.getByText(/Log Stream — 1 entries/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("search logs..."), { target: { value: "nothing matches this" } });
    expect(screen.getByText("No log entries match current filter.")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("search logs..."), { target: { value: "" } });
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByText("No log entries match current filter.")).toBeInTheDocument();
  });

  it("toggles pause/resume and highlights a row on hover", () => {
    render(<Logs />);
    const row = screen.getByText("MySQL ready on port 3306").closest("div.studio-log-row");
    fireEvent.mouseEnter(row);
    expect(row.style.background).toBe("rgba(255, 255, 255, 0.02)");
    fireEvent.mouseLeave(row);
    expect(row.style.background).toBe("transparent");

    fireEvent.click(screen.getByText("⏸ Pause"));
    expect(screen.getByText("▶ Resume")).toBeInTheDocument();
    expect(screen.getByText("⏸ PAUSED")).toBeInTheDocument();
    fireEvent.click(screen.getByText("▶ Resume"));
    expect(screen.getByText("⏸ Pause")).toBeInTheDocument();
  });

  it("focuses and blurs the search box", () => {
    render(<Logs />);
    const input = screen.getByPlaceholderText("search logs...");
    fireEvent.focus(input);
    expect(input.style.borderColor).toBe("rgba(0, 229, 160, 0.4)");
    fireEvent.blur(input);
    expect(input.style.borderColor).toBe("var(--border2)");
  });

  it("streams lines from window.api.streamLogs and skips them while paused", async () => {
    let onLine;
    window.api = { streamLogs: vi.fn((cb) => { onLine = cb; }) };
    render(<Logs />);
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    onLine("container started");
    await waitFor(() => expect(screen.getByText("container started")).toBeInTheDocument());

    fireEvent.click(screen.getByText("⏸ Pause"));
    onLine("should be dropped");
    expect(screen.queryByText("should be dropped")).not.toBeInTheDocument();
  });

  it("simulates dev-mode log growth on an interval, cycling messages, and pausing it", async () => {
    vi.useFakeTimers();
    render(<Logs />);
    expect(screen.queryByText("LIVE")).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2500 * 7); // one full cycle of the 6 demo messages + 1 more
    expect(screen.getByText(/Log Stream — 1[0-9] entries/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("⏸ Pause"));
    const before = screen.getByText(/Log Stream — /).textContent;
    await vi.advanceTimersByTimeAsync(2500 * 3);
    expect(screen.getByText(/Log Stream — /).textContent).toBe(before);
  });
});
