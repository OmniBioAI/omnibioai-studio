import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountLayout from "../../src/ui/components/AccountLayout";

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("../../src/ui/lib/session", () => ({ logout }));

afterEach(cleanup);

describe("AccountLayout", () => {
  it("lets a signed-in user sign out from Account", () => {
    render(<AccountLayout activeSection="profile" currentUser={{ email: "user@example.test", permissions: [] }} identity={{ organizations: [] }} onNavigate={vi.fn()}>Profile</AccountLayout>);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(logout).toHaveBeenCalledOnce();
  });
  it("renders grouped real links and marks the active page", () => {
    const navigate = vi.fn();
    render(<AccountLayout activeSection="billing" currentUser={{ permissions: [] }} identity={{ organizations: [{ organization_id: 5, organization_name: "Genome Lab" }] }} onNavigate={navigate}>Billing content</AccountLayout>);
    expect(screen.getByRole("heading", { name: "Your account" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Organization" })).toBeInTheDocument();
    const billing = screen.getByRole("link", { name: "Billing" });
    expect(billing).toHaveAttribute("href", "/studio/account/organization/billing");
    expect(billing).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Genome Lab")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Organization" })).not.toBeInTheDocument();
    fireEvent.click(billing);
    expect(navigate).toHaveBeenCalledWith("billing");
  });

  it("shows a keyboard reachable switcher only for multiple organizations", () => {
    render(<AccountLayout activeSection="usage" currentUser={{ orgId: 2, permissions: [] }} identity={{ organizations: [
      { organization_id: 1, organization_name: "Genome Lab" }, { organization_id: 2, organization_name: "Cell Lab" },
    ] }} onNavigate={vi.fn()}>Usage</AccountLayout>);
    const switcher = screen.getByRole("button", { name: /Cell Lab/ });
    expect(switcher).toHaveAttribute("aria-haspopup", "listbox");
    fireEvent.click(switcher);
    fireEvent.click(screen.getByRole("button", { name: "Genome Lab" }));
    expect(screen.getByRole("button", { name: /Genome Lab/ })).toHaveAttribute("aria-expanded", "false");
    expect(window.location.search).toContain("organization_id=1");
  });

  it("omits Members & roles for users without manage_roles", () => {
    render(<AccountLayout activeSection="profile" currentUser={{ permissions: [] }} identity={{ organizations: [] }} onNavigate={vi.fn()}>Profile</AccountLayout>);
    expect(screen.queryByRole("link", { name: "Members & roles" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preferences" })).toHaveAttribute("href", "/studio/account/preferences");
  });
});
