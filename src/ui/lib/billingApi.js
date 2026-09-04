// Client for omnibioai-billing's read-only reporting API (billing-service:8005).
//
// Unlike rolesApi.js, every path here is same-origin and relative (never an
// authUrl()-style absolute host:port): billing-service is not published on a
// raw host port in any deployment — it is only reachable through
// nginx-router.conf's `location ^~ /billing` / `location ^~ /entitlements`
// blocks, which are auth_request-gated and proxy to billing-service:8005.
// That gate is the real authorization boundary (billing.py's own docstring
// flags its caller-identity check as a documented placeholder), so a browser
// with a valid session cookie/JWT is all that's needed here.
//
// "../lib/session" (not "./session") on purpose — see rolesApi.js's import
// comment for why that exact spelling is what vite.config.js's web-build
// alias matches.
import { getToken, clearSession } from "../lib/session";

// READ-ONLY by construction: only GET is ever issued. billing-service
// exposes no write endpoints at all (no plan changes, no payment-method
// management, no invoice actions), so there is nothing else to call.
async function get(path) {
  const token = getToken();
  const res = await fetch(path, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401) {
    // Same posture as rolesApi.request: a hard 401 means the session is
    // no longer usable, so clear it and let the app fall back to Login.
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
