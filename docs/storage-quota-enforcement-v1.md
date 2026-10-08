# Storage quota UI integration

The Artifacts page reads `GET /api/storage/me/usage` through the existing
authenticated Workbench proxy. It displays personal managed-storage usage,
reserved and available bytes, membership, progress, rollout status, an upgrade
link, and over-quota guidance. A failed API request is shown as unavailable and
never normalized to zero. “Quota enforced” appears only when the backend returns
`enforcement_active=true`.

Organization storage remains separate. The page neither accepts an owner ID nor
derives quota from a plan name. Backend 413 responses normalize to
`quota_exceeded` for upload surfaces. No upload UI is introduced by this change.

Compose wires the development Workbench to Auth and Billing and defaults to
audit mode. Release configuration requires an explicit `STORAGE_BILLING_URL` and
also defaults to audit. Activation additionally requires the backend baseline
verification flag after production reconciliation and restore qualification.
