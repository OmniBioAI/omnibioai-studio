import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountLayout from "../../src/ui/components/AccountLayout";

afterEach(cleanup);

describe("AccountLayout", () => {
  it("renders implemented account sections with semantic active state", () => {
    render(<AccountLayout activeSection="profile" onNavigate={vi.fn()}><div>Canonical profile</div></AccountLayout>);
    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByText("Canonical profile")).toBeInTheDocument();
    const profile = screen.getByRole("button", { name: "Profile" });
    expect(profile).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Security" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Preferences" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Personalization" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Privacy & Data" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help & Product" })).toBeInTheDocument();
    expect(screen.queryByText(/Storage|Usage|Connections/)).not.toBeInTheDocument();
  });

  it("delegates local navigation and supports future available sections without owning their data", () => {
    const onNavigate = vi.fn();
    const sections = [{ id: "profile", label: "Profile" }, { id: "security", label: "Security" }];
    render(<AccountLayout activeSection="profile" onNavigate={onNavigate} sections={sections}>Content</AccountLayout>);
    const security = screen.getByRole("button", { name: "Security" });
    expect(security).not.toHaveAttribute("aria-current");
    fireEvent.click(security);
    expect(onNavigate).toHaveBeenCalledWith("security");
  });

  it("omits the search box for a short, custom section list", () => {
    const sections = [{ id: "profile", label: "Profile" }, { id: "security", label: "Security" }];
    render(<AccountLayout activeSection="profile" onNavigate={vi.fn()} sections={sections}>Content</AccountLayout>);
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
  });

  it("filters the default section list by label, locally only", () => {
    render(<AccountLayout activeSection="profile" onNavigate={vi.fn()}>Content</AccountLayout>);
    const search = screen.getByRole("searchbox", { name: "Search account settings" });
    fireEvent.change(search, { target: { value: "priv" } });
    expect(screen.getByRole("button", { name: "Privacy & Data" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Security" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Plan" })).not.toBeInTheDocument();
  });

  it("shows an honest empty state for no matches, and never exposes a hidden route", () => {
    render(<AccountLayout activeSection="profile" onNavigate={vi.fn()}>Content</AccountLayout>);
    const search = screen.getByRole("searchbox", { name: "Search account settings" });
    fireEvent.change(search, { target: { value: "storage" } });
    expect(screen.getByRole("status")).toHaveTextContent("No matching settings.");
    expect(screen.queryByRole("button", { name: /Storage/ })).not.toBeInTheDocument();
  });

  it("does not navigate on Enter when there is no match or more than one", () => {
    const onNavigate = vi.fn();
    render(<AccountLayout activeSection="profile" onNavigate={onNavigate}>Content</AccountLayout>);
    const search = screen.getByRole("searchbox", { name: "Search account settings" });
    fireEvent.change(search, { target: { value: "nope" } });
    fireEvent.submit(search.closest("form"));
    fireEvent.change(search, { target: { value: "p" } }); // matches several (Profile, Preferences, Appearance, Personalization, Privacy, Plan, Help)
    fireEvent.submit(search.closest("form"));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("navigates to the sole match on Enter, and respects a caller's own restricted section list", () => {
    const onNavigate = vi.fn();
    const sections = [{ id: "profile", label: "Profile" }, { id: "security", label: "Security" }, { id: "plan", label: "Plan" }, { id: "privacy", label: "Privacy & Data" }, { id: "help", label: "Help & Product" }, { id: "preferences", label: "Preferences" }, { id: "notifications", label: "Notifications" }];
    render(<AccountLayout activeSection="profile" onNavigate={onNavigate} sections={sections}>Content</AccountLayout>);
    const search = screen.getByRole("searchbox", { name: "Search account settings" });
    fireEvent.change(search, { target: { value: "plan" } });
    fireEvent.submit(search.closest("form"));
    expect(onNavigate).toHaveBeenCalledWith("plan");
  });
});
