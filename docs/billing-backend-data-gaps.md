# Billing backend follow-up: missing organization billing data

This is a separate backend issue/PR plan. It is intentionally not implemented by the Studio billing redesign.

## 1. Usage reset date

Add an explicit `reset_at` (or `period_end`) to each usage-limit response, with documented timezone and reset semantics. The current `GET /billing/organizations/{org_id}/subscription/usage-limits` returns `as_of`, limits, and each limit's period, but no reset date. The summary's current period end is not guaranteed to match every limit's reset schedule. Studio should display the backend value and omit the date when unavailable.

## 2. Invoice PDF and hosted invoice links

Extend the organization invoices response with server-generated Stripe `hosted_invoice_url` and `invoice_pdf` URLs (or expose an authorized redirect/download endpoint). Return URLs only for invoices owned by the requested organization, and ensure access follows the existing organization billing permissions. The current response has invoice identifiers, dates, status, totals, and currency only. Studio should show a hosted invoice link and PDF download when supplied, with no guessed URLs.

## 3. Organization storage usage and quota

Add an organization-scoped endpoint that returns the authoritative organization owner identity, used and reserved bytes, quota and available bytes, quota mode, and reconciliation timestamp. Reuse storage accounting and entitlement projections from the storage service, but scope authorization to an organization membership/role. Account Storage currently uses `GET /api/storage/me/usage`, which validates `owner_type: "USER"` and reports personal managed storage. It is not an organization metric and must not be substituted for one.

## Acceptance checks

- Tests cover reset-date semantics, including no active billing period and non-monthly periods.
- Invoice link access is checked against organization ownership and billing authorization.
- Storage response is organization scoped and never derives quota in the client.
- Studio renders these fields only when the API provides them.
