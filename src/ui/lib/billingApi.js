// Client for omnibioai-billing's billing API (billing-service:8005).
//
// Every path here is same-origin and relative (never an authUrl()-style
// absolute host:port): billing-service is not published on a raw host port
// in any deployment — it is only reachable through nginx-router.conf's
// `location ^~ /billing` / `location ^~ /entitlements` blocks, which are
// auth_request-gated and proxy to billing-service:8005. That gate is a
// coarse "has a session" check; billing-service's own routers
// (app/routers/billing.py) are what actually enforce per-organization and
// per-permission authorization for the mutating payment-method calls below.
//
// "../lib/session" (not "./session") on purpose — see rolesApi.js's import
// comment for why that exact spelling is what vite.config.js's web-build
// alias matches.
import { getToken, getSessionVersion, clearSession } from "../lib/session";

async function request(path, method = "GET", body) {
  const token = getToken();
  const version = getSessionVersion();
  const res = await fetch(path, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (res.status === 401 && token === getToken() && version === getSessionVersion()) {
    // Same posture as rolesApi.request: a hard 401 means the session is
    // no longer usable. An older request must never invalidate a new login.
    clearSession();
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail || detail;
    } catch (_) {
      // no JSON body (nginx 401/502 page, etc.)
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

const get = (path) => request(path, "GET");
const post = (path, body) => request(path, "POST", body);

// USER-scoped membership. Identity is derived by Billing from the bearer
// token; no user id is ever sent by Studio.
export const getCurrentMembership = () => get("/billing/me/membership");
export const getCurrentMembershipEntitlements = () => get("/billing/me/entitlements");
export const createUserMembershipCheckout = (plan) => post("/billing/me/checkout", { plan });
export const createUserMembershipPortal = () => post("/billing/me/portal");

// GET /billing/organizations/{orgId}/payment-method
//   -> { stripe_enabled, can_manage, has_payment_method,
//        card: { brand, last4, exp_month, exp_year } | null }
//   Served from our own DB — no live Stripe call. Any org member may read
//   it; can_manage reflects whether the caller holds manage_billing.
export const getPaymentMethod = (orgId) =>
  get(`/billing/organizations/${orgId}/payment-method`);

// POST /billing/organizations/{orgId}/payment-method/setup-session
//   -> { url }  — a Stripe Checkout Session (setup mode) hosted-page URL.
//   No request body: success_url/cancel_url are built server-side only,
//   from BILLING_WEB_BASE_URL — this client never sends a return URL.
//   403 if the caller lacks manage_billing; 503 if Stripe isn't enabled.
export const createPaymentSetupSession = (orgId) =>
  post(`/billing/organizations/${orgId}/payment-method/setup-session`);

// POST /billing/organizations/{orgId}/portal-session
//   -> { url }  — a Stripe Billing Portal session URL.
//   403 if the caller lacks manage_billing; 409 if the org has no Stripe
//   customer yet; 503 if Stripe isn't enabled.
export const createBillingPortalSession = (orgId) =>
  post(`/billing/organizations/${orgId}/portal-session`);

// GET /billing/organizations/{orgId}/subscription
//   -> { plan_name, billing_interval, currency, status, start_date,
//        end_date, renewal_date, features: [{ feature_key, value_type,
//        bool_value, int_value, string_value }] }
//   404 when the org has no active organization_subscriptions row.
export const getSubscription = (orgId) =>
  get(`/billing/organizations/${orgId}/subscription`);

// GET /billing/organizations/{orgId}/subscription/usage-limits
//   -> { plan_name, as_of, limits: [{ service, action, resource, unit,
//        period, included, used, remaining, percentage_used }] }
//   404 when the org has no active subscription; empty `limits` is normal
//   (a plan with feature flags but no usage-metered dimensions).
export const getUsageLimits = (orgId) =>
  get(`/billing/organizations/${orgId}/subscription/usage-limits`);

// GET /billing/organizations/{orgId}/summary
//   -> { current_period: { period_start, period_end, status } | null,
//        current_usage_cost, currency, invoice_count, outstanding_amount }
//   Never 404s — a brand-new org gets honest zeros / null period.
export const getBillingSummary = (orgId) =>
  get(`/billing/organizations/${orgId}/summary`);

function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

// GET /billing/organizations/{orgId}/usage?start_date&end_date
//   -> { organization_id, period_start, period_end,
//        services: [{ service, action, resource, unit, quantity }] }
//   Raw usage quantity per (service, action, resource) dimension, summed
//   server-side from usage_daily_rollups. Never 404s — an org/period
//   with no recorded usage gets an honest empty `services` array.
export const getUsageSummary = (orgId, startDate, endDate) =>
  get(`/billing/organizations/${orgId}/usage?${qs({ start_date: startDate, end_date: endDate })}`);

// GET /billing/organizations/{orgId}/cost-history?start_date&end_date
//   -> { organization_id, period_start, period_end, currency,
//        history: [{ date, cost }] }
//   One point per day that had rated usage — a quiet day has no point at
//   all, not an explicit zero-cost entry (see billing_reporting_service.
//   get_cost_history's docstring), so an empty `history` is the normal
//   shape for a sparsely-used org.
export const getCostHistory = (orgId, startDate, endDate) =>
  get(`/billing/organizations/${orgId}/cost-history?${qs({ start_date: startDate, end_date: endDate })}`);

// GET /billing/organizations/{orgId}/cost-breakdown?start_date&end_date&group_by
//   -> { organization_id, period_start, period_end, group_by, currency,
//        breakdown: { [groupKey]: { quantity, cost } } }
//   group_by is one of service|action|resource|month server-side;
//   defaults to "service" here as the most legible grouping for a
//   per-org summary view.
export const getCostBreakdown = (orgId, startDate, endDate, groupBy = "service") =>
  get(`/billing/organizations/${orgId}/cost-breakdown?${qs({ start_date: startDate, end_date: endDate, group_by: groupBy })}`);

// Deliberately NOT wrapped here: GET /billing/organizations/{orgId}/usage-events
// is the per-user raw event log (added for HIPAA RAG-query-log read access —
// see billing.py's router section comment), distinct from the aggregate
// usage/cost endpoints above. Surfacing individual per-user activity data is
// its own explicit product decision, not something that rides along by
// default with an aggregate reporting client — same reasoning as the
// cron-log exclusion. Add a dedicated wrapper (and its own UI surface) only
// when that decision is made on purpose.
