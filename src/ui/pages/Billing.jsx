import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Card, Button, Input, ProgressBar, Spinner, Tabs, Table } from "@omnibioai/ui";
import Login from "../components/Login";
import * as billingApi from "../lib/billingApi";
import * as platformAdminApi from "../lib/platformAdminApi";
import { isStripeHostedUrl, openStripeUrl } from "../lib/stripePortal";

// Re-exported so existing imports of `isStripeHostedUrl` from this module
// keep working unchanged now that it lives in lib/stripePortal.js (shared
// with AccountPlan.jsx).
export { isStripeHostedUrl };

const MANAGE_ALL_ORGS = "manage_all_orgs";

// Organization-scoped billing view, backed by omnibioai-billing
// (billing-service:8005, proxied via nginx-router.conf's auth_request-gated
// /billing location). Mostly read-only reporting, plus one write surface:
// the Overview tab's Payment method card, which lets a billing admin add or
// replace the organization's card and open the Stripe-hosted billing
// portal. Those two actions never collect card data themselves — they only
// request a Stripe-hosted Checkout/Portal session URL from billing-service
// and hand the browser off to it, so a raw card number never reaches
// OmniBioAI (see billingApi.js's createPaymentSetupSession /
// createBillingPortalSession and isStripeHostedUrl below). Every other
// endpoint on this page remains GET-only reporting.
//
// The page is two tabs: "Overview" (plan/status/limits/period + payment
// method) and "Usage" (raw usage + cost reporting).
//
// Overview data maps 1:1 to what the API actually returns today:
//   /billing/organizations/{orgId}/payment-method           -> card on file + manage permission
//   /billing/organizations/{orgId}/subscription            -> plan + status + dates + feature flags
//   /billing/organizations/{orgId}/subscription/usage-limits -> per-dimension included/used
//   /billing/organizations/{orgId}/summary                 -> current period + cost + invoice/outstanding totals
//
// Deliberately NOT shown, because billing-service exposes no data for it:
//   - seat / user-count usage (there is no seat concept in billing-service;
//     `max_users` only ever appears as a plan_features *flag*, and only in
//     test fixtures — see omnibioai-billing/app/core/feature_catalog.py)
//   - billing account details beyond the card display fields above
//     (billing_email / provider / customer id — the BillingAccount model
//     has these but no endpoint returns them)
//
// Usage tab data, over a trailing 30-day window:
//   /billing/organizations/{orgId}/usage          -> raw usage by service/action/resource
//   /billing/organizations/{orgId}/cost-history   -> daily $ over the window
//   /billing/organizations/{orgId}/cost-breakdown -> $ grouped by service (group_by default)
//
// Deliberately NOT shown: /billing/organizations/{orgId}/usage-events, the
// per-user raw event log. Individual user activity data is its own explicit
// product decision, not something that ships by default alongside aggregate
// usage/cost reporting — same reasoning as the cron-log exclusion. See
// billingApi.js's comment above that endpoint for the full rationale.
//
// Most orgs will show near-empty results here — real usage-service traffic
// today is concentrated in one org's rag/model/workflow events, and cost
// rollups are near-empty everywhere else — so every section below uses the
// same honest-empty-state wording as the Overview tab's Plan card rather
// than a blank chart or a false error.

const STATUS_VARIANT = {
  active: "success",
  trial: "info",
  trialing: "info",
  suspended: "warning",
  past_due: "warning",
  cancelled: "danger",
  canceled: "danger",
};

function money(value, currency) {
  const n = Number(value ?? 0);
  const amount = Number.isFinite(n) ? n.toFixed(2) : "0.00";
  return `${amount} ${String(currency || "usd").toUpperCase()}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  // API returns plain ISO dates (YYYY-MM-DD) / datetimes; keep the date part.
  return String(iso).slice(0, 10);
}

function featureValue(f) {
  switch (f.value_type) {
    case "boolean":
      return f.bool_value ? "Enabled" : "Disabled";
    case "integer":
      return f.int_value == null ? "—" : String(f.int_value);
    case "unlimited":
      return "Unlimited";
    case "string":
      return f.string_value || "—";
    default:
      return "—";
  }
}

const labelStyle = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontFamily: "var(--mono)", letterSpacing: "0.04em", textTransform: "uppercase" };
const valueStyle = { fontSize: "var(--font-size-sm)", color: "var(--text)" };
const sectionTitleStyle = { fontSize: "var(--font-size-sm)", fontWeight: 700, color: "#fff", marginBottom: 10, letterSpacing: "0.02em" };

const PAYMENT_UNAVAILABLE_MESSAGE = "Online card payments are not available on this deployment yet.";

// Stripe redirects back to <BILLING_WEB_BASE_URL>/billing?payment=success|
// cancelled (billing-service builds that URL server-side — see
// billingApi.js). Read it once on mount, then strip it from the address bar
// so it doesn't linger or replay on a later reload — same reasoning as
// App.jsx's ?return_to handling.
function usePaymentNotice() {
  const [notice] = useState(() => new URLSearchParams(window.location.search).get("payment"));
  useEffect(() => {
    if (!notice) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("payment");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return notice;
}

function PaymentMethodCard({ orgId }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null); // Error({ status, message }) | null
  const [actionBusy, setActionBusy] = useState(null); // "setup" | "portal" | null
  const [actionError, setActionError] = useState("");
  const notice = usePaymentNotice();
  const actionInFlight = useRef(false);
  const refreshOnReturn = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setData(await billingApi.getPaymentMethod(orgId));
    } catch (err) {
      setData(null);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let wasHidden = document.visibilityState === "hidden";
    const refresh = () => {
      if (document.visibilityState !== "visible" || actionInFlight.current || !refreshOnReturn.current) return;
      refreshOnReturn.current = false;
      load();
    };
    const onVisibilityChange = () => {
      const hidden = document.visibilityState === "hidden";
      if (wasHidden && !hidden) refresh();
      wasHidden = hidden;
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  async function runAction(kind, call) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    refreshOnReturn.current = false;
    setActionError("");
    setActionBusy(kind);
    let stripeTab;
    try {
      if (kind === "setup" && !window.electronAPI?.openExternal && !window.api?.openExternal) {
        // Reserve the tab in the click handler, before awaiting the session.
        // noopener in window.open would return null even when it succeeds,
        // so keep the handle for navigation/cleanup and sever opener now.
        stripeTab = window.open("about:blank", "_blank");
        if (!stripeTab) throw new Error("Please allow pop-ups for Studio, then try adding your card again.");
        stripeTab.opener = null;
      }
      const { url } = await call();
      openStripeUrl(url, stripeTab);
      if (kind === "setup") refreshOnReturn.current = true;
    } catch (err) {
      stripeTab?.close();
      setActionError(err.message || "That action failed. Please try again.");
    } finally {
      actionInFlight.current = false;
      setActionBusy(null);
    }
  }

  const unavailable = loadError?.status === 404 || (data != null && !data.stripe_enabled);

  return (
    <Card elevated>
      <div style={sectionTitleStyle}>Payment method</div>

      {notice === "success" && <Badge variant="success">Payment method saved.</Badge>}
      {notice === "cancelled" && <Badge variant="info">Card setup was cancelled.</Badge>}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--color-text-muted)" }}>
          <Spinner size="sm" /> Loading payment method…
        </div>
      ) : unavailable ? (
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
          {PAYMENT_UNAVAILABLE_MESSAGE}
        </div>
      ) : loadError ? (
        <Badge variant="danger">{loadError.message || "Failed to load payment method"}</Badge>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.has_payment_method ? (
            <div>
              <span style={{ ...valueStyle, fontFamily: "var(--mono)" }}>
                {String(data.card.brand || "").toUpperCase()} •••• {data.card.last4}
              </span>
              <span style={{ ...valueStyle, color: "var(--color-text-muted)", marginLeft: 10 }}>
                {String(data.card.exp_month).padStart(2, "0")}/{data.card.exp_year}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
              No card on file for this organization.
            </div>
          )}

          {actionError && <Badge variant="danger">{actionError}</Badge>}

          {data.can_manage ? (
            <div style={{ display: "flex", gap: 10 }}>
              <Button
                variant="secondary"
                size="sm"
                loading={actionBusy === "setup"}
                disabled={actionBusy != null}
                onClick={() => runAction("setup", () => billingApi.createPaymentSetupSession(orgId))}
              >
                {data.has_payment_method ? "Replace card" : "Add card"}
              </Button>
              {data.has_payment_method && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={actionBusy === "portal"}
                  disabled={actionBusy != null}
                  onClick={() => runAction("portal", () => billingApi.createBillingPortalSession(orgId))}
                >
                  Manage billing
                </Button>
              )}
            </div>
          ) : (
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontFamily: "var(--mono)" }}>
              Only owners and billing admins can change the payment method.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function Billing({ currentUser }) {
  if (!currentUser) {
    return <Login title="Sign in required" description="Billing information requires an authenticated OmniBioAI account." />;
  }
  if (currentUser.orgId == null) {
    // A platform admin has no personal org membership (org_id is
    // deliberately not where platform-admin-ness lives, see
    // omnibioai-auth's resolve_primary_membership/build_user_claims) but
    // still needs to view any organization's billing state -- the
    // manage_all_orgs bypass already implemented server-side in
    // omnibioai-billing/app/core/iam.py authorizes exactly this, for any
    // org_id, independent of the caller's own org_id claim. Only the
    // org-picker UI to drive it was missing.
    if (currentUser.permissions?.includes(MANAGE_ALL_ORGS)) {
      return <PlatformOrgPicker />;
    }
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px 16px 0" }}>
        <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <Card elevated>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏢</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>No organization context</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
              Your session isn’t associated with an organization, so there’s no
              billing account to show. Sign in through an organization workspace
              to see its billing state.
            </div>
          </Card>
        </div>
      </div>
    );
  }
  return <BillingSummary orgId={currentUser.orgId} />;
}

// Platform admins (manage_all_orgs) have no personal org membership to
// derive a billing org from, so they pick one explicitly from every
// organization on the platform (GET /platform/orgs, omnibioai-auth) instead
// of the caller's own JWT org_id claim. The chosen org_id flows into the
// exact same BillingSummary/billingApi calls an ordinary org member's page
// already uses -- authorized server-side via the manage_all_orgs bypass in
// omnibioai-billing/app/core/iam.py, not by anything special here.
function PlatformOrgPicker() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedOrg, setSelectedOrg] = useState(null); // { id, name } | null

  useEffect(() => {
    if (selectedOrg) return; // no need to keep listing while viewing one org
    let active = true;
    setLoading(true);
    setError("");
    platformAdminApi
      .listAllOrganizations({ search })
      .then((data) => { if (active) setOrgs(data.items || []); })
      .catch((err) => { if (active) setError(err.message || "Failed to load organizations"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, selectedOrg]);

  if (selectedOrg) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Button variant="secondary" onClick={() => setSelectedOrg(null)}>&larr; All organizations</Button>
          <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
            Viewing <strong style={{ color: "#fff" }}>{selectedOrg.name}</strong>’s billing as a platform admin
          </div>
        </div>
        <BillingSummary orgId={selectedOrg.id} />
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 0" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Select an organization</div>
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
          Your account isn’t a member of any organization, but as a platform
          admin you can view billing for any of them.
        </div>
      </div>
      <Input
        placeholder="Search organizations by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 12, maxWidth: 360 }}
      />
      {error && <Badge variant="danger">{error}</Badge>}
      <Card elevated>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 24, color: "var(--color-text-muted)" }}>
            <Spinner size="sm" /> Loading organizations…
          </div>
        ) : (
          <Table
            columns={[
              { key: "name", label: "Organization", sortable: true },
              { key: "owner_email", label: "Owner", sortable: true, render: (v) => v || "—" },
              { key: "status", label: "Status", sortable: true, render: (v) => <Badge variant={v === "active" ? "success" : "warning"}>{v}</Badge> },
              {
                key: "actions", label: "", align: "right",
                render: (_v, row) => (
                  <Button size="sm" onClick={() => setSelectedOrg({ id: row.id, name: row.name })}>View billing</Button>
                ),
              },
            ]}
            data={orgs}
            emptyMessage={search ? "No organizations match that search." : "No organizations exist on this platform yet."}
          />
        )}
      </Card>
    </div>
  );
}

function BillingSummary({ orgId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subscription, setSubscription] = useState(null); // object | { none: true } | null
  const [limits, setLimits] = useState(null); // { limits: [...] } | { none: true } | null
  const [summary, setSummary] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const [subRes, limRes, sumRes] = await Promise.allSettled([
      billingApi.getSubscription(orgId),
      billingApi.getUsageLimits(orgId),
      billingApi.getBillingSummary(orgId),
    ]);

    let errMsg = "";

    // Subscription: a 404 is the ordinary "this org has no active
    // subscription" state, not an error worth blocking the whole page on.
    if (subRes.status === "fulfilled") {
      setSubscription(subRes.value);
    } else if (subRes.reason?.status === 404) {
      setSubscription({ none: true });
    } else {
      errMsg = subRes.reason?.message || "Failed to load subscription";
    }

    if (limRes.status === "fulfilled") {
      setLimits(limRes.value);
    } else if (limRes.reason?.status === 404) {
      setLimits({ none: true });
    } else {
      setLimits(null); // non-fatal — the usage-limits card just hides
    }

    // Summary never 404s (a new org gets honest zeros), so any failure here
    // is a real error.
    if (sumRes.status === "fulfilled") {
      setSummary(sumRes.value);
    } else if (!errMsg) {
      errMsg = sumRes.reason?.message || "Failed to load billing summary";
    }

    setError(errMsg);
    setLoading(false);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 24, color: "var(--color-text-muted)" }}>
        <Spinner size="sm" /> Loading billing state…
      </div>
    );
  }

  const hasSub = subscription && !subscription.none;
  const limitRows = limits && !limits.none ? (limits.limits || []) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", marginBottom: 3 }}>
            Billing
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", fontFamily: "var(--mono)" }}>
            organization #{orgId}’s current billing state
          </div>
        </div>
      </div>

      <Tabs
        tabs={[
          { key: "overview", label: "Overview", content: <BillingOverview orgId={orgId} load={load} error={error} hasSub={hasSub} subscription={subscription} limitRows={limitRows} summary={summary} /> },
          { key: "usage", label: "Usage", content: <UsageTab orgId={orgId} /> },
        ]}
      />
    </div>
  );
}

function BillingOverview({ orgId, load, error, hasSub, subscription, limitRows, summary }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="secondary" size="sm" onClick={load}>Refresh</Button>
      </div>

      {error && <Badge variant="danger">{error}</Badge>}

      {/* ── Payment method ────────────────────────────────────────────── */}
      <PaymentMethodCard orgId={orgId} />

      {/* ── Plan & status ─────────────────────────────────────────────── */}
      <Card elevated>
        <div style={sectionTitleStyle}>Plan</div>
        {hasSub ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{subscription.plan_name}</span>
              <Badge variant={STATUS_VARIANT[subscription.status] || "neutral"}>{subscription.status}</Badge>
              <span style={{ ...valueStyle, color: "var(--color-text-muted)", fontFamily: "var(--mono)" }}>
                {subscription.billing_interval} · {String(subscription.currency || "").toUpperCase()}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
              <Field label="Started" value={formatDate(subscription.start_date)} />
              <Field label="Renews" value={formatDate(subscription.renewal_date)} />
              <Field label="Ends" value={formatDate(subscription.end_date)} />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
            No active subscription is on record for this organization.
          </div>
        )}
      </Card>

      {/* ── Plan features ─────────────────────────────────────────────── */}
      {hasSub && subscription.features?.length > 0 && (
        <Card elevated>
          <div style={sectionTitleStyle}>Plan features</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {subscription.features.map((f) => (
              <div
                key={f.feature_key}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 0", borderBottom: "1px solid var(--border)", gap: 12,
                }}
              >
                <span style={{ ...valueStyle, fontFamily: "var(--mono)" }}>{f.feature_key}</span>
                <span style={{ ...valueStyle, color: "var(--color-text-muted)" }}>{featureValue(f)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Usage against plan limits ─────────────────────────────────── */}
      {limitRows != null && (
        <Card elevated>
          <div style={sectionTitleStyle}>Usage vs. plan limits</div>
          {limitRows.length === 0 ? (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
              This plan has no usage-metered limits.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {limitRows.map((l, i) => {
                const pct = Number(l.percentage_used) || 0;
                const variant = pct >= 100 ? "danger" : pct >= 80 ? "warning" : "accent";
                return (
                  <div key={`${l.service}.${l.action}.${l.resource}.${i}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 12 }}>
                      <span style={{ ...valueStyle, fontFamily: "var(--mono)" }}>
                        {l.service} · {l.action} · {l.resource}
                      </span>
                      <span style={{ ...labelStyle, textTransform: "none" }}>
                        {Number(l.used)} / {Number(l.included)} {l.unit} ({l.period})
                      </span>
                    </div>
                    <ProgressBar value={pct} variant={variant} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ── Current period & account totals ───────────────────────────── */}
      {summary && (
        <Card elevated>
          <div style={sectionTitleStyle}>Current billing period</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Field
              label="Period"
              value={
                summary.current_period
                  ? `${formatDate(summary.current_period.period_start)} → ${formatDate(summary.current_period.period_end)}`
                  : "Not yet opened"
              }
            />
            <Field label="Period status" value={summary.current_period?.status || "—"} />
            <Field label="Usage cost so far" value={money(summary.current_usage_cost, summary.currency)} />
            <Field label="Outstanding" value={money(summary.outstanding_amount, summary.currency)} />
            <Field label="Invoices on record" value={String(summary.invoice_count ?? 0)} />
          </div>
        </Card>
      )}

      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontFamily: "var(--mono)", lineHeight: 1.6 }}>
        Plan changes and invoice downloads are not available here. The
        payment method above is managed directly through Stripe-hosted
        pages — card details are never entered into, or stored by,
        OmniBioAI.
      </div>
    </div>
  );
}

// Trailing N-day window ending today, as YYYY-MM-DD strings — start_date
// and end_date are required query params on all three Usage-tab endpoints,
// and a fixed trailing window keeps this page free of date-picker state.
function lastNDaysRange(n) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (n - 1));
  const iso = (d) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

const EMPTY_USAGE_MESSAGE = "No usage recorded for this period.";

function UsageTab({ orgId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState(null); // { services: [...] } | null
  const [costHistory, setCostHistory] = useState(null); // { currency, history: [...] } | null
  const [costBreakdown, setCostBreakdown] = useState(null); // { currency, breakdown: {...} } | null

  const { startDate, endDate } = useMemo(() => lastNDaysRange(30), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    // None of these three 404 — an org/period with no usage gets an
    // honest empty result, not a missing-resource error — so any
    // rejection here is a real failure worth surfacing.
    const [usageRes, historyRes, breakdownRes] = await Promise.allSettled([
      billingApi.getUsageSummary(orgId, startDate, endDate),
      billingApi.getCostHistory(orgId, startDate, endDate),
      billingApi.getCostBreakdown(orgId, startDate, endDate, "service"),
    ]);

    let errMsg = "";

    if (usageRes.status === "fulfilled") setUsage(usageRes.value);
    else errMsg = usageRes.reason?.message || "Failed to load usage";

    if (historyRes.status === "fulfilled") setCostHistory(historyRes.value);
    else if (!errMsg) errMsg = historyRes.reason?.message || "Failed to load cost history";

    if (breakdownRes.status === "fulfilled") setCostBreakdown(breakdownRes.value);
    else if (!errMsg) errMsg = breakdownRes.reason?.message || "Failed to load cost breakdown";

    setError(errMsg);
    setLoading(false);
  }, [orgId, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 24, color: "var(--color-text-muted)" }}>
        <Spinner size="sm" /> Loading usage…
      </div>
    );
  }

  const services = usage?.services || [];
  const historyPoints = costHistory?.history || [];
  const breakdownRows = Object.entries(costBreakdown?.breakdown || {}).map(([group, entry]) => ({
    group, quantity: entry.quantity, cost: entry.cost,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ ...valueStyle, color: "var(--color-text-muted)", fontFamily: "var(--mono)" }}>
          {formatDate(startDate)} → {formatDate(endDate)} (trailing 30 days)
        </span>
        <Button variant="secondary" size="sm" onClick={load}>Refresh</Button>
      </div>

      {error && <Badge variant="danger">{error}</Badge>}

      {/* ── Raw usage by service/action/resource ────────────────────────── */}
      <Card elevated>
        <div style={sectionTitleStyle}>Usage by service</div>
        <Table
          columns={[
            { key: "service", label: "Service", sortable: true },
            { key: "action", label: "Action", sortable: true },
            { key: "resource", label: "Resource", sortable: true },
            { key: "quantity", label: "Quantity", sortable: true, align: "right", render: (v, row) => `${Number(v)} ${row.unit}` },
          ]}
          data={services}
          emptyMessage={EMPTY_USAGE_MESSAGE}
        />
      </Card>

      {/* ── Daily cost over the window ───────────────────────────────────── */}
      <Card elevated>
        <div style={sectionTitleStyle}>Daily cost</div>
        <Table
          columns={[
            { key: "date", label: "Date", sortable: true, render: (v) => formatDate(v) },
            { key: "cost", label: "Cost", sortable: true, align: "right", render: (v) => money(v, costHistory?.currency) },
          ]}
          data={historyPoints}
          emptyMessage={EMPTY_USAGE_MESSAGE}
        />
      </Card>

      {/* ── Cost grouped by service ──────────────────────────────────────── */}
      <Card elevated>
        <div style={sectionTitleStyle}>Cost by service</div>
        <Table
          columns={[
            { key: "group", label: "Service", sortable: true },
            { key: "quantity", label: "Quantity", sortable: true, align: "right", render: (v) => Number(v) },
            { key: "cost", label: "Cost", sortable: true, align: "right", render: (v) => money(v, costBreakdown?.currency) },
          ]}
          data={breakdownRows}
          emptyMessage={EMPTY_USAGE_MESSAGE}
        />
      </Card>

      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontFamily: "var(--mono)", lineHeight: 1.6 }}>
        Aggregate usage and cost only. Per-user activity (who did what) is
        deliberately not shown here — see billingApi.js for why.
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{ ...valueStyle, marginTop: 3 }}>{value}</div>
    </div>
  );
}
