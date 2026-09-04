import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BugReport from "../../src/ui/components/BugReport";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("BugReport", () => {
  it("opens and closes the dialog without submitting", () => {
    render(<BugReport />);
    fireEvent.click(screen.getByRole("button", { name: /report bug/i }));
    expect(screen.getByText("🐛 Report a Bug")).toBeInTheDocument();
    fireEvent.click(screen.getByText("✕"));
    expect(screen.queryByText("🐛 Report a Bug")).not.toBeInTheDocument();
  });

  it("disables submit until both title and description are filled, and accepts email and severity", () => {
    render(<BugReport />);
    fireEvent.click(screen.getByRole("button", { name: /report bug/i }));
    const submit = screen.getByRole("button", { name: /submit bug report/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Bug title"), { target: { value: "Crash" } });
    expect(submit).toBeDisabled(); // description still empty

    fireEvent.change(screen.getByPlaceholderText("Describe what happened..."), { target: { value: "It crashed" } });
    expect(submit).not.toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Your email (optional)"), { target: { value: "a@b.test" } });
    fireEvent.change(screen.getByDisplayValue("🟡 Medium - Affects workflow"), { target: { value: "fatal" } });
  });

  it("submits, shows confirmation, and resets the form after the timeout", async () => {
    vi.useFakeTimers();
    render(<BugReport />);
    fireEvent.click(screen.getByRole("button", { name: /report bug/i }));
    fireEvent.change(screen.getByPlaceholderText("Bug title"), { target: { value: "Oops" } });
    fireEvent.change(screen.getByPlaceholderText("Describe what happened..."), { target: { value: "details" } });
    fireEvent.click(screen.getByRole("button", { name: /submit bug report/i }));
    expect(screen.getByText(/bug reported/i)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.queryByText("🐛 Report a Bug")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /report bug/i }));
    expect(screen.getByPlaceholderText("Bug title")).toHaveValue("");
  });
});
