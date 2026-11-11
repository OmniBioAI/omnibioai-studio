import React from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildNav } from "../../src/ui/App";
import Sidebar from "../../src/ui/components/Sidebar";
import MobileNav from "../../src/ui/components/MobileNav";
import { NAV_ICONS } from "../../src/ui/components/NavIcons";
import { pathForStudioPage, resolveStudioLocation } from "../../src/ui/lib/studioRouter";

const ALL_SERVICES_PAGE = 40;
const MEMBER = { email: "member@example.org", permissions: [] };
const ADMIN = { email: "ops@example.org", permissions: ["platform.manage_infra", "manage_config", "manage_roles"] };

afterEach(cleanup);

function discoverItems(container) {
  const discover = container.querySelector('[data-nav-section="DISCOVER"]');
  return [...discover.querySelectorAll("[data-nav-item]")];
}

describe("All services in the DISCOVER navigation", () => {
  it.each([["member", MEMBER], ["admin", ADMIN]])("is the last DISCOVER item for a %s", (_, user) => {
    const { container } = render(<Sidebar nav={buildNav(user)} step={7} setStep={vi.fn()} systemStatus="idle" currentUser={user} />);
    expect(discoverItems(container).map(item => item.textContent.trim())).toEqual([
      "Explore", "Plugins and integrations", "Omics and analysis", "Agentic", "All services",
    ]);
  });

  it("opens the /studio/services page and is active only on it", () => {
    const setStep = vi.fn();
    const { container, rerender } = render(<Sidebar nav={buildNav(MEMBER)} step={7} setStep={setStep} systemStatus="idle" currentUser={MEMBER} />);
    const item = container.querySelector('[data-nav-item="All services"]');
    expect(item.tagName).toBe("BUTTON");
    expect(item).not.toHaveAttribute("aria-current");
    fireEvent.click(item);
    expect(setStep).toHaveBeenCalledWith(ALL_SERVICES_PAGE);
    expect(pathForStudioPage(ALL_SERVICES_PAGE)).toBe("/studio/services");
    expect(resolveStudioLocation({ pathname: "/studio/services", origin: "http://localhost" }).page).toBe(ALL_SERVICES_PAGE);

    rerender(<Sidebar nav={buildNav(MEMBER)} step={ALL_SERVICES_PAGE} setStep={setStep} systemStatus="idle" currentUser={MEMBER} />);
    expect(container.querySelector('[data-nav-item="All services"]')).toHaveAttribute("aria-current", "page");
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it("uses the layout-grid icon like the other items", () => {
    const { container } = render(<Sidebar nav={buildNav(MEMBER)} step={7} setStep={vi.fn()} systemStatus="idle" currentUser={MEMBER} />);
    expect(NAV_ICONS["All services"]).toBeDefined();
    const icon = container.querySelector('[data-nav-item="All services"] svg');
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon.querySelectorAll("rect")).toHaveLength(4);
  });

  it("appears in the mobile drawer, navigates and closes it", () => {
    const setStep = vi.fn();
    const onClose = vi.fn();
    const { container } = render(<MobileNav nav={buildNav(MEMBER)} step={ALL_SERVICES_PAGE} setStep={setStep} currentUser={MEMBER} open onClose={onClose} />);
    const items = discoverItems(container);
    expect(items.at(-1).textContent.trim()).toBe("All services");
    // The drawer marks the active item by style only (no aria-current on any item).
    expect(items.at(-1).style.color).toBe("var(--accent)");
    expect(items.slice(0, -1).map(item => item.style.color)).toEqual(Array(4).fill("var(--text)"));
    fireEvent.click(within(container.querySelector('[data-nav-section="DISCOVER"]')).getByText("All services"));
    expect(setStep).toHaveBeenCalledWith(ALL_SERVICES_PAGE);
    expect(onClose).toHaveBeenCalled();
  });
});
