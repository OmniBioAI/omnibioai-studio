import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountHelp from "../../src/ui/pages/AccountHelp";

afterEach(() => { cleanup(); delete window.api; });

describe("AccountHelp", () => {
  it("renders only verified destinations, never a Download apps or Support row", () => {
    render(<AccountHelp />);
    expect(screen.getByRole("heading", { name: "Help & Product" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Documentation/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Release notes/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Source code/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /OmniBioAI \(opens/ })).toBeInTheDocument();
    expect(screen.queryByText(/Download/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Support/i)).not.toBeInTheDocument();
  });

  it("opens destinations via the browser-safe window.open fallback outside Electron", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => {});
    render(<AccountHelp />);
    fireEvent.click(screen.getByRole("button", { name: /Documentation/ }));
    expect(openSpy).toHaveBeenCalledWith("https://docs.omnibioai.org", "_blank", "noopener,noreferrer");
    openSpy.mockRestore();
  });

  it("opens destinations via the Electron bridge when present, never window.open", () => {
    const electronOpen = vi.fn();
    window.api = { openExternal: electronOpen };
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => {});
    render(<AccountHelp />);
    fireEvent.click(screen.getByRole("button", { name: /Release notes/ }));
    expect(electronOpen).toHaveBeenCalledWith("https://github.com/OmniBioAI/omnibioai-studio/releases");
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
