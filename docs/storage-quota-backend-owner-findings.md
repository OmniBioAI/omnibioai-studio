# Per-user storage quota backend review findings

These findings came from a read-only review of Workbench commit
`79feb3da5c568fd0722bcf1708517c49c573f3d8` and Billing commit
`ee4faca41cbdf0af2fb005bdaf641a3cd578d1f0`. They are for the Workbench
Storage Ledger owner; entitlement refresh depends on Billing availability.
No backend files, production data, or configuration were changed.

## A failed Billing refresh can be reported as fresh

In `storage_ledger/service.py`, `user_projection()` records
`cached_or_unavailable` if `refresh_user_entitlement()` raises, then separately
checks whether the cached entitlement is less than five minutes old. When it
is, the returned `entitlement_status` is set to `fresh` regardless of the
failed refresh. Studio can therefore display a cached allowance without the
available response field indicating that Billing could not refresh it. Keep
freshness and refresh outcome as separate facts in the projection, or preserve
the failure status while returning an explicitly marked recent cached value.
Add a focused test for a failed Billing request with an entitlement timestamp
inside the five-minute window.

Relevant code: `storage_ledger/service.py`, `refresh_user_entitlement()` and
`user_projection()`; `storage_ledger/authority.py`, `user_entitlement()`.

## The reconciliation timestamp is not maintained by the audit command

`UserStorageAccount.last_reconciled_at` is nullable and is included in the
personal usage response, but the reviewed reconciliation code does not update
it. `storage_quota_reconcile` reports counter mismatches, missing accounts,
and legacy ledger allocations without recording a successful per-user check.
The physical scan intentionally avoids the general `artifacts/` tree because it
contains legacy and untracked content. Therefore a zero counter or a timestamp
alone cannot establish that all existing managed files were counted.

Workbench should define what evidence qualifies as a complete user baseline,
account for legacy content or explicitly keep it unknown, and only then expose
a trustworthy reconciliation status/time. Keep quota enforcement in audit
mode until the owner has reviewed the findings and qualified the baseline.

Relevant code: `storage_ledger/models.py`, `UserStorageAccount`;
`storage_ledger/reconciliation.py`, `audit_user_accounts()` and
`reconcile_local()`; `storage_ledger/management/commands/storage_quota_reconcile.py`;
`storage_ledger/service.py`, `user_projection()`; and `storage_ledger/views.py`,
`personal_usage()`.

## Suggested owner verification

In an approved non-production environment, run the bounded reconciliation
command in audit mode and review `counter_findings`, `expired_reservations`,
and `physical_findings` for the relevant user. A clean ledger-row comparison
does not by itself census untracked legacy files. The Workbench owner should
define and document any required legacy inventory before setting or trusting a
complete-baseline marker. No production command or migration was run for this
review.
