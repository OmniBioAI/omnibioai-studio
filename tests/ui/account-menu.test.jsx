import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("../../src/ui/lib/session", () => ({ logout }));

import AccountMenu from "../../src/ui/components/AccountMenu";

const user = { userId: 7, email: "manish.kumar@omnibioai.org" };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AccountMenu", () => {
  it.each([true, false])("opens Personalization and closes its host; mobile=%s", mobile => {
    const navigate = vi.fn(), close = vi.fn();
    render(<AccountMenu currentUser={user} onPersonalizationClick={navigate} onAfterAction={mobile ? close : undefined} isPersonalizationActive />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const item = screen.getByRole("menuitem", { name: /Personalization/ });
    expect(item).toHaveAttribute("aria-current", "page"); fireEvent.click(item);
    expect(navigate).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledTimes(mobile ? 1 : 0);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
  it.each([true, false])("navigates to Preferences and closes; mobile=%s", mobile => {
    const navigate = vi.fn(), close = vi.fn();
    render(<AccountMenu currentUser={user} onPreferencesClick={navigate} onAfterAction={mobile ? close : undefined} isPreferencesActive />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const item = screen.getByRole("menuitem", { name: /Preferences/ });
    expect(item).toHaveAttribute("aria-current", "page"); fireEvent.click(item);
    expect(navigate).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledTimes(mobile ? 1 : 0);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
  it("shows canonical session identity and opens an accessible menu", () => {
    render(<AccountMenu currentUser={user} onProfileClick={vi.fn()} onSecurityClick={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Account menu" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("MA")).toBeInTheDocument();
    expect(screen.getByText(user.email)).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Profile/ })).toHaveFocus();
    expect(screen.getByRole("menuitem", { name: /Security/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Preferences/ })).toBeInTheDocument();
    expect(screen.queryByText(/Storage|Usage|Connections/)).not.toBeInTheDocument();
  });

  it("opens from the keyboard through its semantic trigger", async () => {
    const userInput = userEvent.setup();
    render(<AccountMenu currentUser={user} onProfileClick={vi.fn()} />);
    await userInput.tab();
    expect(screen.getByRole("button", { name: "Account menu" })).toHaveFocus();
    await userInput.keyboard("{Enter}");
    expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
  });

  it("navigates to the active Profile section and closes", () => {
    const onProfileClick = vi.fn();
    render(<AccountMenu currentUser={user} onProfileClick={onProfileClick} isProfileActive />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const profile = screen.getByRole("menuitem", { name: /Profile/ });
    expect(profile).toHaveAttribute("aria-current", "page");
    fireEvent.click(profile);
    expect(onProfileClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("navigates to the active Security section and closes", () => {
    const onSecurityClick = vi.fn();
    render(<AccountMenu currentUser={user} onProfileClick={vi.fn()} onSecurityClick={onSecurityClick} isSecurityActive />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const security = screen.getByRole("menuitem", { name: /Security/ });
    expect(security).toHaveAttribute("aria-current", "page");
    fireEvent.click(security);
    expect(onSecurityClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on Escape and restores trigger focus", () => {
    render(<AccountMenu currentUser={user} onProfileClick={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Account menu" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("ignores inside pointer events and closes on outside pointer events", () => {
    render(<div><AccountMenu currentUser={user} onProfileClick={vi.fn()} /><button>Outside</button></div>);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.pointerDown(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("signs out through the existing session function and closes its mobile host", () => {
    const onAfterAction = vi.fn();
    render(<AccountMenu currentUser={user} onProfileClick={vi.fn()} onAfterAction={onAfterAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(logout).toHaveBeenCalledOnce();
    expect(onAfterAction).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes and replaces identity immediately on account switch", () => {
    const { rerender } = render(<AccountMenu currentUser={user} onProfileClick={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    rerender(<AccountMenu currentUser={{ userId: 8, email: "b@example.org" }} onProfileClick={vi.fn()} />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByText(user.email)).not.toBeInTheDocument();
    expect(screen.getByText("b@example.org")).toBeInTheDocument();
  });

  it("renders nothing after logout and safely derives fallback initials", () => {
    const { rerender } = render(<AccountMenu currentUser={{ email: "..@example.org" }} onProfileClick={vi.fn()} />);
    expect(screen.getByText("..")).toBeInTheDocument();
    rerender(<AccountMenu currentUser={null} onProfileClick={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Account menu" })).not.toBeInTheDocument();
  });
});


it.each([false, true])("opens Appearance and closes the account menu (mobile=%s)", mobile => {
  const navigate = vi.fn(), close = vi.fn();
  render(<AccountMenu currentUser={{ userId: 1, email: "test@example.org" }} onAppearanceClick={navigate} onAfterAction={mobile ? close : undefined} isAppearanceActive />);
  fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
  const item = screen.getByRole("menuitem", { name: /Appearance/ });
  expect(item).toHaveAttribute("aria-current", "page");
  fireEvent.click(item); expect(navigate).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  if (mobile) expect(close).toHaveBeenCalledOnce();
});

it.each([false, true])("opens Notifications and closes the account menu (mobile=%s)", mobile => {
  const navigate = vi.fn(), close = vi.fn();
  render(<AccountMenu currentUser={{ userId: 1, email: "test@example.org" }} onNotificationsClick={navigate} onAfterAction={mobile ? close : undefined} isNotificationsActive />);
  fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
  const item = screen.getByRole("menuitem", { name: /Notifications/ });
  expect(item).toHaveAttribute("aria-current", "page");
  fireEvent.click(item); expect(navigate).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  if (mobile) expect(close).toHaveBeenCalledOnce();
});

it.each(["Appearance", "Notifications", "Privacy & Data", "Plan", "Help & Product"])("does not throw clicking %s with no handler provided", label => {
  render(<AccountMenu currentUser={{ userId: 1, email: "test@example.org" }} />);
  fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
  expect(() => fireEvent.click(screen.getByRole("menuitem", { name: label }))).not.toThrow();
});

it.each([
  ["Privacy & Data", "onPrivacyClick", "isPrivacyActive"],
  ["Plan", "onPlanClick", "isPlanActive"],
  ["Help & Product", "onHelpClick", "isHelpActive"],
])("opens %s and closes the account menu", (label, clickProp, activeProp) => {
  const navigate = vi.fn();
  render(<AccountMenu currentUser={{ userId: 1, email: "test@example.org" }} {...{ [clickProp]: navigate, [activeProp]: true }} />);
  fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
  const item = screen.getByRole("menuitem", { name: label });
  expect(item).toHaveAttribute("aria-current", "page");
  fireEvent.click(item);
  expect(navigate).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
