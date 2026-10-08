import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MembershipPlans from "../../src/ui/pages/MembershipPlans";
import { normalizeMembershipState } from "../../src/ui/lib/membershipCatalog";

const user = { userId: 7, orgId: "42" };

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("MembershipPlans", () => {
  it("renders all four plans with exact monthly prices and storage allowances", () => {
    render(<MembershipPlans currentUser={user} />);
    for (const name of ["Free", "Plus", "Pro", "Enterprise"]) expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByText("$19")).toBeInTheDocument();
    expect(screen.getByText("$49")).toBeInTheDocument();
    expect(screen.getByText("1 GB personal storage (planned allowance)")).toBeInTheDocument();
    expect(screen.getByText("20 GB personal storage (planned allowance)")).toBeInTheDocument();
    expect(screen.getByText("100 GB personal storage (planned allowance)")).toBeInTheDocument();
  });

  it("describes Enterprise BYOS and excludes infrastructure costs", () => {
    render(<MembershipPlans currentUser={user} />);
    const enterprise = screen.getByRole("heading", { name: "Enterprise" }).closest("article");
    expect(enterprise).toHaveTextContent("AWS S3");
    expect(enterprise).toHaveTextContent("Google Cloud Storage");
    expect(enterprise).toHaveTextContent("Azure Blob");
    expect(enterprise).toHaveTextContent("S3-compatible");
    expect(enterprise).toHaveTextContent("on-premises storage gateway");
    expect(enterprise).toHaveTextContent("costs are not included unless specified in a contract");
    expect(within(enterprise).queryByRole("link", { name: /Contact Sales/i })).not.toBeInTheDocument();
  });

  it("does not infer Free when individual billing is unavailable", () => {
    render(<MembershipPlans currentUser={user} />);
    expect(screen.getByText("Billing unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Free is your current plan/ })).not.toBeInTheDocument();
  });

  it("renders an authoritative USER-scoped current plan", () => {
    render(<MembershipPlans currentUser={user} membershipState={{ status: "ready", scope: "USER", plan: "plus" }} />);
    expect(screen.getByText("Current personal membership")).toBeInTheDocument();
    expect(screen.getAllByText("Plus").length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: "Plus is your current plan" })).toBeDisabled();
  });

  it("rejects ORGANIZATION state as an individual membership", () => {
    const state = normalizeMembershipState({ status: "ready", scope: "ORGANIZATION", plan: "pro" });
    expect(state.status).toBe("unavailable");
    render(<MembershipPlans currentUser={user} membershipState={{ status: "ready", scope: "ORGANIZATION", plan: "pro" }} />);
    expect(screen.getByText("Billing unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pro is your current plan" })).not.toBeInTheDocument();
  });

  it("shows loading, billing-error, and unauthorized states without guessing", () => {
    const view = render(<MembershipPlans currentUser={user} membershipState={{ status: "loading" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking current membership");
    view.rerender(<MembershipPlans currentUser={user} membershipState={{ status: "error" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("has not been inferred");
    view.rerender(<MembershipPlans currentUser={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Sign in");
  });

  it("makes annual billing visibly unavailable without inventing prices", () => {
    render(<MembershipPlans currentUser={user} />);
    fireEvent.click(screen.getByRole("button", { name: "Yearly" }));
    expect(screen.getByRole("button", { name: "Yearly" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("status").some(item => item.textContent.includes("No annual Stripe prices are configured"))).toBe(true);
    expect(screen.getAllByText("Unavailable")).toHaveLength(4);
    expect(screen.queryByText("$228")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    expect(screen.getByText("$19")).toBeInTheDocument();
  });

  it("keeps Plus and Pro upgrades disabled when checkout is not configured", () => {
    render(<MembershipPlans currentUser={user} />);
    expect(screen.getByRole("button", { name: "Upgrade to Plus unavailable" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upgrade to Pro unavailable" })).toBeDisabled();
  });

  it.each([
    ["success", "remains unchanged until server-side billing confirmation"],
    ["cancelled", "No membership change was made"],
    ["error", "No membership change was made"],
  ])("handles checkout return %s without granting membership", (result, copy) => {
    window.history.replaceState({}, "", `/studio/billing/plans?checkout=${result}`);
    render(<MembershipPlans currentUser={user} />);
    expect(screen.getByText(new RegExp(copy))).toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(screen.getByText("Billing unavailable")).toBeInTheDocument();
  });

  it("provides an overflow wrapper and single-column mobile breakpoint hooks", () => {
    const { container } = render(<MembershipPlans currentUser={user} />);
    expect(container.querySelector(".membership-table-wrap")).toBeInTheDocument();
    expect(container.querySelector(".membership-grid")).toBeInTheDocument();
  });

  it("shows storage allowances as proposed and separates organization storage", () => {
    render(<MembershipPlans currentUser={user} />);
    expect(screen.getByText(/proposed allowances/)).toBeInTheDocument();
    expect(screen.getByText(/separate ORGANIZATION scope/)).toBeInTheDocument();
    expect(screen.getByText(/USER Pro membership never grants Enterprise/)).toBeInTheDocument();
  });
});
