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

  it("shows the caught error's message", () => {
    render(<ErrorBoundary><ThrowsWithMessage /></ErrorBoundary>);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("falls back to the stringified error with no message, and reloads on click", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, writable: true, configurable: true });
    render(<ErrorBoundary><ThrowsBare /></ErrorBoundary>);
    expect(screen.getByText("Error")).toBeInTheDocument(); // String(new Error())
    fireEvent.click(screen.getByText("Reload"));
    expect(reload).toHaveBeenCalled();
  });
});
