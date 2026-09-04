import React, { useCallback, useEffect, useState } from "react";
import { Badge, Card, Button, ProgressBar, Spinner } from "@omnibioai/ui";
import Login from "../components/Login";
import * as billingApi from "../lib/billingApi";

// Read-only visibility into the organization's current billing state, backed
// entirely by omnibioai-billing's existing GET endpoints (billing-service:8005,
// proxied via nginx-router.conf's auth_request-gated /billing location). No
// write path exists in that service — no plan changes, no payment-method
// management, no invoice actions — so this page has none either.
//
// Data shown maps 1:1 to what the API actually returns today:
//   /billing/organizations/{orgId}/subscription            -> plan + status + dates + feature flags
//   /billing/organizations/{orgId}/subscription/usage-limits -> per-dimension included/used
//   /billing/organizations/{orgId}/summary                 -> current period + cost + invoice/outstanding totals
//
// Deliberately NOT shown, because billing-service exposes no data for it:
//   - seat / user-count usage (there is no seat concept in billing-service;
//     `max_users` only ever appears as a plan_features *flag*, and only in
//     test fixtures — see omnibioai-billing/app/core/feature_catalog.py)
//   - billing account details (billing_email / provider / customer id — the
//     BillingAccount model has these but no endpoint returns them)

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

export default function Billing({ currentUser }) {
  if (!currentUser) {
    return <Login title="Sign in required" description="Billing information requires an authenticated OmniBioAI account." />;
  }
  if (currentUser.orgId == null) {
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
            read-only view of organization #{orgId}’s current billing state
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>Refresh</Button>
      </div>

      {error && <Badge variant="danger">{error}</Badge>}

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
        This is a read-only summary. Plan changes, payment methods, and invoice
        downloads are not available here — billing-service exposes no write
        endpoints for them.
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
