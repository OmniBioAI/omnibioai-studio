# Billing test migration for PR #142

The prior `tests/ui/billing.test.jsx` was replaced as the Billing page moved from the old usage and payment-method console to the organization Billing design. The cases below record what that suite covered and where the behavior now lives.

## Authentication and organization selection

| Prior test | Current coverage or reason it is obsolete |
| --- | --- |
| `requires sign-in when there is no current user` | Covered by `requires sign-in when there is no current user`. |
| `shows a no-org notice when the session has no orgId and the caller isn't a platform admin` | The no-organization state and optional Membership & Plans action are covered by `shows the no-organization state and optional Membership & Plans action`; platform admins now select from `/auth/me` memberships. |
| `provides a Membership & Plans entry point without changing billing state` | Covered by `shows the no-organization state and optional Membership & Plans action`; the callback remains parent-owned navigation. |
| `shows an org picker instead of the no-org notice for a platform admin with no org of their own` | Obsolete platform-admin flow: the redesigned picker is based on `/auth/me` organization memberships. |
| `lists every organization returned by the platform-admin API` | Obsolete: the redesign no longer calls the separate platform-admin organization-list API. |
| `selecting an organization shows its billing and a way back to the list` | The redesign keeps a selector for multi-org members; covered by `shows an organization switcher only for multiple memberships`. |
| `re-queries with the search term typed into the search box` | Obsolete: the redesign has no organization search box. |
| `shows an error when loading the organization list fails` | Obsolete: the separate organization-list request was removed; identity failure falls back to an unavailable organization name. |
| `shows an empty-platform message when no organizations exist yet` | The redesigned no-organization state is covered by `shows the no-organization state and optional Membership & Plans action`; the old platform-admin list state is gone. |

## Subscription and usage

| Prior test | Current coverage or reason it is obsolete |
| --- | --- |
| `renders plan, status, features, limits and period from the API` | Summary, plan, period and usage are covered by `renders the organization identity, Free summary and three requested tabs`; the old feature matrix was removed from this design. |
| `treats a 404 subscription as 'no active subscription' without erroring` | The dashboard treats a rejected subscription as unavailable while rendering the rest of the page; the new API-error test exercises partial failure. |
| `renders every feature value and limit severity state` | The feature-value matrix is not part of the new Billing design; limit severity is covered by the 80% amber test. |
| `renders an empty limits state` | The redesigned UI renders “Usage limits are not available for this plan” when limits are empty; current default and empty-state rendering are covered by page tests. |
| `shows non-404 endpoint failures and hides unavailable limits` | Partial API errors are rendered in the page instead of blanking it; covered by `shows a billing error message instead of a blank page when an API fails`. |
| `shows the honest empty state in every section when the org has no usage in the window` | Aggregate usage empty states remain in the Usage tab; current empty results are the page defaults. |
| `renders raw usage, daily cost, and cost-by-service rows from the API` | Covered by `keeps aggregate usage and cost reports on the Usage tab`. |
| `surfaces an error when a usage endpoint call fails, without blocking the other sections` | The Usage tab still isolates calls with `Promise.allSettled`; the new page-level failure test checks visible error handling. |
| `surfaces an error from cost-history alone, leaving usage and cost-breakdown rendered` | Still isolated by `Promise.allSettled`; not duplicated in this focused redesign suite. |
| `surfaces an error from cost-breakdown alone, leaving usage and cost-history rendered` | Still isolated by `Promise.allSettled`; not duplicated in this focused redesign suite. |
| `uses the summary fallback when subscription and limits succeed` | Summary and subscription data render independently in the redesigned cards; the current Free summary test covers that composition. |
| `keeps the first usage error when later usage endpoints also reject` | Obsolete: the redesigned UI displays each rejected Usage endpoint message rather than selecting only the first one. |
| `does not call getUsageEvents — the per-user log is a deliberate exclusion from this pass` | Still true; the redesign uses aggregate organization usage endpoints and does not call `getUsageEvents`. |

## Stripe and payment method

| Prior test | Current coverage or reason it is obsolete |
| --- | --- |
| `accepts Stripe Checkout and Billing Portal origins` | Still covered in `tests/ui/stripePortal.test.js`. |
| `rejects everything else, including spoofed hosts, non-https, and malformed URLs` | Still covered in `tests/ui/stripePortal.test.js`; the new page hands off through the same guarded helper. |
| `shows the unavailable note on a 404 payment-method response (the default)` | Missing payment API data is handled in the page's unavailable states; 404 is treated as missing data. |
| `shows the same unavailable note when stripe_enabled is false` | Covered by `gates payment actions on billing permission and shows the environment state`. |
| `shows a danger badge on a non-404 payment-method load error` | Superseded by the page-level API error message rather than a payment-specific badge. |
| `falls back to a generic message when a load error has none` | Superseded by the generic fallback in the dashboard API error collection. |
| `renders a blank brand when the card has none` | The redesigned summary renders the brand from the API; the missing-brand edge does not change access or action behavior and is not separately asserted. |
| `renders the card on file and Replace card + Manage billing for a billing admin` | Card summary is retained; actions are now gated by both `org_admin` and `can_manage`, tested separately. |
| `renders 'No payment method on file' and only an Add payment method button when there is no card yet` | Empty state and action appear in the new default page test; a new test verifies the setup-session handoff. |
| `shows a note instead of action buttons when the caller cannot manage billing` | Covered by the `can_manage=false` test and the non-admin read-only test. |
| `creates a setup session and opens it via window.electronAPI.openExternal` | The new hosted Checkout test verifies setup-session creation and guarded Stripe URL handoff; Electron forwarding remains in the shared helper. |
| `falls back to window.api.openExternal when the Electron API is absent` | Shared `openStripeUrl` behavior remains unchanged; the Billing page no longer owns platform-specific handoff logic. |
| `opens setup in a separate tab on the web and preserves the current page` | The page reserves a separate tab synchronously before the API request; the new setup-session test checks that the handoff is used. |
| `refuses to open a non-Stripe-hosted URL returned by the server` | Still enforced by `openStripeUrl`; URL-origin validation remains covered in `stripePortal.test.js`. |
| `shows a danger badge when creating a setup session fails` | The redesign reports the failure inline with an alert instead of a badge; no blank page. |
| `shows a success notice from ?payment=success and strips it from the URL` | No longer needed: Stripe returns to the Billing route, which reloads authoritative payment state; the UI does not infer success from the query parameter. |
| `shows a cancelled notice from ?payment=cancelled` | No longer needed for billing correctness; cancellation leaves the existing authoritative payment summary unchanged. |
| `reserves a secure tab before requesting the session, then navigates it without replacing Studio` | The new setup flow reserves a separate tab before requesting the session and uses the shared guarded handoff helper. |
| `closes the reserved tab on session failure and preserves Studio` | Implemented in the new setup flow; failure closes the reserved tab and shows an inline error. |
| `handles popup blocking before creating any Stripe session` | Implemented in the new setup flow; a blocked popup reports an alert and does not call the setup endpoint. |
| `closes the reserved tab when the response URL is not Stripe-hosted` | Implemented in the new setup flow through the guarded helper and catch path. |
| `handles a reserved tab closed before the API response` | The shared helper rejects a closed tab; the page reports the resulting error inline. |
| `does not create duplicate sessions while the first request is pending` | Implemented by disabling the payment action while a setup request is pending. |
| `refetches authoritative payment state once on return and never infers success` | A full return to the Studio route remounts the page and fetches payment state from the API; no local success inference is used. |
| `refreshes on a hidden-to-visible transition without duplicating the focus refresh` | Obsolete: the redesign does not register duplicate payment-state refresh listeners; a route return remounts and refetches. |
| `does not refresh on focus after setup failed` | Obsolete with the removed payment refresh listeners. |
| `removes its return listeners on unmount` | Obsolete with the removed payment refresh listeners. |

## Invoices

| Prior test | Current coverage or reason it is obsolete |
| --- | --- |
| Prior tests did not cover invoice list rendering because the previous Billing page had no invoice panel. | New coverage checks the “No invoices yet” state and invoice rows; PDF links remain a documented backend gap. |
