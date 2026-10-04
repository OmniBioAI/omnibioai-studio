// Client for omnibioai-auth's platform-admin endpoints
// (app/api/routes_platform_admin.py, bare prefix "/platform" -- routed in
// docker/nginx-router.conf's `location ^~ /platform` block, same bare-route
// pattern as /roles, /users/, /orgs). Every route here is gated server-side
// by require_permission(MANAGE_ALL_ORGS); nothing here should be called
// unless currentUser.permissions already includes "manage_all_orgs" (see
// billingApi.js callers in Billing.jsx).
//
// "../lib/session" (not "./session") on purpose -- see rolesApi.js's import
// comment for why that exact spelling is what vite.config.js's web-build
// alias matches.
import { authUrl, getToken, clearSession } from "../lib/session";

async function request(path) {
  const token = getToken();
  const res = await fetch(authUrl(path), {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401) {
    clearSession();
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail || detail;
    } catch (_) {
      // no JSON body (nginx error page, etc.)
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

// GET /platform/orgs?page=&page_size=&search=
//   -> { items: [{ id, name, status, created_at, owner_email, member_count,
//        team_count, api_key_count, oauth_client_count, license_count,
//        sso_enabled, mfa_policy_required, ... }], total, page, page_size,
//        total_pages }
//   Every organization on the platform, not just the caller's own --
//   the whole point of this endpoint existing alongside the strictly
//   membership-scoped GET /orgs.
export const listAllOrganizations = ({ page = 1, pageSize = 100, search = "" } = {}) =>
  request(`/platform/orgs?${qs({ page, page_size: pageSize, search })}`);
