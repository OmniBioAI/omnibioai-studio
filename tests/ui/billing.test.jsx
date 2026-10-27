import React from "react";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getSubscription: vi.fn(), getUsageLimits: vi.fn(), getBillingSummary: vi.fn(),
  getPaymentMethod: vi.fn(), getInvoices: vi.fn(),
  createPaymentSetupSession: vi.fn(),
  getUsageSummary: vi.fn(), getCostHistory: vi.fn(), getCostBreakdown: vi.fn(),
}));
vi.mock("../../src/ui/lib/billingApi", () => api);
const stripe = vi.hoisted(() => ({ openStripeUrl: vi.fn() }));
vi.mock("../../src/ui/lib/stripePortal", () => stripe);

const session = vi.hoisted(() => ({ getIdentity: vi.fn() }));
vi.mock("../../src/ui/lib/session", async importOriginal => ({ ...(await importOriginal()), ...session }));

import Billing from "../../src/ui/pages/Billing";
import { usageLabel } from "../../src/ui/pages/BillingRedesign";

const member = { orgId: "42", permissions: [] };

beforeEach(() => {
  api.getSubscription.mockReset().mockResolvedValue({ plan_name: "Free", status: "active", start_date: "2026-10-04", billing_interval: "monthly", currency: "usd", features: [] });
  api.getUsageLimits.mockReset().mockResolvedValue({ plan_name: "Free", as_of: "2026-10-01", limits: [
    { service: "api", action: "completed", resource: "literature.answer", unit: "answers", period: "monthly", included: 100, used: 80, percentage_used: 80 },
    { service: "api", action: "completed", resource: "literature.search", unit: "searches", period: "monthly", included: 500, used: 0, percentage_used: 0 },
  ] });
  api.getBillingSummary.mockReset().mockResolvedValue({ current_period: { period_end: "2026-10-31" }, current_usage_cost: "0", currency: "usd", invoice_count: 0, outstanding_amount: "0" });
  api.getPaymentMethod.mockReset().mockResolvedValue({ stripe_enabled: false, can_manage: true, has_payment_method: false, card: null });
  api.createPaymentSetupSession.mockReset().mockResolvedValue({ url: "https://checkout.stripe.com/session" });
  stripe.openStripeUrl.mockReset();
  api.getInvoices.mockReset().mockResolvedValue({ invoices: [], total_count: 0, limit: 50, offset: 0 });
  api.getUsageSummary.mockReset().mockResolvedValue({ services: [] });
  api.getCostHistory.mockReset().mockResolvedValue({ history: [], currency: "usd" });
  api.getCostBreakdown.mockReset().mockResolvedValue({ breakdown: {}, currency: "usd" });
  session.getIdentity.mockReset().mockResolvedValue({
    user: { id: 17, email: "billing-admin@example.org", status: "active" },
    global_roles: [], global_permissions: [],
    organizations: [{ organization_id: "42", organization_name: "Acme Research", roles: ["org_admin"], effective_permissions: [] }],
  });
});
afterEach(cleanup);

describe("Billing redesign", () => {
  it.each([200, 401, 502])("ignores a stale organization billing response (%s) after switching organizations", async status => {
    let finish;
    const pending = new Promise((resolve, reject) => { finish = status === 200 ? resolve : reject; });
    api.getSubscription.mockImplementation(org => org === "42" ? pending : Promise.resolve({ plan_name: "New organization", status: "active" }));
    const { rerender } = render(<Billing currentUser={member} organizationId="42" />);
    rerender(<Billing currentUser={member} organizationId="84" />);
    expect(await screen.findByText("New organization", { selector: ".billing-plan-title strong" })).toBeInTheDocument();
    await act(async () => { finish(status === 200 ? { plan_name: "Private old plan" } : Object.assign(new Error("old request failed"), { status })); await pending.catch(() => {}); });
    expect(screen.queryByText("Private old plan")).not.toBeInTheDocument();
    expect(screen.queryByText("old request failed")).not.toBeInTheDocument();
    expect(screen.getByText("New organization", { selector: ".billing-plan-title strong" })).toBeInTheDocument();
  });
  it("requires sign-in when there is no current user", () => {
    render(<Billing currentUser={null} />);
    expect(screen.getByText("Sign in required")).toBeInTheDocument();
  });

  it("shows the no-organization state and optional Membership action", () => {
    const onMembershipPlans = vi.fn();
    render(<Billing currentUser={{ orgId: null }} onMembershipPlans={onMembershipPlans} />);
    expect(screen.getByText("No organization is associated with this session.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Membership" }));
    expect(onMembershipPlans).toHaveBeenCalledOnce();
  });

  it("renders the organization plan summary and its two local tabs", async () => {
    render(<Billing currentUser={member} />);
    expect(await screen.findByRole("heading", { name: "Organization plan" })).toBeInTheDocument();
    expect(screen.queryByText("Account › Billing")).not.toBeInTheDocument();
    expect(screen.getByText("Plan, payment method and invoices for your organization.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "Usage" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Invoices" })).toBeInTheDocument();
    expect(screen.getByText("You’re on the Free plan. There’s nothing to pay, and no billing period runs until you upgrade.")).toBeInTheDocument();
    expect(screen.getByText("No renewal needed")).toBeInTheDocument();
    expect(screen.getByText("None", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Since Oct 4, 2026")).toBeInTheDocument();
    expect(screen.getByText("Resets Oct 31, 2026")).toBeInTheDocument();
    const summaryBody = document.querySelector(".billing-summary-item .omni-card__body");
    expect(summaryBody).toHaveClass("omni-card__body");
    expect([...summaryBody.children].map(node => node.tagName)).toEqual(["SPAN", "STRONG", "SMALL"]);
    expect(api.getInvoices).toHaveBeenCalledWith("42");
    expect(await screen.findByText("No invoices yet")).toBeInTheDocument();
  });

  it("uses the configured readable usage labels and shows amber at 80 percent", async () => {
    render(<Billing currentUser={member} />);
    expect(await screen.findByText("Literature answers")).toBeInTheDocument();
    expect(screen.getByText("80 of 100 answers")).toBeInTheDocument();
    expect(screen.getByText("Literature searches")).toBeInTheDocument();
    expect(document.querySelector(".billing-progress--amber")).toBeTruthy();
    expect(usageLabel({ service: "api", action: "completed", resource: "literature.answer" })).toBe("Literature answers");
  });

  it("uses the organization selected by the Account shell", async () => {
    render(<Billing currentUser={member} organizationId="84" />);
    await waitFor(() => expect(api.getSubscription).toHaveBeenCalledWith("84"));
    expect(screen.queryByRole("combobox", { name: "Organization" })).not.toBeInTheDocument();
  });

  it("renders invoice fields and reports that PDF URLs are not supplied", async () => {
    api.getInvoices.mockResolvedValue({ invoices: [{ id: 12, invoice_number: "INV-12", created_at: "2026-09-30", status: "paid", total: "25.00", currency: "usd" }] });
    render(<Billing currentUser={member} />);
    await screen.findByRole("heading", { name: "Organization plan" });
    fireEvent.click(screen.getByRole("tab", { name: "Invoices" }));
    expect(await screen.findByText("INV-12")).toBeInTheDocument();
    expect(screen.queryByText("PDF unavailable")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /PDF|download/i })).not.toBeInTheDocument();
    expect(screen.getByText("Outstanding balance")).toBeInTheDocument();
  });

  it("keeps aggregate usage and cost reports on the Usage tab", async () => {
    api.getUsageSummary.mockResolvedValue({ services: [{ service: "rag", action: "query", resource: "rag.query", quantity: 2, unit: "calls" }] });
    api.getCostHistory.mockResolvedValue({ history: [{ date: "2026-10-20", cost: "1.25" }], currency: "usd" });
    api.getCostBreakdown.mockResolvedValue({ breakdown: { rag: { quantity: 2, cost: "1.25" } }, currency: "usd" });
    render(<Billing currentUser={member} view="usage" />);
    expect(await screen.findByRole("table", { name: "Usage by service" })).toBeInTheDocument();
    expect(screen.getByText("Rag Query")).toBeInTheDocument();
    expect(screen.getByText("Oct 20, 2026")).toBeInTheDocument();
    expect(api.getUsageSummary).toHaveBeenCalledWith("42", expect.any(String), expect.any(String));
  });

  it("gates payment actions on billing permission and shows the environment state", async () => {
    render(<Billing currentUser={member} />);
    expect(await screen.findByText("Payments aren’t set up in this environment.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add payment method" })).toBeDisabled();
    api.getPaymentMethod.mockResolvedValue({ stripe_enabled: true, can_manage: false, has_payment_method: false, card: null });
    cleanup();
    render(<Billing currentUser={member} />);
    await screen.findByText("You have read-only access to billing.");
    expect(screen.queryByRole("button", { name: "Add payment method" })).not.toBeInTheDocument();
  });

  it("shows payment actions solely from the billing API authorization result", async () => {
    api.getPaymentMethod.mockResolvedValue({ stripe_enabled: true, can_manage: true, has_payment_method: false, card: null });
    session.getIdentity.mockResolvedValue({ user: { id: 18, email: "member@example.org", status: "active" }, global_roles: [], global_permissions: [], organizations: [{ organization_id: "42", organization_name: "Acme Research", roles: ["org_member"], effective_permissions: [] }] });
    render(<Billing currentUser={member} />);
    expect(await screen.findByRole("button", { name: "Add payment method" })).toBeInTheDocument();
    expect(screen.queryByText("You have read-only access to billing.")).not.toBeInTheDocument();
  });

  it("hides actions when the billing API says can_manage is false", async () => {
    api.getPaymentMethod.mockResolvedValue({ stripe_enabled: true, can_manage: false, has_payment_method: true, card: { brand: "visa", last4: "4242" } });
    render(<Billing currentUser={member} />);
    expect((await screen.findAllByText("Visa ···· 4242")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /payment method/i })).not.toBeInTheDocument();
    expect(screen.getByText("You have read-only access to billing.")).toBeInTheDocument();
  });

  it("shows payment actions for the platform owner when Billing grants manage_all_orgs", async () => {
    api.getPaymentMethod.mockResolvedValue({ stripe_enabled: true, can_manage: true, has_payment_method: false, card: null });
    session.getIdentity.mockResolvedValue({
      user: { id: 7, email: "manish@omnibioai.org", status: "active" },
      global_roles: [{ id: 1, name: "admin" }, { id: 2, name: "platform_admin" }],
      global_permissions: ["manage_all_orgs"],
      organizations: [],
    });
    render(<Billing currentUser={member} />);
    expect(await screen.findByRole("button", { name: "Add payment method" })).toBeInTheDocument();
    expect(document.querySelector(".billing-org")).toBeNull();
    expect(screen.queryByText(/unavailable|loading/i)).not.toBeInTheDocument();
  });

  it("uses the plan name and status as the plan card heading", async () => {
    render(<Billing currentUser={member} />);
    await screen.findByRole("heading", { name: "Organization plan" });
    expect(screen.queryByRole("heading", { name: "Plan" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Free Active" })).toBeInTheDocument();
    expect(screen.getByText("Free", { selector: ".billing-plan-title strong" })).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("omits the organization header when /auth/me has no name for the selected organization", async () => {
    session.getIdentity.mockResolvedValue({
      user: { id: 18, email: "member@example.org", status: "active" }, global_roles: [], global_permissions: [],
      organizations: [{ organization_id: "42", roles: ["org_admin"], effective_permissions: [] }],
    });
    render(<Billing currentUser={member} />);
    await screen.findByRole("heading", { name: "Organization plan" });
    expect(document.querySelector(".billing-org")).toBeNull();
    expect(screen.queryByText(/organization name unavailable|organization details loading/i)).not.toBeInTheDocument();
  });

  it("starts the hosted Checkout setup session without rendering an inactive card form", async () => {
    api.getPaymentMethod.mockResolvedValue({ stripe_enabled: true, can_manage: true, has_payment_method: false, card: null });
    const stripeTab = { opener: {}, document: { title: "", body: { textContent: "" } }, closed: false };
    vi.spyOn(window, "open").mockReturnValue(stripeTab);
    render(<Billing currentUser={member} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add payment method" }));
    await waitFor(() => expect(api.createPaymentSetupSession).toHaveBeenCalledWith("42"));
    expect(stripe.openStripeUrl).toHaveBeenCalledWith("https://checkout.stripe.com/session", expect.anything());
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/card number|cvc/i)).not.toBeInTheDocument();
    expect(screen.getByText("Payments secured by Stripe.")).toBeInTheDocument();
  });

  it("shows a billing error message instead of a blank page when an API fails", async () => {
    api.getSubscription.mockRejectedValue(new Error("Billing service unavailable"));
    render(<Billing currentUser={member} />);
    expect(await screen.findByText("Some billing details could not be loaded. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Organization plan" })).toBeInTheDocument();
  });

  describe("never renders server error text", () => {
    const RAW = "psycopg2.OperationalError: could not connect to server at 10.0.0.12:5432\nTraceback (most recent call last): File \"/app/views.py\", line 42";
    const serverError = (status = 500) => Object.assign(new Error(RAW), { status });
    const expectNoRawText = () => {
      const text = document.body.textContent;
      for (const fragment of ["psycopg2", "10.0.0.12", "Traceback", "/app/views.py", "OperationalError"]) expect(text).not.toContain(fragment);
    };

    it("shows one safe message when several overview requests fail with server details", async () => {
      for (const call of [api.getSubscription, api.getUsageLimits, api.getBillingSummary, api.getPaymentMethod, api.getInvoices]) call.mockRejectedValue(serverError());
      render(<Billing currentUser={member} />);
      expect(await screen.findByText("The service is temporarily unavailable. Please try again later.")).toBeInTheDocument();
      expect(screen.getAllByText("The service is temporarily unavailable. Please try again later.")).toHaveLength(1);
      expectNoRawText();
    });

    it("uses the generic fallback for failures without a known status", async () => {
      api.getInvoices.mockRejectedValue(new Error(RAW));
      render(<Billing currentUser={member} />);
      expect(await screen.findByText("Some billing details could not be loaded. Please try again.")).toBeInTheDocument();
      expectNoRawText();
    });

    it("keeps Checkout setup failures generic", async () => {
      api.getPaymentMethod.mockResolvedValue({ stripe_enabled: true, can_manage: true, has_payment_method: false, card: null });
      api.createPaymentSetupSession.mockRejectedValue(new Error(RAW));
      const stripeTab = { opener: {}, document: { title: "", body: { textContent: "" } }, closed: false, close: vi.fn() };
      vi.spyOn(window, "open").mockReturnValue(stripeTab);
      render(<Billing currentUser={member} />);
      fireEvent.click(await screen.findByRole("button", { name: "Add payment method" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Could not start secure Checkout. Please try again.");
      expectNoRawText();
    });

    it("keeps Usage report failures generic", async () => {
      api.getUsageSummary.mockRejectedValue(serverError(502));
      api.getCostHistory.mockRejectedValue(serverError(503));
      api.getCostBreakdown.mockRejectedValue(new Error(RAW));
      render(<Billing currentUser={member} view="usage" />);
      expect(await screen.findByText("The service is temporarily unavailable. Please try again later.")).toBeInTheDocument();
      expect(screen.getByText("Usage reporting unavailable.")).toBeInTheDocument();
      expectNoRawText();
    });
  });
});
