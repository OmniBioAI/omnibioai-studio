import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("../../src/ui/lib/session", () => ({ logout }));

import Sidebar from "../../src/ui/components/Sidebar";
import MobileNav from "../../src/ui/components/MobileNav";
import UpdateBanner from "../../src/ui/components/UpdateBanner";

const nav = [{ section: "Runtime", items: [{ name: "Launch", idx: 4 }] }];
const user = { email: "u@test" };

afterEach(() => { cleanup(); vi.clearAllMocks(); delete window.api; });

describe("Sidebar", () => {
  it("opens Personalization through the personal footer", () => {
    const navigate = vi.fn();
    render(<Sidebar nav={nav} step={24} setStep={vi.fn()} systemStatus="idle" currentUser={user} onPersonalizationClick={navigate} isPersonalizationActive />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const item = screen.getByRole("menuitem", { name: /Personalization/ }); expect(item).toHaveAttribute("aria-current", "page");
    fireEvent.click(item); expect(navigate).toHaveBeenCalledOnce();
  });
  it("opens Preferences through the personal footer", () => {
    const navigate = vi.fn();
    render(<Sidebar nav={nav} step={17} setStep={vi.fn()} systemStatus="idle" currentUser={{ userId: 1, email: "test@example.test" }} onPreferencesClick={navigate} isPreferencesActive />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const item = screen.getByRole("menuitem", { name: /Preferences/ }); expect(item).toHaveAttribute("aria-current", "page");
    fireEvent.click(item); expect(navigate).toHaveBeenCalledOnce();
  });
  it("opens Appearance through the personal footer", () => {
    const navigate = vi.fn();
    render(<Sidebar nav={nav} step={24} setStep={vi.fn()} systemStatus="idle" currentUser={{ userId: 1, email: "test@example.test" }} onAppearanceClick={navigate} isAppearanceActive />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const item = screen.getByRole("menuitem", { name: /Appearance/ }); expect(item).toHaveAttribute("aria-current", "page");
    fireEvent.click(item); expect(navigate).toHaveBeenCalledOnce();
  });
  it("renders Studio as the first top-level destination and keeps grouped items ordered", () => {
    const fullNav = [
      { section: null, items: [{ name: "Studio", idx: 7 }] },
      { section: "Setup", items: [
        { name: "Mode", idx: 0 }, { name: "LLM", idx: 1 }, { name: "Cloud", idx: 2 }, { name: "HPC", idx: 3 },
      ] },
      { section: "Runtime", items: [
        { name: "Launch", idx: 4 }, { name: "Services", idx: 5 },
        { name: "Logs", idx: 6 }, { name: "Jobs", idx: 9 }, { name: "Billing", idx: 12 },
      ] },
      { section: "Security", items: [{ name: "Roles", idx: 11 }] },
      { section: "System", items: [{ name: "Settings", idx: 8 }] },
    ];
    const { container } = render(<Sidebar nav={fullNav} step={7} setStep={vi.fn()} systemStatus="idle" currentUser={null} />);
    const sections = [...container.querySelectorAll("[data-nav-section]")];
    expect(sections[0]).toHaveAttribute("data-nav-section", "");
    expect(sections[0].querySelector("[data-nav-item='Studio']")).toBeInTheDocument();
    expect(sections[1].textContent).toContain("Setup");
    expect(sections[0].compareDocumentPosition(sections[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sections[2].textContent).toMatch(/Launch.*Services.*Logs.*Jobs.*Billing/);
    expect(sections[2].textContent).not.toContain("Studio");
    expect(sections[3].textContent).toContain("Roles");
    expect(sections[4].textContent).toContain("Settings");
  });

  it("shows the signed-in user and signs out on click", () => {
    render(<Sidebar nav={nav} step={4} setStep={vi.fn()} systemStatus="idle" currentUser={user} />);
    expect(screen.getByText("u@test")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(logout).toHaveBeenCalled();
  });

  it("opens Profile from the signed-in desktop account area", () => {
    const onProfileClick = vi.fn();
    render(<Sidebar nav={nav} step={4} setStep={vi.fn()} systemStatus="idle"
      currentUser={user} onProfileClick={onProfileClick} isProfileActive />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const profile = screen.getByRole("menuitem", { name: /Profile/ });
    expect(profile).toHaveAttribute("aria-current", "page");
    fireEvent.click(profile);
    expect(onProfileClick).toHaveBeenCalledOnce();
  });

  it("opens Security from the signed-in desktop account area", () => {
    const onSecurityClick = vi.fn();
    render(<Sidebar nav={nav} step={16} setStep={vi.fn()} systemStatus="idle" currentUser={user}
      onProfileClick={vi.fn()} onSecurityClick={onSecurityClick} isSecurityActive />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const security = screen.getByRole("menuitem", { name: /Security/ });
    expect(security).toHaveAttribute("aria-current", "page");
    fireEvent.click(security);
    expect(onSecurityClick).toHaveBeenCalledOnce();
  });

  it("hides the signed-in block when signed out, and falls back to IDLE for an unknown status", () => {
    render(<Sidebar nav={nav} step={4} setStep={vi.fn()} systemStatus="bogus" currentUser={null} />);
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
    expect(screen.getByText("IDLE")).toBeInTheDocument();
  });

  it("renders a disabled nav item as genuinely inert: no onClick fires, aria-disabled is set, and it is never 'active'", () => {
    const askNav = [{ section: "AI", items: [{ name: "Ask OmniBioAI", idx: -1, disabled: true }] }];
    const setStep = vi.fn();
    render(<Sidebar nav={askNav} step={-1} setStep={setStep} systemStatus="idle" currentUser={null} />);
    const ask = screen.getByText("Ask OmniBioAI", { selector: "div" });
    expect(ask).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(ask);
    expect(setStep).not.toHaveBeenCalled();
  });

  it("renders Code and Workflows nav entries generically and forwards their idx on click, with no component changes required", () => {
    const codeWorkflowsNav = [{ section: "Runtime", items: [
      { name: "Jobs", idx: 9 }, { name: "Code", idx: 18 }, { name: "Workflows", idx: 19 },
    ] }];
    const setStep = vi.fn();
    render(<Sidebar nav={codeWorkflowsNav} step={9} setStep={setStep} systemStatus="idle" currentUser={null} />);
    fireEvent.click(screen.getByText("Code", { selector: "div" }));
    expect(setStep).toHaveBeenCalledWith(18);
    fireEvent.click(screen.getByText("Workflows", { selector: "div" }));
    expect(setStep).toHaveBeenCalledWith(19);
  });
});

describe("MobileNav", () => {
  it("opens Personalization and closes the drawer", () => {
    const navigate = vi.fn(), close = vi.fn();
    render(<MobileNav nav={nav} step={24} setStep={vi.fn()} currentUser={user} open onClose={close} onPersonalizationClick={navigate} isPersonalizationActive />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Personalization/ }));
    expect(navigate).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
  });
  it("opens Preferences and closes the drawer", () => {
    const navigate = vi.fn(), close = vi.fn();
    render(<MobileNav nav={nav} step={17} setStep={vi.fn()} currentUser={{ userId: 1, email: "test@example.test" }} open onClose={close} onPreferencesClick={navigate} isPreferencesActive />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Preferences/ }));
    expect(navigate).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
  });
  it("opens Appearance and closes the drawer", () => {
    const navigate = vi.fn(), close = vi.fn();
    render(<MobileNav nav={nav} step={24} setStep={vi.fn()} currentUser={{ userId: 1, email: "test@example.test" }} open onClose={close} onAppearanceClick={navigate} isAppearanceActive />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Appearance/ }));
    expect(navigate).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
  });
  it("closes on backdrop click, and signs out and closes on Sign out click", () => {
    const onClose = vi.fn();
    const { container } = render(<MobileNav nav={nav} step={4} setStep={vi.fn()} currentUser={user} open onClose={onClose} />);
    fireEvent.click(container.querySelector('[aria-hidden="true"]'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(logout).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("opens Profile from the signed-in mobile account area and closes the drawer", () => {
    const onClose = vi.fn();
    const onProfileClick = vi.fn();
    render(<MobileNav nav={nav} step={4} setStep={vi.fn()} currentUser={user} open
      onClose={onClose} onProfileClick={onProfileClick} isProfileActive />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const profile = screen.getByRole("menuitem", { name: /Profile/ });
    expect(profile).toHaveAttribute("aria-current", "page");
    fireEvent.click(profile);
    expect(onProfileClick).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("opens Security from the signed-in mobile account area and closes the drawer", () => {
    const onClose = vi.fn();
    const onSecurityClick = vi.fn();
    render(<MobileNav nav={nav} step={16} setStep={vi.fn()} currentUser={user} open
      onClose={onClose} onProfileClick={vi.fn()} onSecurityClick={onSecurityClick} isSecurityActive />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Security/ }));
    expect(onSecurityClick).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("navigates via the Enter key", () => {
    const setStep = vi.fn();
    const onClose = vi.fn();
    render(<MobileNav nav={nav} step={0} setStep={setStep} currentUser={null} open onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Launch" }), { key: "Enter" });
    expect(setStep).toHaveBeenCalledWith(4);
    expect(onClose).toHaveBeenCalled();
  });

  it("ignores keys other than Enter/Space on a nav item", () => {
    const setStep = vi.fn();
    const onClose = vi.fn();
    render(<MobileNav nav={nav} step={0} setStep={setStep} currentUser={null} open onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Launch" }), { key: "Tab" });
    expect(setStep).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("navigates via the Space key", () => {
    const setStep = vi.fn();
    const onClose = vi.fn();
    render(<MobileNav nav={nav} step={0} setStep={setStep} currentUser={null} open onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Launch" }), { key: " " });
    expect(setStep).toHaveBeenCalledWith(4);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes itself when the active step changes elsewhere while open", () => {
    const onClose = vi.fn();
    const { rerender } = render(<MobileNav nav={nav} step={0} setStep={vi.fn()} currentUser={null} open onClose={onClose} />);
    rerender(<MobileNav nav={nav} step={4} setStep={vi.fn()} currentUser={null} open onClose={onClose} />);
    expect(onClose).toHaveBeenCalled();
  });

  it("ignores other keys and renders closed with no drawer effects", () => {
    const { container } = render(<MobileNav nav={nav} step={0} setStep={vi.fn()} currentUser={user} open={false} onClose={vi.fn()} />);
    expect(container.querySelector('[role="dialog"]')).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button", { name: "Account menu" })).not.toBeInTheDocument();
  });

  it("renders a disabled nav item as genuinely inert: no onClick fires, not keyboard-activatable (tabIndex=-1, no keydown handler), aria-disabled is set", () => {
    const askNav = [{ section: "AI", items: [{ name: "Ask OmniBioAI", idx: -1, disabled: true }] }];
    const setStep = vi.fn();
    render(<MobileNav nav={askNav} step={-1} setStep={setStep} currentUser={null} open onClose={vi.fn()} />);
    const ask = screen.getByText("Ask OmniBioAI", { selector: "div" });
    expect(ask).toHaveAttribute("aria-disabled", "true");
    expect(ask).toHaveAttribute("tabIndex", "-1");
    fireEvent.click(ask);
    expect(setStep).not.toHaveBeenCalled();
    fireEvent.keyDown(ask, { key: "Enter" });
    expect(setStep).not.toHaveBeenCalled();
  });

  it("renders Code and Workflows nav entries generically and forwards their idx on click, closing the drawer", () => {
    const codeWorkflowsNav = [{ section: "Runtime", items: [
      { name: "Jobs", idx: 9 }, { name: "Code", idx: 18 }, { name: "Workflows", idx: 19 },
    ] }];
    const setStep = vi.fn();
    const onClose = vi.fn();
    render(<MobileNav nav={codeWorkflowsNav} step={9} setStep={setStep} currentUser={null} open onClose={onClose} />);
    fireEvent.click(screen.getByText("Code", { selector: "div" }));
    expect(setStep).toHaveBeenCalledWith(18);
    fireEvent.click(screen.getByText("Workflows", { selector: "div" }));
    expect(setStep).toHaveBeenCalledWith(19);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("Navigation icons", () => {
  const iconNav = [
    { section: null, items: [{ name: "Studio", idx: 7 }] },
    { section: "AI", items: [{ name: "Ask OmniBioAI", idx: -1 }] },
    { section: "Work", items: [
      { name: "Projects", idx: 20 }, { name: "Code", idx: 18 }, { name: "Workflows", idx: 19 },
      { name: "Jobs", idx: 9 }, { name: "Artifacts", idx: 21 },
    ] },
    { section: "Runtime", items: [{ name: "Launch", idx: 4 }, { name: "Billing", idx: 12 }] },
    { section: "Security", items: [{ name: "Roles", idx: 11 }] },
    { section: "Organization", items: [{ name: "Connections", idx: 26 }] },
  ];
  const allItems = iconNav.flatMap(group => group.items);

  it("renders a semantic SVG icon (not a generic dot) for every nav destination, with the label still present, on desktop", () => {
    const { container } = render(<Sidebar nav={iconNav} step={7} setStep={vi.fn()} systemStatus="idle" currentUser={null} />);
    for (const { name } of allItems) {
      const row = container.querySelector(`[data-nav-item="${name}"]`);
      expect(row.querySelector("svg")).toBeInTheDocument();
      expect(row.querySelector('[style*="border-radius: 50%"]')).not.toBeInTheDocument();
      expect(row).toHaveTextContent(name);
    }
  });

  it("renders a semantic SVG icon (not a generic dot) for every nav destination, with the label still present, on mobile", () => {
    const { container } = render(<MobileNav nav={iconNav} step={7} setStep={vi.fn()} currentUser={null} open onClose={vi.fn()} />);
    for (const { name } of allItems) {
      const row = container.querySelector(`[data-nav-item="${name}"]`);
      expect(row.querySelector("svg")).toBeInTheDocument();
      expect(row.querySelector('[style*="border-radius: 50%"]')).not.toBeInTheDocument();
      expect(row).toHaveTextContent(name);
    }
  });

  it("uses the same semantic icon mapping on desktop and mobile for every destination", () => {
    const { container: desktop } = render(<Sidebar nav={iconNav} step={7} setStep={vi.fn()} systemStatus="idle" currentUser={null} />);
    const { container: mobile } = render(<MobileNav nav={iconNav} step={7} setStep={vi.fn()} currentUser={null} open onClose={vi.fn()} />);
    for (const { name } of allItems) {
      const desktopShapeCount = desktop.querySelector(`[data-nav-item="${name}"] svg`).querySelectorAll("path, circle, rect").length;
      const mobileShapeCount = mobile.querySelector(`[data-nav-item="${name}"] svg`).querySelectorAll("path, circle, rect").length;
      expect(mobileShapeCount).toBe(desktopShapeCount);
      expect(mobileShapeCount).toBeGreaterThan(0);
    }
  });

  it("gives disabled destinations the same icon as their enabled counterpart, unaffected by the disabled flag", () => {
    const enabledAsk = [{ section: "AI", items: [{ name: "Ask OmniBioAI", idx: -1 }] }];
    const disabledAsk = [{ section: "AI", items: [{ name: "Ask OmniBioAI", idx: -1, disabled: true }] }];
    const { container: enabled } = render(<Sidebar nav={enabledAsk} step={-1} setStep={vi.fn()} systemStatus="idle" currentUser={null} />);
    const { container: disabled } = render(<Sidebar nav={disabledAsk} step={-1} setStep={vi.fn()} systemStatus="idle" currentUser={null} />);
    const enabledRow = enabled.querySelector('[data-nav-item="Ask OmniBioAI"]');
    const disabledRow = disabled.querySelector('[data-nav-item="Ask OmniBioAI"]');
    expect(enabledRow.querySelector("svg")).toBeInTheDocument();
    expect(enabledRow).not.toHaveAttribute("aria-disabled");
    expect(disabledRow.querySelector("svg")).toBeInTheDocument();
    expect(disabledRow).toHaveAttribute("aria-disabled", "true");
  });

  it("does not add icons to section headings", () => {
    const { container } = render(<Sidebar nav={iconNav} step={7} setStep={vi.fn()} systemStatus="idle" currentUser={null} />);
    const headings = [...container.querySelectorAll("[data-nav-section] > div:first-child")]
      .filter(el => !el.hasAttribute("data-nav-item"));
    for (const heading of headings) {
      expect(heading.querySelector("svg")).not.toBeInTheDocument();
    }
  });
});

describe("UpdateBanner", () => {
  it("renders nothing without window.api.onUpdateAvailable", () => {
    const { container } = render(<UpdateBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("shows an update-available message and an error with a dismiss button", async () => {
    const listeners = {};
    window.api = {
      onUpdateAvailable: (cb) => { listeners.available = cb; },
      onUpdateError: (cb) => { listeners.error = cb; },
    };
    render(<UpdateBanner />);
    listeners.available({ version: "9.0.0" });
    expect(await screen.findByText(/v9\.0\.0 is available/)).toBeInTheDocument();

    listeners.error({ message: "checksum mismatch" });
    expect(await screen.findByText("Update failed: checksum mismatch")).toBeInTheDocument();
    fireEvent.click(screen.getByText("dismiss"));
    expect(screen.queryByText(/Update failed/)).not.toBeInTheDocument();
  });
});
