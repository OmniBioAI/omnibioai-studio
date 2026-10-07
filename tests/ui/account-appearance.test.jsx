import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AccountAppearance from "../../src/ui/pages/AccountAppearance";
import AppearanceProvider from "../../src/ui/components/AppearanceProvider";

afterEach(() => { cleanup(); document.documentElement.removeAttribute("data-theme"); document.documentElement.removeAttribute("data-accent"); document.documentElement.removeAttribute("data-density"); document.documentElement.removeAttribute("data-motion"); });

function renderPage(userId = 1) {
  return render(<AppearanceProvider userId={userId}><AccountAppearance /></AppearanceProvider>);
}

describe("AccountAppearance", () => {
  it("renders the heading, a live preview and every control group", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Appearance", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/never change how the AI responds/)).toBeInTheDocument();
    expect(screen.getByText("RNA-seq workflow")).toBeInTheDocument();
    expect(screen.getByText(/Preview only/)).toBeInTheDocument();
    expect(document.querySelector('[data-omnibioai-logo="full"]')).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("radiogroup", { name: "Color mode" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Accent color" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Workspace density" })).toBeInTheDocument();
    expect(screen.getByText("Reduce motion")).toBeInTheDocument();
  });

  it("defaults to System / Teal / Comfortable with correct aria-checked state", () => {
    renderPage();
    expect(screen.getByRole("radio", { name: /System/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Teal (default)" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /^Comfortable/ })).toHaveAttribute("aria-checked", "true");
  });

  it("switches color mode by click and updates the document immediately", () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /System/ })).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("navigates the color-mode radiogroup with arrow keys", () => {
    renderPage();
    const group = screen.getByRole("radiogroup", { name: "Color mode" });
    const system = screen.getByRole("radio", { name: /System/ });
    system.focus();
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Light" })).toHaveFocus();
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(screen.getByRole("radio", { name: /System/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(group, { key: "Tab" });
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  });

  it("selects an accent, marks it checked and does not rely on color alone (a visible check mark)", () => {
    renderPage();
    const blue = screen.getByRole("radio", { name: "Blue" });
    fireEvent.click(blue);
    expect(blue).toHaveAttribute("aria-checked", "true");
    expect(blue.querySelector(".appearance-swatch-check")).toBeInTheDocument();
    expect(document.documentElement.dataset.accent).toBe("blue");
  });

  it("selects workspace density", () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: /^Compact/ }));
    expect(screen.getByRole("radio", { name: /^Compact/ })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.density).toBe("compact");
  });

  it("toggles reduced motion and reflects it on the document element", () => {
    renderPage();
    // ToggleRow renders a plain <button class="toggle"> with no accessible name; select it via its row label context.
    const row = screen.getByText("Reduce motion").closest("div").parentElement;
    const button = row.querySelector("button.toggle");
    expect(button).toHaveClass("off");
    fireEvent.click(button);
    expect(document.documentElement.dataset.motion).toBe("reduce");
    fireEvent.click(button);
    expect(document.documentElement.dataset.motion).toBe("system");
  });

  it("persists the live preview caption text naming the selected accent", () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Purple" }));
    expect(screen.getByText(/the purple accent/)).toBeInTheDocument();
  });
});
