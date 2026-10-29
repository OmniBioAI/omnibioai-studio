import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("../../src/ui/lib/session", () => ({ logout }));
import AccountMenuButton from "../../src/ui/components/AccountMenuButton";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const user = { userId: 7, email: "manish.kumar@omnibioai.org" };

describe("AccountMenuButton", () => {
  it("exposes the current identity and opens Account settings on activation", () => {
    const navigate = vi.fn();
    render(<AccountMenuButton currentUser={user} onProfileClick={navigate} />);
    expect(screen.getByText("MA")).toBeInTheDocument();
    expect(screen.getByText(user.email)).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Open Account" });
    fireEvent.click(trigger);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("uses the native button keyboard behavior for Enter and Space", async () => {
    const userInput = userEvent.setup();
    const navigate = vi.fn();
    render(<AccountMenuButton currentUser={user} onProfileClick={navigate} />);
    const trigger = screen.getByRole("button", { name: "Open Account" });
    await userInput.tab();
    expect(trigger).toHaveFocus();
    await userInput.keyboard("{Enter}");
    await userInput.keyboard(" ");
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it("reflects the active Account page accessibly", () => {
    render(<AccountMenuButton currentUser={user} onProfileClick={vi.fn()} isProfileActive />);
    expect(screen.getByRole("button", { name: "Open Account" })).toHaveAttribute("aria-current", "page");
  });

  it("does not mark Account current on other pages", () => {
    render(<AccountMenuButton currentUser={user} onProfileClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Open Account" })).not.toHaveAttribute("aria-current");
  });

  it("signs out through the session function", () => {
    render(<AccountMenuButton currentUser={user} onProfileClick={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(logout).toHaveBeenCalledOnce();
  });

  it("closes its mobile host after Account navigation and sign out", () => {
    const close = vi.fn();
    render(<AccountMenuButton currentUser={user} onProfileClick={vi.fn()} onAfterAction={close} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Account" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(close).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["name-only@example.org", "NA"], ["manish.kumar@example.org", "MA"],
    ["..@example.org", ".."], ["@example.org", "@E"],
    ["a@example.org", "A"], ["research-team@example.org", "RE"],
  ])("derives readable initials for %s", (email, initials) => {
    render(<AccountMenuButton currentUser={{ email }} onProfileClick={vi.fn()} />);
    expect(screen.getByText(initials)).toBeInTheDocument();
  });

  it("renders nothing after logout", () => {
    const { rerender } = render(<AccountMenuButton currentUser={user} onProfileClick={vi.fn()} />);
    rerender(<AccountMenuButton currentUser={null} onProfileClick={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Open Account" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("replaces the displayed identity immediately when the session changes", () => {
    const { rerender } = render(<AccountMenuButton currentUser={user} onProfileClick={vi.fn()} />);
    rerender(<AccountMenuButton currentUser={{ userId: 8, email: "next@example.org" }} onProfileClick={vi.fn()} />);
    expect(screen.queryByText(user.email)).not.toBeInTheDocument();
    expect(screen.getByText("next@example.org")).toBeInTheDocument();
    expect(screen.getByText("NE")).toBeInTheDocument();
  });

  it("keeps the Account trigger and sign-out action as separately named native buttons", () => {
    render(<AccountMenuButton currentUser={user} onProfileClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Open Account" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Open Account" })).toHaveAccessibleName();
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveAccessibleName();
  });

  it("does not invoke Account navigation when the user signs out", () => {
    const navigate = vi.fn();
    render(<AccountMenuButton currentUser={user} onProfileClick={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(logout).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("calls the mobile close handler after Account navigation", () => {
    const navigate = vi.fn(), close = vi.fn();
    render(<AccountMenuButton currentUser={user} onProfileClick={navigate} onAfterAction={close} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Account" }));
    expect(navigate).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("calls the mobile close handler after sign out", () => {
    const close = vi.fn();
    render(<AccountMenuButton currentUser={user} onProfileClick={vi.fn()} onAfterAction={close} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(logout).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not expose account actions without a current user", () => {
    render(<AccountMenuButton currentUser={null} onProfileClick={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps initials safe for missing and punctuation-only email local parts", () => {
    const { rerender } = render(<AccountMenuButton currentUser={{ email: "...@example.org" }} onProfileClick={vi.fn()} />);
    expect(screen.getByText(".." )).toBeInTheDocument();
    rerender(<AccountMenuButton currentUser={{ email: "" }} onProfileClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Open Account" })).toBeInTheDocument();
  });
});
