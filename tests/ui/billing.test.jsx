import React from "react";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
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
  api.getSubscription.mockReset().mockResolvedValue({ plan_name: "Free", status: "active", start_date: "2026-01-10", billing_interval: "monthly", currency: "usd", features: [] });
  api.getUsageLimits.mockReset().mockResolvedValue({ plan_name: "Free", as_of: "2026-10-01", limits: [
    { service: "api", action: "completed", resource: "literature.answer", unit: "answers", period: "monthly", included: 100, used: 80, percentage_used: 80 },
    { service: "api", action: "completed", resource: "literature.search", unit: "searches", period: "monthly", included: 500, used: 0, percentage_used: 0 },
  ] });
  api.getBillingSummary.mockReset().mockResolvedValue({ current_period: null, current_usage_cost: "0", currency: "usd", invoice_count: 0, outstanding_amount: "0" });
  api.getPaymentMethod.mockReset().mockResolvedValue({ stripe_enabled: false, can_manage: true, has_payment_method: false, card: null });
  api.createPaymentSetupSession.mockReset().mockResolvedValue({ url: "https://checkout.stripe.com/session" });
  stripe.openStripeUrl.mockReset();
  api.getInvoices.mockReset().mockResolvedValue({ invoices: [], total_count: 0, limit: 50, offset: 0 });
  api.getUsageSummary.mockReset().mockResolvedValue({ services: [] });
  api.getCostHistory.mockReset().mockResolvedValue({ history: [], currency: "usd" });
  api.getCostBreakdown.mockReset().mockResolvedValue({ breakdown: {}, currency: "usd" });
  session.getIdentity.mockReset().mockResolvedValue({ organizations: [{ organization_id: "42", organization_name: "Acme Research", roles: ["org_admin"] }] });
});
afterEach(cleanup);

describe("Billing redesign", () => {
  it("renders the organization identity, Free summary and three requested tabs", async () => {
    render(<Billing currentUser={member} />);
    expect(await screen.findByText("Acme Research")).toBeInTheDocument();
    expect(screen.getByText("Account › Billing")).toBeInTheDocument();
    expect(screen.getByText("Plan, usage and invoices for your organization.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Invoices" })).toBeInTheDocument();
    expect(screen.getByText("You’re on the Free plan. There’s nothing to pay, and no billing period runs until you upgrade.")).toBeInTheDocument();
    expect(screen.getByText("No renewal needed")).toBeInTheDocument();
    expect(screen.getByText("None", { selector: "strong" })).toBeInTheDocument();
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

  it("shows an organization switcher only for multiple memberships", async () => {
    session.getIdentity.mockResolvedValue({ organizations: [
      { organization_id: "42", organization_name: "Acme Research" },
      { organization_id: "84", organization_name: "Beta Lab" },
    ] });
    render(<Billing currentUser={member} />);
    const select = await screen.findByRole("combobox", { name: "Organization" });
    fireEvent.change(select, { target: { value: "84" } });
    await waitFor(() => expect(api.getSubscription).toHaveBeenCalledWith("84"));
  });

  it("renders invoice fields and reports that PDF URLs are not supplied", async () => {
    api.getInvoices.mockResolvedValue({ invoices: [{ id: 12, invoice_number: "INV-12", created_at: "2026-09-30", status: "paid", total: "25.00", currency: "usd" }] });
    render(<Billing currentUser={member} />);
    await screen.findByText("Acme Research");
    fireEvent.click(screen.getByRole("tab", { name: "Invoices" }));
    expect(await screen.findByText("INV-12")).toBeInTheDocument();
    expect(screen.getByText("PDF unavailable")).toBeInTheDocument();
    expect(screen.getByText("Outstanding balance")).toBeInTheDocument();
  });

  it("keeps aggregate usage and cost reports on the Usage tab", async () => {
    api.getUsageSummary.mockResolvedValue({ services: [{ service: "rag", action: "query", resource: "rag.query", quantity: 2, unit: "calls" }] });
    api.getCostHistory.mockResolvedValue({ history: [{ date: "2026-10-20", cost: "1.25" }], currency: "usd" });
    api.getCostBreakdown.mockResolvedValue({ breakdown: { rag: { quantity: 2, cost: "1.25" } }, currency: "usd" });
    render(<Billing currentUser={member} />);
    await screen.findByText("Acme Research");
    fireEvent.click(screen.getByRole("tab", { name: "Usage" }));
    expect(await screen.findByRole("table", { name: "Usage by service" })).toBeInTheDocument();
    expect(screen.getByText("Rag Query")).toBeInTheDocument();
    expect(screen.getByText("2026-10-20")).toBeInTheDocument();
    expect(api.getUsageSummary).toHaveBeenCalledWith("42", expect.any(String), expect.any(String));
  });

  it("gates payment actions on billing permission and shows the environment state", async () => {
    render(<Billing currentUser={member} />);
    expect(await screen.findByText("Payments aren’t set up in this environment.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add payment method" })).toBeDisabled();
    api.getPaymentMethod.mockResolvedValue({ stripe_enabled: true, can_manage: false, has_payment_method: false, card: null });
    cleanup();
    render(<Billing currentUser={member} />);
    await screen.findByText("Only organization billing admins can change payment methods.");
    expect(screen.queryByRole("button", { name: "Add payment method" })).not.toBeInTheDocument();
  });

  it("hides payment actions from a non-admin even if the billing response is misconfigured", async () => {
    api.getPaymentMethod.mockResolvedValue({ stripe_enabled: true, can_manage: true, has_payment_method: false, card: null });
    session.getIdentity.mockResolvedValue({ organizations: [{ organization_id: "42", organization_name: "Acme Research", roles: ["org_member"] }] });
    render(<Billing currentUser={member} />);
    await screen.findByText("Only organization billing admins can change payment methods.");
    expect(screen.queryByRole("button", { name: "Add payment method" })).not.toBeInTheDocument();
  });

  it("hides actions when the billing API says can_manage is false", async () => {
    api.getPaymentMethod.mockResolvedValue({ stripe_enabled: true, can_manage: false, has_payment_method: true, card: { brand: "visa", last4: "4242" } });
    render(<Billing currentUser={member} />);
    expect((await screen.findAllByText("Visa ···· 4242")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /payment method/i })).not.toBeInTheDocument();
    expect(screen.getByText("Only organization billing admins can change payment methods.")).toBeInTheDocument();
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
    expect(await screen.findByText("Billing service unavailable")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Billing" })).toBeInTheDocument();
  });
});
