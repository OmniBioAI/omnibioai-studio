import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Explore from "../../src/ui/pages/Explore";

afterEach(() => cleanup());

describe("Explore page", () => {
  it("renders a heading and truthful unavailable copy, with no discovery backend call", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<Explore />);
    expect(screen.getByRole("heading", { name: "Explore" })).toBeInTheDocument();
    expect(screen.getByText(/being prepared/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does not duplicate Studio's module catalog (no module/category cards or counts)", () => {
    render(<Explore />);
    const text = document.body.textContent;
    for (const studioOnlyTerm of ["Platform Services", "Security Control Plane", "Core Platform", "Omics Analysis", "AI & Intelligence", "Open Catalog", "Launch Workbench"]) {
      expect(text).not.toContain(studioOnlyTerm);
    }
  });
});
