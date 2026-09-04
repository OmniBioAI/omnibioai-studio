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
}));
vi.mock("../../src/ui/lib/billingApi", () => billingApi);

import Billing from "../../src/ui/pages/Billing";

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
    billingApi.getUsageSummary.mockRejectedValue(new Error("usage-service unreachable"));
    billingApi.getCostHistory.mockResolvedValue({
      organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04", currency: "usd",
      history: [{ date: "2026-09-01", cost: "3.25" }],
    });
    billingApi.getCostBreakdown.mockResolvedValue({
      organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04",
      group_by: "service", currency: "usd", breakdown: {},
    });

    await openUsageTab();

    await waitFor(() => expect(screen.getByText("usage-service unreachable")).toBeInTheDocument());
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

  it("does not call getUsageEvents — the per-user log is a deliberate exclusion from this pass", async () => {
    stubOverview();
    billingApi.getUsageSummary.mockResolvedValue({ organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04", services: [] });
    billingApi.getCostHistory.mockResolvedValue({ organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04", currency: "usd", history: [] });
    billingApi.getCostBreakdown.mockResolvedValue({ organization_id: 42, period_start: "2026-08-06", period_end: "2026-09-04", group_by: "service", currency: "usd", breakdown: {} });

    await openUsageTab();

    expect(billingApi.getUsageEvents).toBeUndefined();
  });
});
