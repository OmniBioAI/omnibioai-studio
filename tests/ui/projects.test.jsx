import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Projects from "../../src/ui/pages/Projects";

afterEach(() => cleanup());

describe("Projects page", () => {
  it("renders a heading, truthful unavailable copy, and a genuinely disabled Create project button", () => {
    render(<Projects />);
    expect(screen.getByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByText(/not yet available/i)).toBeInTheDocument();
    const createButton = screen.getByRole("button", { name: "Create project" });
    expect(createButton).toBeDisabled();
  });

  it("contains no fake project data, counts or persisted state", () => {
    render(<Projects />);
    const text = document.body.textContent;
    expect(text).not.toMatch(/\b\d+\s*projects?\b/i);
    expect(text).not.toMatch(/collaborators?/i);
    expect(text).not.toMatch(/storage used/i);
    expect(window.localStorage.length).toBe(0);
  });
});
