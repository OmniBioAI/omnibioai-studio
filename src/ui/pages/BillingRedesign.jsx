import React, { useEffect, useState } from "react";
import { Badge, Button, Card, ProgressBar, Spinner } from "@omnibioai/ui";
import Login from "../components/Login";
import AccountState from "../components/AccountState";
import * as billingApi from "../lib/billingApi";
import { safeErrorMessage } from "../lib/safeErrorMessage";
import { openStripeUrl } from "../lib/stripePortal";
import "./BillingRedesign.css";

const labels = {
  "api.completed.literature.answer": "Literature answers",
  "api.completed.literature.search": "Literature searches",
  "api.completed.literature.answers": "Literature answers",
  "api.completed.literature.searches": "Literature searches",
  "literature.answer": "Literature answers",
  "literature.search": "Literature searches",
};

function humanize(value = "") {
  return String(value).replace(/[._-]+/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

export function usageLabel(row) {
  return labels[`${row.service}.${row.action}.${row.resource}`]
    || labels[row.resource]
    || humanize(row.resource || `${row.service} ${row.action}`);
}

function date(value, fallback = "—") {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return fallback;
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(Number(year), Number(month) - 1, Number(day)));
}

function amount(value, currency = "USD") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: String(currency || "USD").toUpperCase() }).format(number);
}

function valueForLimit(row) {
  const used = Number(row.used);
  const cap = Number(row.included);
  if (!Number.isFinite(used) || !Number.isFinite(cap)) return null;
  return { used, cap, percent: Number.isFinite(Number(row.percentage_used)) ? Number(row.percentage_used) : (cap > 0 ? used / cap * 100 : 0) };
}

export default function BillingRedesign({ currentUser, organizationId, view = "billing", onMembershipPlans, onStorage }) {
  if (!currentUser) return <Login title="Sign in required" description="Billing information requires an authenticated OmniBioAI account." />;
  const orgId = organizationId || currentUser.orgId;
  if (orgId == null) {
    return <section className="billing-page"><header><h1>Organization plan</h1><p>Plan and invoices for your organization.</p></header><Card><p>No organization is associated with this session.</p></Card>{onMembershipPlans && <Button variant="secondary" onClick={onMembershipPlans}>Membership</Button>}</section>;
  }
  return <BillingDashboard key={`${orgId}:${view}`} orgId={orgId} view={view} onMembershipPlans={onMembershipPlans} onStorage={onStorage} />;
}

function BillingDashboard({ orgId, view, onMembershipPlans, onStorage }) {
  const [state, setState] = useState({ loading: true, subscription: null, limits: null, summary: null, payment: null, invoices: null, errors: [] });
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState("overview");
  const [paymentAction, setPaymentAction] = useState({ pending: false, error: "" });
  useEffect(() => {
    let active = true;
    Promise.allSettled([
      billingApi.getSubscription(orgId),
      billingApi.getUsageLimits(orgId),
      billingApi.getBillingSummary(orgId),
      billingApi.getPaymentMethod(orgId),
      billingApi.getInvoices(orgId),
    ]).then(results => {
      if (!active) return;
      const [subscription, limits, summary, payment, invoices] = results;
      // Never render server-provided text: it can carry tracebacks or internal hosts.
      const errors = [...new Set(results
        .filter(result => result.status === "rejected" && result.reason?.status !== 404)
        .map(result => safeErrorMessage(result.reason, "Some billing details could not be loaded. Please try again.")))];
      setState({
        loading: false,
        subscription: subscription.status === "fulfilled" ? subscription.value : null,
        limits: limits.status === "fulfilled" ? limits.value : null,
        summary: summary.status === "fulfilled" ? summary.value : null,
        payment: payment.status === "fulfilled" ? payment.value : null,
        invoices: invoices.status === "fulfilled" ? invoices.value : null,
        errors,
      });
    });
    return () => { active = false; };
  }, [orgId, reload]);
  const retryBilling = () => setReload(value => value + 1);

  const { subscription, limits, summary, payment, invoices } = state;
  const isFree = String(subscription?.plan_name || "").toLowerCase() === "free";
  const renewalDate = subscription?.renewal_date;
  const usageRows = limits?.limits || [];
  const activeTab = (next) => setTab(next);

  if (state.loading) return <section className="billing-page" aria-busy="true"><div className="billing-loading"><Spinner size="sm" /> Loading billing details…</div></section>;
  async function startPaymentSetup() {
    if (paymentAction.pending) return;
    // Reserve the browser tab synchronously so popup blocking does not lose
    // the hosted Checkout handoff after the API request completes.
    const canOpenExternally = Boolean(window.electronAPI?.openExternal || window.api?.openExternal);
    const stripeTab = canOpenExternally ? null : window.open("about:blank", "_blank");
    if (stripeTab) {
      stripeTab.opener = null;
      stripeTab.document.title = "Opening secure Stripe Checkout…";
      stripeTab.document.body.textContent = "Opening secure Stripe Checkout…";
    } else if (!canOpenExternally) {
      setPaymentAction({ pending: false, error: "Allow pop-ups to continue to secure Stripe Checkout." });
      return;
    }
    setPaymentAction({ pending: true, error: "" });
    try {
      const { url } = await billingApi.createPaymentSetupSession(orgId);
      openStripeUrl(url, stripeTab);
    } catch (error) {
      if (stripeTab && !stripeTab.closed) stripeTab.close();
      setPaymentAction({ pending: false, error: safeErrorMessage(error, "Could not start secure Checkout. Please try again.") });
      return;
    }
    setPaymentAction({ pending: false, error: "" });
  }

  if (view === "usage") return <main className="billing-page">
    <header className="billing-header"><div><h1>Usage</h1><p className="billing-subtitle">Request limits and metered costs for your organization.</p></div></header>
    <UsageDetails orgId={orgId} rows={usageRows} summary={summary} />
  </main>;

  return <main className="billing-page">
    <header className="billing-header">
      <div><h1>Organization plan</h1><p className="billing-subtitle">Plan, payment method and invoices for your organization.</p></div>
    </header>
    <p className="billing-cross-link">Looking for your personal storage? <a href="/studio/account/membership-storage" onClick={event => { if (onMembershipPlans) { event.preventDefault(); onMembershipPlans(); } }}>View Membership &amp; storage</a></p>

    {state.errors.map((error, index) => <AccountState key={`${index}-${error}`} variant="error" title="Couldn’t load billing details" onRetry={retryBilling}>{error}</AccountState>)}
    <section className="billing-summary" aria-label="Billing summary">
      <SummaryItem label="Organization plan" value={subscription?.plan_name || "No active plan"} detail={subscription?.start_date ? `Since ${date(subscription.start_date)}` : "Start date not provided"} />
      <SummaryItem label="This month" value={summary ? amount(summary.outstanding_amount, summary.currency) : "—"} detail="Amount due" />
      <SummaryItem label="Next invoice" value={isFree ? "None" : date(renewalDate)} detail={isFree ? "Free plan" : "Based on renewal date"} />
      <SummaryItem label="Payment method" value={payment?.has_payment_method && payment.card ? `${humanize(payment.card.brand)} ···· ${payment.card.last4}` : "Not set"} detail={payment?.has_payment_method && payment.card ? `Expires ${String(payment.card.exp_month).padStart(2, "0")}/${payment.card.exp_year}` : ""} />
    </section>

    <nav className="billing-tabs" aria-label="Billing sections" role="tablist">
      {["overview", "invoices"].map(name => <button type="button" role="tab" aria-selected={tab === name} className={tab === name ? "is-active" : ""} key={name} onClick={() => activeTab(name)}>{humanize(name)}</button>)}
    </nav>

    {tab === "overview" && <section className="billing-grid">
      <div className="billing-column">
        <Card className="billing-card"><h2 className="billing-plan-title" aria-label={subscription ? `${subscription.plan_name} Active` : "No active subscription"}><strong>{subscription?.plan_name || "No active subscription"}</strong>{subscription && <Badge variant="success">Active</Badge>}</h2>
          <p>{isFree ? "You’re on the Free plan. There’s nothing to pay, and no billing period runs until you upgrade." : subscription ? `Your organization’s ${subscription.plan_name} plan is active.` : "No active subscription is recorded for this organization."}</p>
          <dl className="billing-facts">
            <div><dt>Started</dt><dd>{date(subscription?.start_date)}</dd></div>
            <div><dt>Billing cycle</dt><dd>{subscription ? `${humanize(subscription.billing_interval || "—")} · ${String(subscription.currency || "—").toUpperCase()}` : "—"}</dd></div>
            <div><dt>Renews</dt><dd>{isFree ? "No renewal needed" : date(subscription?.renewal_date)}</dd></div>
          </dl>
          {onMembershipPlans && <Button variant="secondary" onClick={onMembershipPlans}>Compare plans</Button>}
        </Card>

        <Card className="billing-card"><h2>Usage</h2>
          {usageRows.length ? <div className="billing-usage-rows">{usageRows.map((row, index) => {
            const usage = valueForLimit(row);
            if (!usage) return <AccountState key={index} variant="error" title={`Couldn’t load ${usageLabel(row)}`} onRetry={retryBilling}>The organization usage limit failed to load.</AccountState>;
            const amber = usage.percent >= 80;
            return <div className="billing-usage-row" key={`${row.service}-${row.action}-${row.resource}-${index}`}>
              <div className="billing-usage-label"><strong>{usageLabel(row)}</strong><span>{usage.used} of {usage.cap}{row.unit ? ` ${row.unit}` : ""}</span></div>
              <div className={amber ? "billing-progress billing-progress--amber" : "billing-progress"}><ProgressBar value={usage.percent} variant={amber ? "warning" : "accent"} /></div>
            </div>;
          })}</div> : <p>Usage limits are not available for this plan.</p>}
          <p className="billing-muted">Resets {summary?.current_period?.period_end ? date(summary.current_period.period_end) : "date not provided"}</p>
          {/* TODO: usage limits expose as_of but do not include an explicit reset date. */}
          <div className="billing-storage"><strong>Storage</strong><span>Organization storage usage and quota are not provided by the current billing API.</span><a href="/studio/storage" onClick={event => { if (onStorage) { event.preventDefault(); onStorage(); } }}>Account › Storage</a></div>
          {/* TODO: expose an organization-scoped storage usage/quota endpoint; personal storage data is not equivalent. */}
        </Card>
      </div>

      <div className="billing-column">
        <PaymentCard payment={payment} onAdd={startPaymentSetup} paymentAction={paymentAction} />
        <InvoicesCard invoices={invoices} summary={summary} compact onRetry={retryBilling} />
        <Card className="billing-card billing-sales"><h2>Need more?</h2><p>Contact sales to discuss your organization’s needs.</p><a href="mailto:sales@omnibioai.org">Contact sales</a></Card>
        <p className="billing-muted">Billing is managed by organization admins.</p>
      </div>
    </section>}

    {tab === "invoices" && <InvoicesCard invoices={invoices} summary={summary} onRetry={retryBilling} />}
  </main>;
}

function SummaryItem({ label, value, detail }) {
  return <Card className="billing-summary-item"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</Card>;
}

function PaymentCard({ payment, onAdd, paymentAction }) {
  const canManage = payment?.can_manage === true;
  const enabled = Boolean(payment?.stripe_enabled);
  return <Card className="billing-card billing-payment"><h2>Payment method</h2>
    {payment?.has_payment_method && payment.card ? <p className="billing-card-number">{humanize(payment.card.brand)} ···· {payment.card.last4}</p>
      : <p>No card on file. You only need one to upgrade.</p>}
    {canManage && <button className="billing-primary" type="button" disabled={!enabled || paymentAction.pending} onClick={onAdd}>{paymentAction.pending ? "Opening Stripe Checkout…" : payment?.has_payment_method ? "Update payment method" : "Add payment method"}</button>}
    {paymentAction.error && <p className="billing-error" role="alert">{paymentAction.error}</p>}
    {!enabled && canManage && <p className="billing-muted">Payments aren’t set up in this environment.</p>}
    {!canManage && <p className="billing-muted">You have read-only access to billing.</p>}
    <p className="billing-muted">Payments secured by Stripe.</p>
  </Card>;
}

function InvoicesCard({ invoices, summary, compact = false, onRetry }) {
  const rows = invoices?.invoices || [];
  return <Card className="billing-card"><h2>Invoices</h2>
    {rows.length ? <div className="billing-invoices">{rows.map(invoice => <div className="billing-invoice" key={invoice.id}>
      <span>{date(invoice.created_at || invoice.period_end)}</span><span>{invoice.invoice_number || `Invoice ${invoice.id}`}</span><strong>{amount(invoice.total, invoice.currency)}</strong>
      <Badge variant={String(invoice.status).toLowerCase() === "paid" ? "success" : "neutral"}>{humanize(invoice.status || "unknown")}</Badge>
    </div>)}</div> : invoices ? <p>No invoices yet</p> : <AccountState variant="error" title="Couldn’t load invoices" onRetry={onRetry}>The organization invoice list failed to load.</AccountState>}
    <div className="billing-outstanding"><span>Outstanding balance</span><strong>{summary ? amount(summary.outstanding_amount, summary.currency) : "—"}</strong></div>
    {/* TODO: billing API currently has no invoice PDF URL or download endpoint. */}
  </Card>;
}

function UsageDetails({ orgId, rows, summary }) {
  const [data, setData] = useState({ loading: true, usage: [], history: [], breakdown: {}, errors: [] });
  const reset = summary?.current_period?.period_end;
  useEffect(() => {
    let active = true;
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    const toIso = value => value.toISOString().slice(0, 10);
    Promise.allSettled([
      billingApi.getUsageSummary(orgId, toIso(start), toIso(end)),
      billingApi.getCostHistory(orgId, toIso(start), toIso(end)),
      billingApi.getCostBreakdown(orgId, toIso(start), toIso(end), "service"),
    ]).then(([usage, history, breakdown]) => {
      if (!active) return;
      setData({
        loading: false,
        usage: usage.status === "fulfilled" ? usage.value.services || [] : [],
        history: history.status === "fulfilled" ? history.value.history || [] : [],
        breakdown: breakdown.status === "fulfilled" ? breakdown.value.breakdown || {} : {},
        errors: [...new Set([usage, history, breakdown].filter(result => result.status === "rejected").map(result => safeErrorMessage(result.reason, "Usage reporting unavailable.")))],
      });
    });
    return () => { active = false; };
  }, [orgId]);

  return <section className="billing-column billing-usage-page">
    <Card className="billing-card"><h2>Usage limits</h2>
      {rows.length ? rows.map((row, index) => {
        const usage = valueForLimit(row);
        return <div className="billing-usage-row" key={index}><div className="billing-usage-label"><strong>{usageLabel(row)}</strong>{usage && <span>{`${usage.used} of ${usage.cap} ${row.unit || ""}`}</span>}</div>{usage ? <ProgressBar value={usage.percent} variant={usage.percent >= 80 ? "warning" : "accent"} /> : <AccountState variant="error" title="Couldn’t load usage limit" onRetry={() => window.location.reload()}>This request limit failed to load.</AccountState>}</div>;
      }) : <p>Usage limits are not available for this plan.</p>}
      <p className="billing-muted">Resets {reset ? date(reset) : "date not provided"}</p>
      {/* TODO: usage limits expose as_of but do not include an explicit reset date. */}
    </Card>
    {data.loading ? <div className="billing-loading"><Spinner size="sm" /> Loading usage…</div> : <>
      {data.errors.map((error, index) => <p role="status" className="billing-error" key={index}>{error}</p>)}
      <UsageTable title="Usage by service" rows={data.usage} columns={["service", "action", "resource", "quantity"]} empty="No usage recorded for this period." />
      <UsageTable title="Daily cost" rows={data.history} columns={["date", "cost"]} empty="No usage recorded for this period." currency={summary?.currency} />
      <UsageTable title="Cost by service" rows={Object.entries(data.breakdown).map(([service, value]) => ({ service, ...value }))} columns={["service", "quantity", "cost"]} empty="No usage recorded for this period." currency={summary?.currency} />
    </>}
  </section>;
}

function UsageTable({ title, rows, columns, empty, currency }) {
  return <Card className="billing-card"><h2>{title}</h2>{rows.length ? <div className="billing-usage-table" role="table" aria-label={title}>
    <div role="row" className="billing-usage-table__head">{columns.map(key => <strong role="columnheader" key={key}>{humanize(key)}</strong>)}</div>
    {rows.map((row, index) => <div role="row" className="billing-usage-table__row" key={index}>{columns.map(key => <span role="cell" key={key}>{key === "date" ? date(row[key]) : key === "cost" ? amount(row[key], currency) : key === "resource" ? usageLabel(row) : row[key] ?? "—"}{key === "quantity" && row.unit ? ` ${row.unit}` : ""}</span>)}</div>)}
  </div> : <p>{empty}</p>}</Card>;
}
