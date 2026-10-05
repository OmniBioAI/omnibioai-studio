import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountLayout from "../../src/ui/components/AccountLayout";

afterEach(cleanup);

describe("AccountLayout", () => {
  it("renders Profile as the only truthful section with semantic active state", () => {
    render(<AccountLayout activeSection="profile" onNavigate={vi.fn()}><div>Canonical profile</div></AccountLayout>);
    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByText("Canonical profile")).toBeInTheDocument();
    const profile = screen.getByRole("button", { name: "Profile" });
    expect(profile).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText(/Storage|Usage|Security|Connections|Notifications|Preferences/)).not.toBeInTheDocument();
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
});
