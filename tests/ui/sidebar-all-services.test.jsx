import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
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

// The pinned bottom block below the scrolling nav list, in document order.
function pinnedItems(container) {
  return [...container.querySelectorAll(".studio-settings-entry [data-nav-item]")];
}

describe.each([
  ["sidebar", (props) => <Sidebar systemStatus="idle" {...props} />],
  ["mobile drawer", (props) => <MobileNav open onClose={vi.fn()} {...props} />],
])("All services pinned above Settings in the %s", (_, renderNav) => {
  it.each([["member", MEMBER], ["admin", ADMIN]])("sits directly above Settings, outside DISCOVER, for a %s", (__, user) => {
    const { container } = render(renderNav({ nav: buildNav(user), step: 7, setStep: vi.fn(), currentUser: user }));
    expect(pinnedItems(container).map(item => item.getAttribute("data-nav-item"))).toEqual(["All services", "Settings"]);
    expect(container.querySelector("nav [data-nav-item='All services']")).toBeNull();
    const discover = container.querySelector('[data-nav-section="DISCOVER"]');
    expect([...discover.querySelectorAll("[data-nav-item]")].map(item => item.getAttribute("data-nav-item"))).toEqual([
      "Explore", "Plugins and integrations", "Omics and analysis", "Agentic",
    ]);
  });

  it("opens the /studio/services page and is active only on it", () => {
    const setStep = vi.fn();
    const { container, rerender } = render(renderNav({ nav: buildNav(MEMBER), step: 7, setStep, currentUser: MEMBER }));
    const item = () => container.querySelector('.studio-settings-entry [data-nav-item="All services"]');
    expect(item().tagName).toBe("BUTTON");
    expect(item()).not.toHaveAttribute("aria-current");
    fireEvent.click(item());
    expect(setStep).toHaveBeenCalledWith(ALL_SERVICES_PAGE);
    expect(pathForStudioPage(ALL_SERVICES_PAGE)).toBe("/studio/services");
    expect(resolveStudioLocation({ pathname: "/studio/services", origin: "http://localhost" }).page).toBe(ALL_SERVICES_PAGE);

    rerender(renderNav({ nav: buildNav(MEMBER), step: ALL_SERVICES_PAGE, setStep, currentUser: MEMBER }));
    expect(item()).toHaveAttribute("aria-current", "page");
    expect(container.querySelector('.studio-settings-entry [data-nav-item="Settings"]')).not.toHaveAttribute("aria-current");
  });

  it("uses the layout-grid icon", () => {
    const { container } = render(renderNav({ nav: buildNav(MEMBER), step: 7, setStep: vi.fn(), currentUser: MEMBER }));
    expect(NAV_ICONS["All services"]).toBeDefined();
    const icon = container.querySelector('.studio-settings-entry [data-nav-item="All services"] svg');
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon.querySelectorAll("rect")).toHaveLength(4);
  });
});

it("closes the mobile drawer after opening All services", () => {
  const setStep = vi.fn();
  const onClose = vi.fn();
  const { container } = render(<MobileNav nav={buildNav(MEMBER)} step={7} setStep={setStep} currentUser={MEMBER} open onClose={onClose} />);
  fireEvent.click(container.querySelector('.studio-settings-entry [data-nav-item="All services"]'));
  expect(setStep).toHaveBeenCalledWith(ALL_SERVICES_PAGE);
  expect(onClose).toHaveBeenCalled();
});
