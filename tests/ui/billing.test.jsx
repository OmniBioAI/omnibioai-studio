import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const billingApi = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  getUsageLimits: vi.fn(),
  getBillingSummary: vi.fn(),
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
