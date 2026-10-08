import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const billingApi = vi.hoisted(() => ({
  getCurrentMembership: vi.fn(),
  createUserMembershipCheckout: vi.fn(),
  createUserMembershipPortal: vi.fn(),
}));
vi.mock("../../src/ui/lib/billingApi", () => billingApi);
import MembershipPlans from "../../src/ui/pages/MembershipPlans";
import { normalizeMembershipState } from "../../src/ui/lib/membershipCatalog";

const user = { userId: 7, orgId: "42" };

beforeEach(() => {
  billingApi.getCurrentMembership.mockReset();
  billingApi.createUserMembershipCheckout.mockReset();
  billingApi.createUserMembershipPortal.mockReset();
  billingApi.getCurrentMembership.mockRejectedValue(new Error("unavailable"));
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  delete window.api;
});

describe("MembershipPlans", () => {
  it("renders all four plans with exact monthly prices and storage allowances", () => {
    render(<MembershipPlans currentUser={user} />);
    for (const name of ["Free", "Plus", "Pro", "Enterprise"]) expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByText("$19")).toBeInTheDocument();
    expect(screen.getByText("$49")).toBeInTheDocument();
    expect(screen.getByText("1 GB personal storage allowance (not yet enforced)")).toBeInTheDocument();
    expect(screen.getByText("20 GB personal storage allowance (not yet enforced)")).toBeInTheDocument();
    expect(screen.getByText("100 GB personal storage allowance (not yet enforced)")).toBeInTheDocument();
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

  it("does not infer Free when individual billing is unavailable", async () => {
    render(<MembershipPlans currentUser={user} />);
    expect(await screen.findByText(/has not been inferred/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Free is your current plan/ })).not.toBeInTheDocument();
  });

  it("renders an authoritative USER-scoped current plan", () => {
    render(<MembershipPlans currentUser={user} membershipState={{ status: "ready", scope: "USER", plan: "plus", subscription_status: "active", storage_quota_bytes: 20_000_000_000 }} />);
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
    expect(screen.getByRole("button", { name: "Plus annual billing unavailable" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pro annual billing unavailable" })).toBeDisabled();
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
    ["success", "changes only after server-side billing confirmation is received"],
    ["cancelled", "No membership change was made"],
    ["error", "No membership change was made"],
  ])("handles checkout return %s without granting membership", async (result, copy) => {
    window.history.replaceState({}, "", `/studio/billing/plans?checkout=${result}`);
    render(<MembershipPlans currentUser={user} />);
    expect(screen.getByText(new RegExp(copy))).toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(await screen.findByText(/has not been inferred/)).toBeInTheDocument();
  });

  it("provides an overflow wrapper and single-column mobile breakpoint hooks", () => {
    const { container } = render(<MembershipPlans currentUser={user} />);
    expect(container.querySelector(".membership-table-wrap")).toBeInTheDocument();
    expect(container.querySelector(".membership-grid")).toBeInTheDocument();
  });

  it("shows authoritative allowance messaging and separates organization storage", () => {
    render(<MembershipPlans currentUser={user} />);
    expect(screen.getByText(/Billing authoritatively reports/)).toBeInTheDocument();
    expect(screen.getByText(/separate ORGANIZATION scope/)).toBeInTheDocument();
    expect(screen.getByText(/USER Pro membership never grants Enterprise/)).toBeInTheDocument();
  });

  it("loads and displays authoritative Free membership, status, and storage", async () => {
    billingApi.getCurrentMembership.mockResolvedValue({
      owner_type: "USER", plan: "free", subscription_status: "active",
      storage_quota_bytes: 1_000_000_000, checkout_eligible_plans: [], portal_available: false,
    });
    render(<MembershipPlans currentUser={user} />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking current membership");
    expect(await screen.findByText("Status: active")).toBeInTheDocument();
    expect(screen.getByText("Storage allowance: 1 GB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Free is your current plan" })).toBeDisabled();
  });

  it("treats an expired billing authentication response as unauthorized", async () => {
    billingApi.getCurrentMembership.mockRejectedValue(Object.assign(new Error("expired"), { status: 401 }));
    render(<MembershipPlans currentUser={user} />);
    expect(await screen.findByText("Sign in to view your membership.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /is your current plan/ })).not.toBeInTheDocument();
  });

  it("enables only backend-eligible checkout and opens the hosted URL", async () => {
    billingApi.getCurrentMembership.mockResolvedValue({
      owner_type: "USER", plan: "free", subscription_status: "active",
      storage_quota_bytes: 1_000_000_000, checkout_eligible_plans: ["plus"], portal_available: false,
    });
    billingApi.createUserMembershipCheckout.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/cs_test" });
    window.api = { openExternal: vi.fn() };
    render(<MembershipPlans currentUser={user} />);
    const upgrade = await screen.findByRole("button", { name: "Upgrade to Plus" });
    expect(screen.getByRole("button", { name: "Upgrade to Pro unavailable" })).toBeDisabled();
    fireEvent.click(upgrade);
    await waitFor(() => expect(billingApi.createUserMembershipCheckout).toHaveBeenCalledWith("plus"));
    expect(window.api.openExternal).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test");
  });

  it("surfaces checkout failure without changing the current plan", async () => {
    billingApi.getCurrentMembership.mockResolvedValue({
      owner_type: "USER", plan: "free", subscription_status: "active",
      storage_quota_bytes: 1_000_000_000, checkout_eligible_plans: ["pro"], portal_available: false,
    });
    billingApi.createUserMembershipCheckout.mockRejectedValue(new Error("Checkout configuration unavailable"));
    render(<MembershipPlans currentUser={user} />);
    fireEvent.click(await screen.findByRole("button", { name: "Upgrade to Pro" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Checkout configuration unavailable");
    expect(screen.getByRole("button", { name: "Free is your current plan" })).toBeDisabled();
  });

  it("uses the established hosted portal for a paid personal subscription", async () => {
    billingApi.getCurrentMembership.mockResolvedValue({
      owner_type: "USER", plan: "plus", subscription_status: "active",
      storage_quota_bytes: 20_000_000_000, checkout_eligible_plans: [], portal_available: true,
    });
    billingApi.createUserMembershipPortal.mockResolvedValue({ url: "https://billing.stripe.com/p/session" });
    window.api = { openExternal: vi.fn() };
    render(<MembershipPlans currentUser={user} />);
    fireEvent.click(await screen.findByRole("button", { name: "Manage personal subscription" }));
    await waitFor(() => expect(window.api.openExternal).toHaveBeenCalledWith("https://billing.stripe.com/p/session"));
  });
});
