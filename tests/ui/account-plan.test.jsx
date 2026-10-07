import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const billingApi = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  getBillingSummary: vi.fn(),
  getPaymentMethod: vi.fn(),
  createBillingPortalSession: vi.fn(),
}));
vi.mock("../../src/ui/lib/billingApi", () => billingApi);

import AccountPlan from "../../src/ui/pages/AccountPlan";

const user = { userId: 1, orgId: "42" };

const subscription = {
  plan_name: "Growth", billing_interval: "monthly", currency: "usd", status: "active",
  start_date: "2026-01-01", end_date: null, renewal_date: "2026-11-01",
  features: [{ feature_key: "max_projects", value_type: "integer", int_value: 10 }],
};
const summary = {
  current_period: { period_start: "2026-10-01", period_end: "2026-10-31" },
  current_usage_cost: 12.5, currency: "usd", invoice_count: 3, outstanding_amount: 0,
};

function notFound() {
  const e = new Error("Not found");
  e.status = 404;
  return Promise.reject(e);
}

beforeEach(() => {
  billingApi.getSubscription.mockReset();
  billingApi.getBillingSummary.mockReset();
  billingApi.getPaymentMethod.mockReset();
  billingApi.createBillingPortalSession.mockReset();
  billingApi.getBillingSummary.mockResolvedValue(summary);
  billingApi.getPaymentMethod.mockResolvedValue({ can_manage: false });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete window.api; });

describe("AccountPlan", () => {
  it("requires sign-in and an organization context without inferring one", () => {
    render(<AccountPlan currentUser={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Sign in");
    const { rerender } = render(<AccountPlan currentUser={{ userId: 1 }} />);
    expect(screen.getAllByRole("status").some(el => el.textContent.includes("organization context"))).toBe(true);
    expect(billingApi.getSubscription).not.toHaveBeenCalled();
  });

  it("shows a loading state, then the organization's plan with explicit organization-scope labeling", async () => {
    billingApi.getSubscription.mockResolvedValue(subscription);
    render(<AccountPlan currentUser={user} />);
    expect(screen.getByText(/Loading organization plan/)).toBeInTheDocument();
    await screen.findByText("Growth");
    expect(document.querySelector(".account-plan header p").textContent).toMatch(/organization.?s plan, not a personal plan or quota/i);
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("max projects")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    // Billing summary, also labeled as the organization's.
    expect(await screen.findByText("Organization billing summary")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("never renders personal usage/quota numbers derived from the org allowance", async () => {
    billingApi.getSubscription.mockResolvedValue(subscription);
    render(<AccountPlan currentUser={user} />);
    await screen.findByText("Growth");
    expect(screen.queryByText(/remaining/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/your usage/i)).not.toBeInTheDocument();
  });

  it("shows an honest empty state for no active subscription, not an error", async () => {
    billingApi.getSubscription.mockImplementation(notFound);
    render(<AccountPlan currentUser={user} />);
    expect(await screen.findByText("Your organization has no active subscription.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a retryable error on failure, sanitized from the raw backend error", async () => {
    billingApi.getSubscription.mockRejectedValue(new Error("db exploded"));
    render(<AccountPlan currentUser={user} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("db exploded");
    billingApi.getSubscription.mockResolvedValue(subscription);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Growth");
  });

  it("hides subscription management from an ordinary member and shows it to a billing manager", async () => {
    billingApi.getSubscription.mockResolvedValue(subscription);
    billingApi.getPaymentMethod.mockResolvedValue({ can_manage: false });
    render(<AccountPlan currentUser={user} />);
    await screen.findByText("Growth");
    expect(screen.queryByRole("button", { name: "Manage subscription" })).not.toBeInTheDocument();
    expect(screen.getByText(/Contact an organization billing administrator/)).toBeInTheDocument();
    cleanup();
    billingApi.getPaymentMethod.mockResolvedValue({ can_manage: true });
    render(<AccountPlan currentUser={user} />);
    await screen.findByText("Growth");
    expect(await screen.findByRole("button", { name: "Manage subscription" })).toBeInTheDocument();
  });

  it("opens the Stripe-hosted billing portal through the Electron bridge when present", async () => {
    billingApi.getSubscription.mockResolvedValue(subscription);
    billingApi.getPaymentMethod.mockResolvedValue({ can_manage: true });
    billingApi.createBillingPortalSession.mockResolvedValue({ url: "https://billing.stripe.com/session/abc" });
    window.api = { openExternal: vi.fn() };
    render(<AccountPlan currentUser={user} />);
    fireEvent.click(await screen.findByRole("button", { name: "Manage subscription" }));
    await waitFor(() => expect(window.api.openExternal).toHaveBeenCalledWith("https://billing.stripe.com/session/abc"));
  });

  it("refuses to open a non-Stripe-hosted portal URL and surfaces a safe error", async () => {
    billingApi.getSubscription.mockResolvedValue(subscription);
    billingApi.getPaymentMethod.mockResolvedValue({ can_manage: true });
    billingApi.createBillingPortalSession.mockResolvedValue({ url: "https://evil.example/steal" });
    window.api = { openExternal: vi.fn() };
    render(<AccountPlan currentUser={user} />);
    fireEvent.click(await screen.findByRole("button", { name: "Manage subscription" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Refused/);
    expect(window.api.openExternal).not.toHaveBeenCalled();
  });

  it("renders every entitlement value type, an end date when present, and no active billing period honestly", async () => {
    billingApi.getSubscription.mockResolvedValue({
      ...subscription, end_date: "2027-01-01",
      features: [
        { feature_key: "sso", value_type: "boolean", bool_value: true },
        { feature_key: "legacy", value_type: "boolean", bool_value: false },
        { feature_key: "seats", value_type: "unlimited" },
        { feature_key: "tier", value_type: "string", string_value: "gold" },
        { feature_key: "mystery", value_type: "other" },
      ],
    });
    billingApi.getBillingSummary.mockResolvedValue({ ...summary, current_period: null });
    render(<AccountPlan currentUser={user} />);
    await screen.findByText("Growth");
    expect(screen.getByText("Ends")).toBeInTheDocument();
    expect(screen.getByText("2027-01-01")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByText("Unlimited")).toBeInTheDocument();
    expect(screen.getByText("gold")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("No active billing period")).toBeInTheDocument();
  });

  it("falls back to honest placeholders for a sparse subscription/summary response", async () => {
    billingApi.getSubscription.mockResolvedValue({
      status: undefined,
      features: [
        { feature_key: "max_projects", value_type: "integer", int_value: null },
        { feature_key: "tier", value_type: "string", string_value: "" },
      ],
    });
    billingApi.getBillingSummary.mockResolvedValue({ current_period: null, currency: undefined, outstanding_amount: "not-a-number" });
    render(<AccountPlan currentUser={user} />);
    await screen.findByText("unknown");
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4); // plan name, billing interval, and both sparse features
    expect(screen.getByText("0")).toBeInTheDocument(); // invoice_count nullish fallback
    expect(screen.getAllByText("0.00 USD").length).toBeGreaterThanOrEqual(1); // NaN outstanding amount + missing-currency fallback
  });

  it("silently ignores a failed payment-method lookup, leaving management hidden", async () => {
    billingApi.getSubscription.mockResolvedValue(subscription);
    billingApi.getPaymentMethod.mockRejectedValue(new Error("unavailable"));
    render(<AccountPlan currentUser={user} />);
    await screen.findByText("Growth");
    expect(screen.queryByRole("button", { name: "Manage subscription" })).not.toBeInTheDocument();
  });

  it("ignores a late, aborted response after unmount", async () => {
    const deferred = {}; deferred.promise = new Promise(resolve => { deferred.resolve = resolve; });
    billingApi.getSubscription.mockReturnValue(deferred.promise);
    const { unmount } = render(<AccountPlan currentUser={user} />);
    unmount();
    deferred.resolve(subscription);
    await Promise.resolve();
    expect(screen.queryByText("Growth")).not.toBeInTheDocument();
  });

  it("does not double-submit the portal action on rapid repeat clicks", async () => {
    billingApi.getSubscription.mockResolvedValue(subscription);
    billingApi.getPaymentMethod.mockResolvedValue({ can_manage: true });
    billingApi.createBillingPortalSession.mockResolvedValue({ url: "https://billing.stripe.com/session/abc" });
    window.api = { openExternal: vi.fn() };
    render(<AccountPlan currentUser={user} />);
    const button = await screen.findByRole("button", { name: "Manage subscription" });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(window.api.openExternal).toHaveBeenCalledTimes(1));
  });

  it("falls back to a generic message when the portal action's own error carries none", async () => {
    billingApi.getSubscription.mockResolvedValue(subscription);
    billingApi.getPaymentMethod.mockResolvedValue({ can_manage: true });
    billingApi.createBillingPortalSession.mockRejectedValue(new Error(""));
    render(<AccountPlan currentUser={user} />);
    fireEvent.click(await screen.findByRole("button", { name: "Manage subscription" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That action failed. Please try again.");
  });

  it("surfaces an authorization error distinctly from a generic failure", async () => {
    const authError = new Error("nope"); authError.status = 403;
    billingApi.getSubscription.mockRejectedValue(authError);
    render(<AccountPlan currentUser={user} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be authorized");
  });

  it("reloads and clears state on organization switch", async () => {
    billingApi.getSubscription.mockResolvedValue(subscription);
    const { rerender } = render(<AccountPlan currentUser={user} />);
    await screen.findByText("Growth");
    billingApi.getSubscription.mockReset();
    billingApi.getSubscription.mockImplementation(notFound);
    rerender(<AccountPlan currentUser={{ userId: 1, orgId: "99" }} />);
    expect(await screen.findByText("Your organization has no active subscription.")).toBeInTheDocument();
    expect(screen.queryByText("Growth")).not.toBeInTheDocument();
  });
});
