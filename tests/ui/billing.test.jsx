import React from "react";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const billingApi = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  getUsageLimits: vi.fn(),
  getBillingSummary: vi.fn(),
  getUsageSummary: vi.fn(),
  getCostHistory: vi.fn(),
  getCostBreakdown: vi.fn(),
  getPaymentMethod: vi.fn(),
  createPaymentSetupSession: vi.fn(),
  createBillingPortalSession: vi.fn(),
}));
vi.mock("../../src/ui/lib/billingApi", () => billingApi);

import Billing, { isStripeHostedUrl } from "../../src/ui/pages/Billing";

const member = { email: "u@test", permissions: [], orgId: "42" };

function notFound() {
  const e = new Error("Not found");
  e.status = 404;
  return Promise.reject(e);
}

beforeEach(() => {
  billingApi.getSubscription.mockReset();
  billingApi.getUsageLimits.mockReset();
  billingApi.getBillingSummary.mockReset();
  billingApi.getUsageSummary.mockReset();
  billingApi.getCostHistory.mockReset();
  billingApi.getCostBreakdown.mockReset();
  billingApi.getPaymentMethod.mockReset();
  billingApi.createPaymentSetupSession.mockReset();
  billingApi.createBillingPortalSession.mockReset();
  // Every existing test below predates the payment-method card and knows
  // nothing about it — default it to the ordinary "not available" state
  // (a 404, same as subscription/limits elsewhere in this file) so none of
  // those tests have to be touched just to keep this card from throwing.
  billingApi.getPaymentMethod.mockImplementation(notFound);
  window.history.replaceState({}, "", "/");
  delete window.electronAPI;
  delete window.api;
});
afterEach(() => cleanup());

describe("Billing page gating", () => {
  it("requires sign-in when there is no current user", () => {
    render(<Billing currentUser={null} />);
    expect(screen.getByText("Sign in required")).toBeInTheDocument();
  });

  it("shows a no-org notice when the session has no orgId", () => {
    render(<Billing currentUser={{ email: "u@test", permissions: [], orgId: null }} />);
    expect(screen.getByText("No organization context")).toBeInTheDocument();
  });
});

describe("Billing page rendering", () => {
  it("renders plan, status, features, limits and period from the API", async () => {
    billingApi.getSubscription.mockResolvedValue({
      plan_name: "Research",
      billing_interval: "monthly",
      currency: "usd",
      status: "active",
      start_date: "2026-01-01",
      renewal_date: "2026-10-01",
      end_date: null,
      features: [
        { feature_key: "private_models", value_type: "boolean", bool_value: true },
        { feature_key: "max_seats", value_type: "integer", int_value: 25 },
      ],
    });
    billingApi.getUsageLimits.mockResolvedValue({
      plan_name: "Research",
      as_of: "2026-09-04",
      limits: [
        { service: "rag", action: "query", resource: "rag.query", unit: "call", period: "monthly", included: 1000, used: 250, remaining: 750, percentage_used: 25 },
      ],
    });
    billingApi.getBillingSummary.mockResolvedValue({
      current_period: { period_start: "2026-09-01", period_end: "2026-09-30", status: "OPEN" },
      current_usage_cost: "12.50",
      currency: "usd",
      invoice_count: 3,
      outstanding_amount: "0",
    });

    render(<Billing currentUser={member} />);

    await waitFor(() => expect(screen.getByText("Research")).toBeInTheDocument());
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("private_models")).toBeInTheDocument();
    expect(screen.getByText(/rag · query · rag.query/)).toBeInTheDocument();
    expect(screen.getByText("12.50 USD")).toBeInTheDocument();
  });

  it("treats a 404 subscription as 'no active subscription' without erroring", async () => {
    billingApi.getSubscription.mockImplementation(notFound);
    billingApi.getUsageLimits.mockImplementation(notFound);
    billingApi.getBillingSummary.mockResolvedValue({
      current_period: null,
      current_usage_cost: "0",
      currency: "usd",
      invoice_count: 0,
      outstanding_amount: "0",
    });

    render(<Billing currentUser={member} />);

    await waitFor(() =>
      expect(screen.getByText(/No active subscription is on record/)).toBeInTheDocument()
    );
    expect(screen.getByText("Not yet opened")).toBeInTheDocument();
  });
  it("renders every feature value and limit severity state", async () => {
    billingApi.getSubscription.mockResolvedValue({
      plan_name: "Complete",
      billing_interval: "annual",
      currency: null,
      status: "unknown-status",
      start_date: null,
      renewal_date: "2026-10-01T00:00:00Z",
      end_date: "2027-10-01",
      features: [
        { feature_key: "disabled", value_type: "boolean", bool_value: false },
        { feature_key: "unset", value_type: "integer", int_value: null },
        { feature_key: "unlimited", value_type: "unlimited" },
        { feature_key: "blank", value_type: "string", string_value: "" },
        { feature_key: "label", value_type: "string", string_value: "Research" },
        { feature_key: "future", value_type: "future" },
      ],
    });
    billingApi.getUsageLimits.mockResolvedValue({ limits: [
      { service: "a", action: "low", resource: "r", unit: "call", period: "day", included: 10, used: 1, percentage_used: 0 },
      { service: "a", action: "warn", resource: "r", unit: "call", period: "day", included: 10, used: 9, percentage_used: 90 },
      { service: "a", action: "full", resource: "r", unit: "call", period: "day", included: 10, used: 10, percentage_used: 100 },
    ] });
    billingApi.getBillingSummary.mockResolvedValue({
      current_period: null,
      current_usage_cost: "not-a-number",
      currency: null,
      invoice_count: null,
      outstanding_amount: undefined,
    });

    render(<Billing currentUser={member} />);

    await waitFor(() => expect(screen.getByText("Complete")).toBeInTheDocument());
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("Unlimited")).toBeInTheDocument();
    expect(screen.getByText("Research")).toBeInTheDocument();
    expect(screen.getByText(/a · low · r/)).toBeInTheDocument();
  });

  it("renders an empty limits state", async () => {
    billingApi.getSubscription.mockResolvedValue({
      plan_name: "Empty",
      billing_interval: "monthly",
      currency: "usd",
      status: "active",
      features: [],
    });
    billingApi.getUsageLimits.mockResolvedValue({});
    billingApi.getBillingSummary.mockResolvedValue({
      current_period: null,
      current_usage_cost: 0,
      currency: "usd",
      invoice_count: 0,
      outstanding_amount: 0,
    });

    render(<Billing currentUser={member} />);

    await waitFor(() => expect(screen.getByText("Empty")).toBeInTheDocument());
    expect(screen.getByText("This plan has no usage-metered limits.")).toBeInTheDocument();
  });

  it("shows non-404 endpoint failures and hides unavailable limits", async () => {
    billingApi.getSubscription.mockRejectedValue({ status: 500 });
    billingApi.getUsageLimits.mockRejectedValue(new Error("limits down"));
    billingApi.getBillingSummary.mockRejectedValue(new Error("summary down"));

    render(<Billing currentUser={member} />);

    await waitFor(() => expect(screen.getByText("Failed to load subscription")).toBeInTheDocument());
    expect(screen.queryByText("Usage vs. plan limits")).not.toBeInTheDocument();
  });

});

describe("Billing page Usage tab", () => {
  // Overview data isn't under test here — give it a boring 404/zeroed
  // response so it loads without erroring underneath the Usage tab.
  function stubOverview() {
    billingApi.getSubscription.mockImplementation(notFound);
    billingApi.getUsageLimits.mockImplementation(notFound);
    billingApi.getBillingSummary.mockResolvedValue({
      current_period: null,
      current_usage_cost: "0",
      currency: "usd",
      invoice_count: 0,
      outstanding_amount: "0",
    });
  }

  async function openUsageTab() {
    render(<Billing currentUser={member} />);
    await waitFor(() => expect(screen.getByText(/No active subscription is on record/)).toBeInTheDocument());
    fireEvent.click(screen.getByText("Usage"));
    await waitFor(() => expect(billingApi.getUsageSummary).toHaveBeenCalled());
  }

  it("shows the honest empty state in every section when the org has no usage in the window", async () => {
    stubOverview();
    billingApi.getUsageSummary.mockResolvedValue({
      organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04", services: [],
    });
    billingApi.getCostHistory.mockResolvedValue({
      organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04", currency: "usd", history: [],
    });
    billingApi.getCostBreakdown.mockResolvedValue({
      organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04",
      group_by: "service", currency: "usd", breakdown: {},
    });

    await openUsageTab();

    const emptyMessages = await screen.findAllByText("No usage recorded for this period.");
    expect(emptyMessages).toHaveLength(3);
  });

  it("renders raw usage, daily cost, and cost-by-service rows from the API", async () => {
    stubOverview();
    billingApi.getUsageSummary.mockResolvedValue({
      organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04",
      services: [{ service: "rag", action: "query", resource: "rag.query", unit: "call", quantity: 250 }],
    });
    billingApi.getCostHistory.mockResolvedValue({
      organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04", currency: "usd",
      history: [{ date: "2026-09-01", cost: "3.25" }],
    });
    billingApi.getCostBreakdown.mockResolvedValue({
      organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04",
      group_by: "service", currency: "usd", breakdown: { rag: { quantity: 250, cost: "3.25" } },
    });

    await openUsageTab();

    await waitFor(() => expect(screen.getByText("rag.query")).toBeInTheDocument());
    expect(screen.getByText("250 call")).toBeInTheDocument(); // usage-by-service quantity + unit
    expect(screen.getByText("2026-09-01")).toBeInTheDocument(); // daily cost date
    expect(screen.getAllByText("3.25 USD")).toHaveLength(2); // daily-cost row + cost-by-service row
    expect(screen.getAllByText("rag")).toHaveLength(2); // usage table's service column + breakdown table's group column
  });

  it("surfaces an error when a usage endpoint call fails, without blocking the other sections", async () => {
    stubOverview();
    billingApi.getUsageSummary.mockRejectedValue({});
    billingApi.getCostHistory.mockResolvedValue({
      organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04", currency: "usd",
      history: [{ date: "2026-09-01", cost: "3.25" }],
    });
    billingApi.getCostBreakdown.mockResolvedValue({
      organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04",
      group_by: "service", currency: "usd", breakdown: {},
    });

    await openUsageTab();

    await waitFor(() => expect(screen.getByText("Failed to load usage")).toBeInTheDocument());
    // cost-history still rendered even though the usage-summary call failed
    expect(screen.getByText("2026-09-01")).toBeInTheDocument();
  });

  it("surfaces an error from cost-history alone, leaving usage and cost-breakdown rendered", async () => {
    stubOverview();
    billingApi.getUsageSummary.mockResolvedValue({
      organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04",
      services: [{ service: "rag", action: "query", resource: "rag.query", unit: "call", quantity: 250 }],
    });
    billingApi.getCostHistory.mockRejectedValue(new Error("cost-history unreachable"));
    billingApi.getCostBreakdown.mockResolvedValue({
      organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04",
      group_by: "service", currency: "usd", breakdown: {},
    });

    await openUsageTab();

    await waitFor(() => expect(screen.getByText("cost-history unreachable")).toBeInTheDocument());
    expect(screen.getByText("rag.query")).toBeInTheDocument();
  });

  it("surfaces an error from cost-breakdown alone, leaving usage and cost-history rendered", async () => {
    stubOverview();
    billingApi.getUsageSummary.mockResolvedValue({
      organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04", services: [],
    });
    billingApi.getCostHistory.mockResolvedValue({
      organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04", currency: "usd",
      history: [{ date: "2026-09-01", cost: "3.25" }],
    });
    billingApi.getCostBreakdown.mockRejectedValue(new Error("cost-breakdown unreachable"));

    await openUsageTab();

    await waitFor(() => expect(screen.getByText("cost-breakdown unreachable")).toBeInTheDocument());
    expect(screen.getByText("2026-09-01")).toBeInTheDocument();
  });

  it("uses the summary fallback when subscription and limits succeed", async () => {
    billingApi.getSubscription.mockResolvedValue({ plan_name: "Basic", features: [] });
    billingApi.getUsageLimits.mockResolvedValue({ limits: [] });
    billingApi.getBillingSummary.mockRejectedValue({});

    render(<Billing currentUser={member} />);

    await waitFor(() => expect(screen.getByText("Failed to load billing summary")).toBeInTheDocument());
  });

  it("keeps the first usage error when later usage endpoints also reject", async () => {
    stubOverview();
    billingApi.getUsageSummary.mockRejectedValue(new Error("first usage failure"));
    billingApi.getCostHistory.mockRejectedValue({});
    billingApi.getCostBreakdown.mockRejectedValue({});

    await openUsageTab();

    expect(screen.getByText("first usage failure")).toBeInTheDocument();
  });

  it("does not call getUsageEvents — the per-user log is a deliberate exclusion from this pass", async () => {
    stubOverview();
    billingApi.getUsageSummary.mockResolvedValue({ organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04", services: [] });
    billingApi.getCostHistory.mockResolvedValue({ organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04", currency: "usd", history: [] });
    billingApi.getCostBreakdown.mockResolvedValue({ organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04", group_by: "service", currency: "usd", breakdown: {} });

    await openUsageTab();

    expect(billingApi.getUsageEvents).toBeUndefined();
  });
});

describe("isStripeHostedUrl", () => {
  it("accepts Stripe Checkout and Billing Portal origins", () => {
    expect(isStripeHostedUrl("https://checkout.stripe.com/pay/cs_123")).toBe(true);
    expect(isStripeHostedUrl("https://billing.stripe.com/session/abc")).toBe(true);
  });

  it("rejects everything else, including spoofed hosts, non-https, and malformed URLs", () => {
    expect(isStripeHostedUrl("https://evil.example/checkout.stripe.com")).toBe(false);
    expect(isStripeHostedUrl("https://checkout.stripe.com.evil.example")).toBe(false);
    expect(isStripeHostedUrl("http://checkout.stripe.com/pay")).toBe(false);
    expect(isStripeHostedUrl("not a url")).toBe(false);
  });
});

describe("Billing page Payment method card", () => {
  async function openOverview() {
    render(<Billing currentUser={member} />);
    await waitFor(() => expect(billingApi.getPaymentMethod).toHaveBeenCalledWith("42"));
  }

  it("shows the unavailable note on a 404 payment-method response (the default)", async () => {
    await openOverview();
    await waitFor(() =>
      expect(screen.getByText("Online card payments are not available on this deployment yet.")).toBeInTheDocument()
    );
  });

  it("shows the same unavailable note when stripe_enabled is false", async () => {
    billingApi.getPaymentMethod.mockResolvedValue({
      stripe_enabled: false, can_manage: true, has_payment_method: false, card: null,
    });
    await openOverview();
    await waitFor(() =>
      expect(screen.getByText("Online card payments are not available on this deployment yet.")).toBeInTheDocument()
    );
  });

  it("shows a danger badge on a non-404 payment-method load error", async () => {
    billingApi.getPaymentMethod.mockRejectedValue({ status: 500, message: "payment-method unreachable" });
    await openOverview();
    await waitFor(() => expect(screen.getByText("payment-method unreachable")).toBeInTheDocument());
  });

  it("falls back to a generic message when a load error has none", async () => {
    billingApi.getPaymentMethod.mockRejectedValue({ status: 500 });
    await openOverview();
    await waitFor(() => expect(screen.getByText("Failed to load payment method")).toBeInTheDocument());
  });

  it("renders a blank brand when the card has none", async () => {
    billingApi.getPaymentMethod.mockResolvedValue({
      stripe_enabled: true, can_manage: true, has_payment_method: true,
      card: { brand: "", last4: "4242", exp_month: 9, exp_year: 2027 },
    });
    await openOverview();
    await waitFor(() => expect(screen.getByText("•••• 4242")).toBeInTheDocument());
  });

  it("renders the card on file and Replace card + Manage billing for a billing admin", async () => {
    billingApi.getPaymentMethod.mockResolvedValue({
      stripe_enabled: true, can_manage: true, has_payment_method: true,
      card: { brand: "visa", last4: "4242", exp_month: 9, exp_year: 2027 },
    });
    await openOverview();
    await waitFor(() => expect(screen.getByText("VISA •••• 4242")).toBeInTheDocument());
    expect(screen.getByText("09/2027")).toBeInTheDocument();
    expect(screen.getByText("Replace card")).toBeInTheDocument();
    expect(screen.getByText("Manage billing")).toBeInTheDocument();
  });

  it("renders 'No card on file' and only an Add card button when there is no card yet", async () => {
    billingApi.getPaymentMethod.mockResolvedValue({
      stripe_enabled: true, can_manage: true, has_payment_method: false, card: null,
    });
    await openOverview();
    await waitFor(() => expect(screen.getByText("No card on file for this organization.")).toBeInTheDocument());
    expect(screen.getByText("Add card")).toBeInTheDocument();
    expect(screen.queryByText("Manage billing")).not.toBeInTheDocument();
  });

  it("shows a note instead of action buttons when the caller cannot manage billing", async () => {
    billingApi.getPaymentMethod.mockResolvedValue({
      stripe_enabled: true, can_manage: false, has_payment_method: true,
      card: { brand: "mastercard", last4: "4444", exp_month: 1, exp_year: 2028 },
    });
    await openOverview();
    await waitFor(() => expect(screen.getByText("MASTERCARD •••• 4444")).toBeInTheDocument());
    expect(screen.getByText("Only owners and billing admins can change the payment method.")).toBeInTheDocument();
    expect(screen.queryByText("Replace card")).not.toBeInTheDocument();
    expect(screen.queryByText("Manage billing")).not.toBeInTheDocument();
  });

  it("creates a setup session and opens it via window.electronAPI.openExternal", async () => {
    billingApi.getPaymentMethod.mockResolvedValue({
      stripe_enabled: true, can_manage: true, has_payment_method: false, card: null,
    });
    billingApi.createPaymentSetupSession.mockResolvedValue({ url: "https://checkout.stripe.com/pay/cs_1" });
    window.electronAPI = { openExternal: vi.fn() };
    await openOverview();
    await waitFor(() => expect(screen.getByText("Add card")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Add card"));

    await waitFor(() => expect(window.electronAPI.openExternal).toHaveBeenCalledWith("https://checkout.stripe.com/pay/cs_1"));
    expect(billingApi.createPaymentSetupSession).toHaveBeenCalledWith("42");
  });

  it("falls back to window.api.openExternal when the Electron API is absent", async () => {
    billingApi.getPaymentMethod.mockResolvedValue({
      stripe_enabled: true, can_manage: true, has_payment_method: true,
      card: { brand: "visa", last4: "4242", exp_month: 9, exp_year: 2027 },
    });
    billingApi.createBillingPortalSession.mockResolvedValue({ url: "https://billing.stripe.com/session/xyz" });
    window.api = { openExternal: vi.fn() };
    await openOverview();
    await waitFor(() => expect(screen.getByText("Manage billing")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Manage billing"));

    await waitFor(() => expect(window.api.openExternal).toHaveBeenCalledWith("https://billing.stripe.com/session/xyz"));
  });

  it("falls back to window.location.assign on the web (neither Electron API present)", async () => {
    billingApi.getPaymentMethod.mockResolvedValue({
      stripe_enabled: true, can_manage: true, has_payment_method: false, card: null,
    });
    billingApi.createPaymentSetupSession.mockResolvedValue({ url: "https://checkout.stripe.com/pay/cs_2" });
    const originalLocation = window.location;
    const assignMock = vi.fn();
    // jsdom's real Location#assign isn't configurable enough for vi.spyOn
    // to replace directly — swap the whole object, same pattern used by
    // settings.test.jsx / error-boundary.test.jsx for location.reload.
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, assign: assignMock }, writable: true, configurable: true,
    });
    try {
      await openOverview();
      await waitFor(() => expect(screen.getByText("Add card")).toBeInTheDocument());

      fireEvent.click(screen.getByText("Add card"));

      await waitFor(() => expect(assignMock).toHaveBeenCalledWith("https://checkout.stripe.com/pay/cs_2"));
    } finally {
      Object.defineProperty(window, "location", { value: originalLocation, writable: true, configurable: true });
    }
  });

  it("refuses to open a non-Stripe-hosted URL returned by the server", async () => {
    billingApi.getPaymentMethod.mockResolvedValue({
      stripe_enabled: true, can_manage: true, has_payment_method: false, card: null,
    });
    billingApi.createPaymentSetupSession.mockResolvedValue({ url: "https://evil.example/phish" });
    window.electronAPI = { openExternal: vi.fn() };
    await openOverview();
    await waitFor(() => expect(screen.getByText("Add card")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Add card"));

    await waitFor(() => expect(screen.getByText("Refused to open a non-Stripe-hosted URL")).toBeInTheDocument());
    expect(window.electronAPI.openExternal).not.toHaveBeenCalled();
  });

  it("shows a danger badge when creating a setup session fails", async () => {
    billingApi.getPaymentMethod.mockResolvedValue({
      stripe_enabled: true, can_manage: true, has_payment_method: false, card: null,
    });
    billingApi.createPaymentSetupSession.mockRejectedValue({ status: 503, message: "Stripe is not enabled on this deployment." });
    await openOverview();
    await waitFor(() => expect(screen.getByText("Add card")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Add card"));

    await waitFor(() => expect(screen.getByText("Stripe is not enabled on this deployment.")).toBeInTheDocument());
  });

  it("shows a success notice from ?payment=success and strips it from the URL", async () => {
    billingApi.getPaymentMethod.mockResolvedValue({
      stripe_enabled: true, can_manage: true, has_payment_method: true,
      card: { brand: "visa", last4: "4242", exp_month: 9, exp_year: 2027 },
    });
    window.history.replaceState({}, "", "/billing?payment=success");

    await openOverview();

    await waitFor(() => expect(screen.getByText("Payment method saved.")).toBeInTheDocument());
    expect(window.location.search).toBe("");
  });

  it("shows a cancelled notice from ?payment=cancelled", async () => {
    window.history.replaceState({}, "", "/billing?payment=cancelled");

    await openOverview();

    await waitFor(() => expect(screen.getByText("Card setup was cancelled.")).toBeInTheDocument());
    expect(window.location.search).toBe("");
  });
});
