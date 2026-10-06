import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Artifacts from "../../src/ui/pages/Artifacts";

afterEach(() => cleanup());

describe("Artifacts page", () => {
  it("renders a heading and truthful unavailable copy, with no backend call", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<Artifacts />);
    expect(screen.getByRole("heading", { name: "Artifacts" })).toBeInTheDocument();
    expect(screen.getByText(/not yet available/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("contains no fake artifact rows, counts, provenance or download buttons", () => {
    render(<Artifacts />);
    const text = document.body.textContent;
    expect(text).not.toMatch(/\b\d+\s*artifacts?\b/i);
    expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
