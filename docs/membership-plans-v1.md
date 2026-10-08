# Membership & Plans v1

Studio exposes the public comparison at `/studio/billing/plans`. Prices and
proposed personal storage allowances come from
`src/ui/lib/membershipCatalog.js`.

## Verified service boundaries

- Organization Billing APIs remain scoped under
  `/billing/organizations/{organization_id}`. USER membership is separately
  exposed under `/billing/me/*`; its owner comes only from the verified JWT.
- The existing subscription checkout accepts no plan selection and resolves
  one organization Pay-as-you-go Stripe price. It is not valid for individual
  Plus or Pro enrollment.
- IAM's Studio session projection contains user identity, roles, permissions,
  and an optional organization ID. Billing uses that verified identity to
  resolve the authoritative personal membership; IAM does not invent plans.
- No approved sales destination was found in Studio configuration.
- Billing returns personal storage allowances with enforcement explicitly
  false. No API currently returns organization storage-provider health to
  Studio. Organization AI Connections are a separate workflow and unchanged.

The USER membership backend now resolves Free deterministically from verified
identity and exposes Plus/Pro checkout only when the corresponding server-side
Stripe configuration exists. Studio still never infers Free after a billing
failure, never treats a checkout return as payment confirmation, and does not
expose a Contact Sales link. Annual billing remains unavailable.

Upgrade controls remain disabled on the annual view and when Billing reports
the plan ineligible. A Billing 401 is rendered as an unauthenticated state;
other service failures retain the explicit unknown/unavailable state rather
than being converted to Free.

## Implemented backend contract

1. `/billing/me/membership` and `/billing/me/entitlements` derive ownership
   only from the verified bearer token.
2. `/billing/me/checkout` resolves server-owned Plus/Pro Price IDs, validates
   their monthly USD amounts, and rejects duplicate/conflicting checkout.
3. Signed Stripe webhooks are the only paid-entitlement activation path; return
   URLs remain informational.
4. `/billing/me/portal` reuses the hosted Stripe management workflow.
5. USER and ORGANIZATION records, customers, audits, and authorization remain
   structurally separate.

Storage enforcement is still future work. Billing returns authoritative byte
allowances with `storage_quota_enforced: false`.

## Enterprise and organization storage

Organization subscription management continues through the existing Billing
and Stripe portal flow. Seat counts and storage-provider health are shown as
unavailable unless returned by authoritative services. Planned customer-owned
providers (AWS S3, Google Cloud Storage, Azure Blob, S3-compatible storage, and
an on-premises gateway) require a separate storage-connections workstream for
credentials, health checks, gateways, transfers, and contract-defined quotas.
Organization storage must not debit a user's personal managed-storage pool by
default.
