# Membership & Plans v1

Studio exposes the public comparison at `/studio/billing/plans`. Prices and
proposed personal storage allowances come from
`src/ui/lib/membershipCatalog.js`.

## Verified service boundaries

- Current Billing APIs are organization-scoped under
  `/billing/organizations/{organization_id}`. They provide organization
  subscription status, dates, entitlements, usage, summary, payment-method
  state, and a permission-gated Stripe portal.
- The existing subscription checkout accepts no plan selection and resolves
  one organization Pay-as-you-go Stripe price. It is not valid for individual
  Plus or Pro enrollment.
- IAM's Studio session projection contains user identity, roles, permissions,
  and an optional organization ID. It contains no authoritative individual
  membership record.
- No approved sales destination was found in Studio configuration.
- No API currently returns personal storage quota enforcement or organization
  storage-provider health to Studio. Organization AI Connections are a
  separate workflow and remain unchanged.

Consequently, v1 never infers Free after a billing failure, never enables
Plus/Pro checkout, never treats a checkout return as payment confirmation, and
does not expose a Contact Sales link. Annual billing is also unavailable.

## Backend work required to enable paid individual plans

1. Add an authenticated, server-authoritative USER-scoped membership read API
   with explicit loading, absent, pending, active, canceled, and error states.
2. Add server-owned Plus and Pro monthly price mappings and an idempotent
   checkout endpoint that rejects duplicate active subscriptions. Add annual
   mappings only when actual annual Stripe prices exist.
3. Update membership only from verified Stripe webhook processing. The return
   URL must remain informational.
4. Add a USER-scoped storage quota/read API and enforcement in the storage
   service for 1 GB, 20 GB, and 100 GB. UI display is not enforcement.
5. Preserve USER and ORGANIZATION ownership as distinct authorization scopes;
   a USER Pro record must never authorize Enterprise operations.

## Enterprise and organization storage

Organization subscription management continues through the existing Billing
and Stripe portal flow. Seat counts and storage-provider health are shown as
unavailable unless returned by authoritative services. Planned customer-owned
providers (AWS S3, Google Cloud Storage, Azure Blob, S3-compatible storage, and
an on-premises gateway) require a separate storage-connections workstream for
credentials, health checks, gateways, transfers, and contract-defined quotas.
Organization storage must not debit a user's personal managed-storage pool by
default.
