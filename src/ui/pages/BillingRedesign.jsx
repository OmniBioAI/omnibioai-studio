import React, { useEffect, useState } from "react";
import { Badge, Button, Card, ProgressBar, Spinner } from "@omnibioai/ui";
import Login from "../components/Login";
import { getIdentity } from "../lib/session";
import * as billingApi from "../lib/billingApi";
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
  return value ? String(value).slice(0, 10) : fallback;
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

export default function BillingRedesign({ currentUser, onMembershipPlans, onStorage }) {
  if (!currentUser) return <Login title="Sign in required" description="Billing information requires an authenticated OmniBioAI account." />;
  if (currentUser.orgId == null) {
    return <section className="billing-page"><header><p className="billing-crumb">Account › Billing</p><h1>Billing</h1><p>Plan, usage and invoices for your organization.</p></header><Card><p>No organization is associated with this session.</p></Card>{onMembershipPlans && <Button variant="secondary" onClick={onMembershipPlans}>Membership &amp; Plans</Button>}</section>;
  }
  return <OrgBilling currentUser={currentUser} onMembershipPlans={onMembershipPlans} onStorage={onStorage} />;
}

function OrgBilling({ currentUser, onMembershipPlans, onStorage }) {
  const [identity, setIdentity] = useState(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [identityUnavailable, setIdentityUnavailable] = useState(false);
  const [orgId, setOrgId] = useState(currentUser.orgId);
  useEffect(() => {
    let active = true;
    getIdentity().then(value => { if (active) { setIdentity(value); setIdentityLoaded(true); } }).catch(() => { if (active) { setIdentityUnavailable(true); setIdentityLoaded(true); } });
    return () => { active = false; };
  }, []);
  const orgs = identity?.organizations || [];
  const organization = orgs.find(row => String(row.organization_id) === String(orgId));
  const orgName = organization?.organization_name || (identityUnavailable || identityLoaded ? "Organization name unavailable" : "Organization details loading");
  const isOrgAdmin = organization?.roles?.includes("org_admin") === true;
  return <BillingDashboard key={String(orgId)} orgId={orgId} orgName={orgName} orgs={orgs} isOrgAdmin={isOrgAdmin} onOrgChange={setOrgId} onMembershipPlans={onMembershipPlans} onStorage={onStorage} />;
}

function BillingDashboard({ orgId, orgName, orgs, isOrgAdmin, onOrgChange, onMembershipPlans, onStorage }) {
  const [state, setState] = useState({ loading: true, subscription: null, limits: null, summary: null, payment: null, invoices: null, errors: [] });
  const [tab, setTab] = useState("overview");
  const [addingPayment, setAddingPayment] = useState(false);
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
      const errors = results.map((result, index) => result.status === "rejected" && result.reason?.status !== 404
        ? result.reason?.message || `Billing data ${index + 1} unavailable` : null).filter(Boolean);
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
  }, [orgId]);

  const { subscription, limits, summary, payment, invoices } = state;
  const isFree = String(subscription?.plan_name || "").toLowerCase() === "free";
  const renewalDate = subscription?.renewal_date;
  const usageRows = limits?.limits || [];
  const activeTab = (next) => { setAddingPayment(false); setTab(next); };

  if (state.loading) return <section className="billing-page" aria-busy="true"><div className="billing-loading"><Spinner size="sm" /> Loading billing details…</div></section>;
  if (addingPayment) return <AddPaymentMethod payment={payment} onBack={() => setAddingPayment(false)} />;

  return <main className="billing-page">
    <header className="billing-header">
      <div><p className="billing-crumb">Account › Billing</p><h1>Billing</h1><p className="billing-subtitle">Plan, usage and invoices for your organization.</p></div>
      <div className="billing-org">
        {orgs.length > 1 ? <label>Organization<select value={String(orgId)} onChange={event => onOrgChange(event.target.value)}>{orgs.map(org => <option key={org.organization_id} value={org.organization_id}>{org.organization_name}</option>)}</select></label>
          : <span>{orgName}</span>}
      </div>
    </header>

    {state.errors.map((error, index) => <p className="billing-error" role="status" key={`${index}-${error}`}>{error}</p>)}
    <section className="billing-summary" aria-label="Billing summary">
      <SummaryItem label="Plan" value={subscription?.plan_name || "No active plan"} detail={subscription?.start_date ? `Since ${date(subscription.start_date)}` : "Start date unavailable"} />
      <SummaryItem label="This month" value={summary ? amount(summary.outstanding_amount, summary.currency) : "—"} detail="Amount due" />
      <SummaryItem label="Next invoice" value={isFree ? "None" : date(renewalDate)} detail={isFree ? "Free plan" : "Based on renewal date"} />
      <SummaryItem label="Payment method" value={payment?.has_payment_method && payment.card ? `${humanize(payment.card.brand)} ···· ${payment.card.last4}` : "Not set"} detail={payment?.has_payment_method && payment.card ? `Expires ${String(payment.card.exp_month).padStart(2, "0")}/${payment.card.exp_year}` : ""} />
    </section>

    <nav className="billing-tabs" aria-label="Billing sections" role="tablist">
      {["overview", "usage", "invoices"].map(name => <button type="button" role="tab" aria-selected={tab === name} className={tab === name ? "is-active" : ""} key={name} onClick={() => activeTab(name)}>{humanize(name)}</button>)}
    </nav>

    {tab === "overview" && <section className="billing-grid">
      <div className="billing-column">
        <Card className="billing-card"><h2>Plan</h2>
          <div className="billing-plan-title"><strong>{subscription?.plan_name || "No active subscription"}</strong>{subscription && <Badge variant="success">Active</Badge>}</div>
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
            if (!usage) return <p key={index}>Usage limit unavailable for {usageLabel(row)}.</p>;
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
        <PaymentCard payment={payment} isOrgAdmin={isOrgAdmin} onAdd={() => setAddingPayment(true)} />
        <InvoicesCard invoices={invoices} summary={summary} compact />
        <Card className="billing-card billing-sales"><h2>Need more?</h2><p>Contact sales to discuss your organization’s needs.</p><a href="mailto:sales@omnibioai.org">Contact sales</a></Card>
        <p className="billing-muted">Billing is managed by organization admins.</p>
      </div>
    </section>}

    {tab === "usage" && <UsageDetails orgId={orgId} rows={usageRows} summary={summary} />}
    {tab === "invoices" && <InvoicesCard invoices={invoices} summary={summary} />}
  </main>;
}

function SummaryItem({ label, value, detail }) {
  return <Card className="billing-summary-item"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</Card>;
}

function PaymentCard({ payment, isOrgAdmin, onAdd }) {
  const canManage = Boolean(payment?.can_manage && isOrgAdmin);
  const enabled = Boolean(payment?.stripe_enabled);
  return <Card className="billing-card"><h2>Payment method</h2>
    {payment?.has_payment_method && payment.card ? <p className="billing-card-number">{humanize(payment.card.brand)} ···· {payment.card.last4}</p>
      : <p>No card on file. You only need one to upgrade.</p>}
    {canManage && <button className="billing-primary" type="button" disabled={!enabled} onClick={onAdd}>{payment?.has_payment_method ? "Update payment method" : "Add payment method"}</button>}
    {!enabled && canManage && <p className="billing-muted">Payments aren’t set up in this environment.</p>}
    {!canManage && <p className="billing-muted">Only organization billing admins can change payment methods.</p>}
    <p className="billing-muted">Payments secured by Stripe.</p>
  </Card>;
}

function InvoicesCard({ invoices, summary, compact = false }) {
  const rows = invoices?.invoices || [];
  return <Card className="billing-card"><h2>Invoices</h2>
    {rows.length ? <div className="billing-invoices">{rows.map(invoice => <div className="billing-invoice" key={invoice.id}>
      <span>{date(invoice.created_at || invoice.period_end)}</span><span>{invoice.invoice_number || `Invoice ${invoice.id}`}</span><strong>{amount(invoice.total, invoice.currency)}</strong>
      <Badge variant={String(invoice.status).toLowerCase() === "paid" ? "success" : "neutral"}>{humanize(invoice.status || "unknown")}</Badge>
      <span className="billing-muted" title="The invoice API does not provide a PDF URL">PDF unavailable</span>
    </div>)}</div> : <p>{invoices ? "No invoices yet" : "Invoice list unavailable."}</p>}
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
        errors: [usage, history, breakdown].filter(result => result.status === "rejected").map(result => result.reason?.message || "Usage reporting unavailable."),
      });
    });
    return () => { active = false; };
  }, [orgId]);

  return <section className="billing-column billing-usage-page">
    <Card className="billing-card"><h2>Usage limits</h2>
      {rows.length ? rows.map((row, index) => {
        const usage = valueForLimit(row);
        return <div className="billing-usage-row" key={index}><div className="billing-usage-label"><strong>{usageLabel(row)}</strong><span>{usage ? `${usage.used} of ${usage.cap} ${row.unit || ""}` : "Unavailable"}</span></div>{usage && <ProgressBar value={usage.percent} variant={usage.percent >= 80 ? "warning" : "accent"} />}</div>;
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

function AddPaymentMethod({ payment, onBack }) {
  const enabled = Boolean(payment?.stripe_enabled);
  return <main className="billing-page">
    <p className="billing-crumb">Account › Billing › Add payment method</p><button className="billing-back" type="button" onClick={onBack}>← Back to Billing</button>
    <h1>Add payment method</h1><p className="billing-subtitle">Add a payment method for your organization.</p>
    <div className="billing-add-layout"><Card className="billing-card"><form onSubmit={event => event.preventDefault()}>
      <fieldset><legend>Payment type</legend><label><input type="radio" name="payment-type" value="card" defaultChecked /> Card</label><label><input type="radio" name="payment-type" value="bank" /> US bank account</label></fieldset>
      <div className="billing-element-placeholder" role="note">Secure payment fields are not available: this backend exposes a hosted Checkout setup session, not a SetupIntent client secret for Stripe Elements.</div>
      {/* TODO: mount Stripe Payment Element when Billing exposes a SetupIntent client secret. Never add card/CVC inputs here. */}
      <fieldset><legend>Billing details</legend>
        <label>Country<select defaultValue=""><option value="" disabled>Select a country</option><option value="US">United States</option></select></label>
        <label>ZIP code<input autoComplete="postal-code" /></label>
        <label>Billing email<input type="email" autoComplete="email" /></label>
        <label>Tax ID (optional)<input /></label>
      </fieldset>
      <label className="billing-default"><input type="checkbox" /> Make default</label>
      {!enabled && <p role="status" className="billing-muted">Payments aren’t set up in this environment.</p>}
      <div className="billing-form-actions"><button type="button" onClick={onBack}>Cancel</button><button type="submit" className="billing-primary" disabled>Save</button></div>
    </form></Card></div>
  </main>;
}
