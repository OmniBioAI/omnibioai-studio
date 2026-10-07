import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("../../src/ui/lib/session", () => ({ logout }));

import OmniBioAILogo from "../../src/ui/components/brand/OmniBioAILogo";
import Sidebar from "../../src/ui/components/Sidebar";
import MobileNav from "../../src/ui/components/MobileNav";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("canonical OmniBioAI identity", () => {
  it.each(["mark", "full", "wordmark"])("renders the %s variant from its canonical asset", (variant) => {
    const { container } = render(<OmniBioAILogo variant={variant} size="sm" />);
    const logo = container.querySelector(`[data-omnibioai-logo="${variant}"]`);
    expect(logo).toHaveAttribute("aria-hidden", "true");
    expect(logo.querySelector("img").getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  });

  it("announces linked or semantic identity once and keeps its inner artwork decorative", () => {
    const { container } = render(<OmniBioAILogo variant="full" label="OmniBioAI" />);
    const identity = screen.getByRole("img", { name: "OmniBioAI" });
    expect(identity).toHaveAttribute("data-omnibioai-logo", "full");
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(container.querySelector("img")).toHaveAttribute("aria-hidden", "true");
  });

  it("uses the canonical logo in desktop and mobile shells", () => {
    const nav = [{ section: "AI", items: [{ name: "Ask OmniBioAI", idx: -1 }] }];
    const desktop = render(<Sidebar nav={nav} step={7} setStep={vi.fn()} systemStatus="idle" currentUser={null} />);
    expect(desktop.getByRole("img", { name: "OmniBioAI" })).toHaveAttribute("data-omnibioai-logo", "full");
    const ask = desktop.container.querySelector('[data-nav-item="Ask OmniBioAI"]');
    expect(ask.querySelector("svg")).toBeInTheDocument();
    expect(ask.querySelector("[data-omnibioai-logo]")).not.toBeInTheDocument();
    desktop.unmount();

    const mobile = render(<MobileNav nav={nav} step={7} setStep={vi.fn()} currentUser={null} open onClose={vi.fn()} />);
    expect(mobile.getByRole("img", { name: "OmniBioAI" })).toHaveAttribute("data-omnibioai-logo", "full");
  });
});
