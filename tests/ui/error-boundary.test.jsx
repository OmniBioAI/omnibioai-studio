import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "../../src/ui/components/ErrorBoundary";

function ThrowsWithMessage() { throw new Error("boom"); }
function ThrowsBare() { throw new Error(); }

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(<ErrorBoundary><div>fine</div></ErrorBoundary>);
    expect(screen.getByText("fine")).toBeInTheDocument();
  });

  it("shows a fixed recovery message without exposing the caught exception", () => {
    render(<ErrorBoundary><ThrowsWithMessage /></ErrorBoundary>);
    expect(screen.getByText("Something went wrong on this page")).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Studio" })).toBeInTheDocument();
  });

  it("does not reveal a stringified error without a message", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, writable: true, configurable: true });
    render(<ErrorBoundary><ThrowsBare /></ErrorBoundary>);
    expect(screen.queryByText("Error", { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Reload"));
    expect(reload).toHaveBeenCalled();
    reload.mockClear();
    fireEvent.click(screen.getByText("Back to Studio"));
    expect(reload).toHaveBeenCalled();
  });
});
