import React, { useEffect, useRef, useState } from "react";
import { Badge, Card, Spinner } from "@omnibioai/ui";
import * as billingApi from "../lib/billingApi";
import { openStripeUrl } from "../lib/stripePortal";
import "./AccountPlan.css";

// Read-mostly personal view of the organization's own subscription — backed
// by the exact same canonical omnibioai-billing endpoints Billing.jsx (the
// admin-facing page) already uses: GET /billing/organizations/{orgId}/
// subscription and /summary. Both are readable by any active org member
// (get_authorized_organization_id only checks the caller's JWT org_id
// claim, not a specific permission — see omnibioai-billing's app/core/
// iam.py), which is what makes this a safe, truthful personal-Account
// surface rather than an admin-only one.
//
// Deliberately NOT shown: GET .../subscription/usage-limits. That endpoint
// is real and org-scoped, but per-dimension usage numbers read too close to
// the Usage UI this campaign explicitly defers (IAM-client usage
// aggregation isn't qualified yet) — omitted here to avoid any appearance
// of being that surface. Billing.jsx's own Usage tab remains the real,
// already-shipped place for usage/cost reporting.
const STATUS_VARIANT = {
  active: "success",
  trial: "info",
  trialing: "info",
  suspended: "warning",
  past_due: "warning",
  cancelled: "danger",
  canceled: "danger",
};

function formatDate(iso) {
  if (!iso) return "—";
  return String(iso).slice(0, 10);
}

function money(value, currency) {
  const n = Number(value ?? 0);
  const amount = Number.isFinite(n) ? n.toFixed(2) : "0.00";
  return `${amount} ${String(currency || "usd").toUpperCase()}`;
}

function featureValue(f) {
  switch (f.value_type) {
    case "boolean": return f.bool_value ? "Enabled" : "Disabled";
    case "integer": return f.int_value == null ? "—" : String(f.int_value);
    case "unlimited": return "Unlimited";
    case "string": return f.string_value || "—";
    default: return "—";
  }
}

// A 404 ("no active subscription") is already resolved to subscription:
// null, status: "success" in the effect below -- it never reaches here.
function errorMessage(error) {
  if (error?.status === 401 || error?.status === 403) return "This request could not be authorized. Reopen Studio and retry.";
  return "Your organization's plan is unavailable right now. Please retry.";
}

export default function AccountPlan({ currentUser, onMembershipPlans }) {
  if (!currentUser) return <p role="status">Sign in to view your organization's plan.</p>;
  if (!currentUser.orgId) return <p role="status">An authenticated organization context is required to view plan details.</p>;
  return <PlanView key={`${currentUser.userId}:${currentUser.orgId}`} orgId={currentUser.orgId} onMembershipPlans={onMembershipPlans} />;
}

function PlanView({ orgId, onMembershipPlans }) {
  const [state, setState] = useState({ status: "loading", subscription: null, summary: null, error: null });
  const [canManage, setCanManage] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState({ status: "loading", data: null });
  const [reload, setReload] = useState(0);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading", subscription: null, summary: null, error: null });
    Promise.all([
      billingApi.getSubscription(orgId).catch(err => { if (err.status !== 404) throw err; return null; }),
      billingApi.getBillingSummary(orgId),
    ]).then(([subscription, summary]) => {
      if (!controller.signal.aborted) setState({ status: "success", subscription, summary, error: null });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ status: "error", subscription: null, summary: null, error });
    });
    setCanManage(false);
    setPaymentMethod({ status: "loading", data: null });
    billingApi.getPaymentMethod(orgId).then(data => {
      if (!controller.signal.aborted) {
        setCanManage(!!data?.can_manage);
        setPaymentMethod({ status: "success", data });
      }
    }).catch(() => { if (!controller.signal.aborted) setPaymentMethod({ status: "error", data: null }); });
    return () => controller.abort();
  }, [orgId, reload]);

  async function manageSubscription() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPortalBusy(true);
    setPortalError("");
    try {
      const { url } = await billingApi.createBillingPortalSession(orgId);
      openStripeUrl(url);
    } catch (err) {
      setPortalError(err.message || "That action failed. Please try again.");
    } finally {
      inFlight.current = false;
      setPortalBusy(false);
    }
  }

  const friendlyError = state.status === "error" ? errorMessage(state.error) : null;

  return (
    <section className="account-plan" aria-labelledby="plan-heading">
      <header>
        <h2 id="plan-heading">Plan</h2>
        <p>This is your <strong>organization&rsquo;s</strong> plan, not a personal plan or quota — every member of your organization shares it.</p>
      </header>
      <Card title="Organization plan">
        {state.status === "loading" && <p role="status"><Spinner size="sm" /> Loading organization plan…</p>}
        {state.status === "error" && friendlyError && <><p role="alert">{friendlyError}</p><button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" onClick={() => setReload(v => v + 1)}>Retry</button></>}
        {state.status === "success" && !state.subscription && <p>Your organization has no active subscription.</p>}
        {state.status === "success" && state.subscription && (() => {
          const sub = state.subscription;
          const variant = STATUS_VARIANT[sub.status] || "neutral";
          return <>
            <dl className="plan-summary">
              <div><dt>Plan</dt><dd>{sub.plan_name || "—"}</dd></div>
              <div><dt>Status</dt><dd><Badge variant={variant}>{sub.status || "unknown"}</Badge></dd></div>
              <div><dt>Billing interval</dt><dd>{sub.billing_interval || "—"}</dd></div>
              <div><dt>Started</dt><dd>{formatDate(sub.start_date)}</dd></div>
              <div><dt>Renews</dt><dd>{formatDate(sub.renewal_date)}</dd></div>
              {sub.end_date && <div><dt>Ends</dt><dd>{formatDate(sub.end_date)}</dd></div>}
            </dl>
            {sub.features?.length > 0 && <>
              <h3>Organization entitlements</h3>
              <ul className="plan-features">{sub.features.map(f => <li key={f.feature_key}><span>{f.feature_key.replaceAll("_", " ")}</span><span>{featureValue(f)}</span></li>)}</ul>
            </>}
          </>;
        })()}
      </Card>
      <Card title="Organization billing summary">
        {state.status === "loading" && <p role="status"><Spinner size="sm" /> Loading billing summary…</p>}
        {state.status === "success" && state.summary && (
          <dl className="plan-summary">
            <div><dt>Current period</dt><dd>{state.summary.current_period ? `${formatDate(state.summary.current_period.period_start)} – ${formatDate(state.summary.current_period.period_end)}` : "No active billing period"}</dd></div>
            <div><dt>Usage cost this period</dt><dd>{money(state.summary.current_usage_cost, state.summary.currency)}</dd></div>
            <div><dt>Invoices</dt><dd>{state.summary.invoice_count ?? 0}</dd></div>
            <div><dt>Outstanding balance</dt><dd>{money(state.summary.outstanding_amount, state.summary.currency)}</dd></div>
          </dl>
        )}
      </Card>
      <Card title="Organization subscription details">
        <dl className="plan-summary">
          <div><dt>Ownership</dt><dd>ORGANIZATION</dd></div>
          <div><dt>Billing account</dt><dd>{paymentMethod.status === "loading" ? "Loading…" : paymentMethod.status === "error" ? "Unavailable" : paymentMethod.data?.has_payment_method && paymentMethod.data?.card ? `${paymentMethod.data.card.brand || "Card"} ending in ${paymentMethod.data.card.last4}` : paymentMethod.data?.stripe_enabled ? "No payment method on file" : "Online billing unavailable"}</dd></div>
          <div><dt>Licensed members</dt><dd>Unavailable — Billing does not report member counts.</dd></div>
          <div><dt>Seat allowance</dt><dd>{seatAllowance(state.subscription)}</dd></div>
        </dl>
      </Card>
      <Card title="Organization storage">
        <dl className="plan-summary">
          <div><dt>Ownership scope</dt><dd>ORGANIZATION — separate from personal managed storage</dd></div>
          <div><dt>Configured provider</dt><dd>Unavailable — no organization storage configuration API is connected.</dd></div>
          <div><dt>Connection health</dt><dd>Unavailable — no storage health API is connected.</dd></div>
        </dl>
        <p className="plan-note">Planned customer-owned options: AWS S3, Google Cloud Storage, Azure Blob, S3-compatible storage, and an on-premises storage gateway. This page does not configure credentials, gateways, or transfers.</p>
      </Card>
      {onMembershipPlans && <div className="plan-actions"><button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" onClick={onMembershipPlans}>Upgrade individual plan</button></div>}
      {canManage && (
        <div className="plan-actions">
          <button type="button" className="omni-btn omni-btn--primary omni-btn--sm" disabled={portalBusy} onClick={manageSubscription}>
            {portalBusy ? "Opening billing portal…" : "Manage subscription"}
          </button>
          <p className="plan-note">Opens Stripe&rsquo;s hosted billing portal for your organization. Card details are never entered into OmniBioAI.</p>
          {portalError && <p role="alert">{portalError}</p>}
        </div>
      )}
      {!canManage && state.status === "success" && <p className="plan-note">Contact an organization billing administrator to make changes to this plan.</p>}
    </section>
  );
}

function seatAllowance(subscription) {
  const feature = subscription?.features?.find(item => ["max_users", "seats", "seat_allowance"].includes(item.feature_key));
  if (!feature) return "Unavailable — no seat allowance is present in the subscription record.";
  return featureValue(feature);
}
