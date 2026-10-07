# Organization Connections V1

## Runtime recovery — 2026-10-06

This section supersedes the historical campaign's Auth contract below. The
primary Auth checkout (`2c7eed5befe9ec9d451b0a02bc8e1199a22c47d0`) and the
running server's OpenAPI both register `GET /orgs/{org_id}/provider-keys`,
not `GET /orgs/{org_id}/provider-keys/metadata`. The latter matched the
provider mutation path and returned 405 with `{"detail":"Method Not Allowed"}`.
The existing authenticated Chrome session and Auth logs confirmed this failure.

The canonical `ProviderKeyOut` contains `provider`, `has_key`, `updated_at`,
and `updated_by_email`, with nullable metadata. Studio now projects only
`has_key` and the supported provider into its display state. GET, PUT, and
DELETE all enforce `require_org_permission_or_platform_admin("manage_org")`.
A successful GET permits showing management controls; every mutation is
independently authorized by Auth. The current canonical API does not provide
a member-only metadata read or `allowed_actions`. No email-based authorization
or frontend permission grant is used.

The web request is same-origin, carries the existing Bearer token and the
organization ID in the path, and uses `cache: no-store`, `credentials: omit`.
The existing nginx `location ^~ /orgs` forwards the unchanged method, path and
Authorization header to `auth-service:8001`. The gateway is not on this path.
No proxy or Auth changes were required; the Auth image was not stale.

The live browser session has organization ID/role context and the required
permission; the canonical API returned 200 with `provider: null` and
`has_key: false`. Only safe metadata was returned. Internal reveal requests
remain inaccessible through the public router (prefixed POST: 404; bare POST:
405 from the web fallback), and Studio never requests them.

Validation: focused Connections tests 56/56; complete Studio UI suite 839/839
across 71 files, including Account and Explore; web build and `git diff --check`
pass. Only `web-ui` was rebuilt/recreated locally. In the real browser, Retry
recovered from a transient nginx rate-limit 503 to a canonical 200 and the
empty state, with the error banner absent. A final fresh page load also returned
200 and rendered the empty state without errors or internal reveal requests.
The existing service worker needed
an update check and reload to load the new bundle. No provider credentials
were written or fabricated. Auth's pre-existing changes and Explore were
preserved. No push or external deployment was performed.

## Historical UI campaign

Foundation: `integration/account-appearance-v1` at `5c27e583bb60c927200af3e1c4e805d83e38e877`. Verified ancestors: Wave-3 `abc4bd9c8514a9ab9719fd10419fb03f9d9613f5`, Studio credential hardening `5ce649d429ae51e456a64d687600acc67ff68cc3`, Appearance `b52849845b083197ce59e1495beed71fee91a051`.

Route: `/studio/organization/connections`, available under Organization in desktop and mobile navigation. Personal Account pages remain separate. No organization picker is invented; the page uses `currentUser.orgId` from canonical session validation, never a first/default organization.

## Verified Auth contract

Source: `fix/connection-credential-boundaries`, commit `ede6e75ee8e5bbfaae7aeaf3ad5d985677d76d17`, `app/api/routes_organization_config.py` and `app/schemas/organization_config.py`.

- `GET /orgs/{org_id}/provider-keys/metadata`: requires live active organization/member context matching the access token. Returns organization scope, configured/provider, and allowed actions. Studio projects only provider, configured, and replace/remove capabilities. Credential version and administrative fields are discarded.
- `PUT /orgs/{org_id}/provider-keys/{provider}`: body `{ "api_key": "..." }`. Supported providers per `organization_config_service.SUPPORTED_PROVIDERS`: `openai`, `claude` (the wire slug for the Anthropic product, per existing Studio precedent in `LLM.jsx`/`store.js`; displayed to users as "Anthropic"); one shared `Auth.OrganizationConfig` slot. Replaces the existing provider/key. Requires `manage_org` or canonical platform-admin authorization on the server.
- `DELETE /orgs/{org_id}/provider-keys/{provider}`: same mutation authorization; removes the configured connection.
- `GET /orgs/{org_id}/provider-keys` is admin metadata, not a secret-read API; this UI does not need it. Studio never calls the internal RAG reveal endpoint.

`allowed_actions` determines management controls; frontend role claims never grant mutation authority. The server decides every request, including stale permissions. No provider health or remote-key-validity check is invented. Connected means configured, not verified operational.

## Secret and session handling

Only the password input and the pending PUT transport hold a newly entered secret. State clears at submission (including failures), cancel/Escape, provider changes, user/org/session changes, and unmount. Failed writes require re-entry. No secret storage, URL, logs, analytics, usage events, or raw backend error rendering is introduced. Dialogs explicitly block Sentry replay; inputs are masked. Mutation bodies are never read into UI state; safe metadata is reloaded after success.

Session-generation checks reject stale fetch results. The page remounts by session/user/org; outstanding work is aborted and late completions ignored. Metadata requests use no-store. Disconnected members see a read-only state and administrator guidance. Replacement/switch needs explicit checkbox confirmation; removal has a separate confirmation dialog. Neither action revokes the external provider key.

## Interaction and qualification

Dialogs provide labelled controls, initial focus, Tab/Shift-Tab wrapping, Escape, and focus restoration (after save, the page heading receives focus). Status/errors have live semantic roles. Theme tokens supply colors and borders; there are no new animations. Responsive actions stack on narrow screens. The PWA shell fallback includes the Connections route and inherited Appearance route; Auth APIs remain network-only.

Tests exercise both providers, all lifecycle flows, server-denied writes, sanitized failures, retry, stale reads/writes, user/org/session switching, absent identity, double-submit prevention, safe metadata projection, and absence of secrets in storage/URL/DOM after save. Production web browser checks use mocked canonical Auth responses, not live organization credentials.

STEP_UP=DEFERRED: no canonical recent-auth primitive is available. Personal connections, other providers/services, provider health checks, external revocation, live-backend end-to-end qualification, deployment, and package signing/notarization remain outside this campaign.

## Campaign results

- Full practical UI suite: 770 passed (67 files). The unmodified foundation: 722 passed (65 files).
- New modules: API 100% statements/branches/functions/lines; page 100% statements/functions/lines and 98.80% branches.
- Global coverage: 96.95% statements, 92.99% branches, 97.53% functions, 98.03% lines. The 95% global branch gate fails on the unmodified foundation too (92.74% branches); no unrelated coverage edits.
- Provider credential retirement: 3 passed. Secret generation: 19 passed. Python credential guards: 17 passed plus 4 subtests. Python guards used existing local test interpreters (`/private/tmp/cc_venv/bin/python` for PyYAML-dependent checks and `/private/tmp/omnibioai-credential-boundary-v1/auth/.venv/bin/python` for the others), with bytecode writes disabled; no environment packages changed.
- Production web and Electron renderer builds pass. Local unsigned macOS arm64 directory packaging passes with `--publish never`, local Electron distribution and automatic signing disabled. The shared local dependency installation produces unresolved dependency-discovery warnings; packaged Electron runtime/signing/notarization are not qualified.
- Browser qualification: built web app, mocked Auth, widths 1440/768/390; connected and replacement dialogs, mobile navigation, desktop keyboard navigation, no horizontal overflow, Light/Dark with all four accents; System/reduced-motion also covered by component tests. No live credential writes.
- Service catalog check passes (42 services). Route drift checker scans sibling directories in this temporary workspace and reports the same 36 findings on the campaign and untouched foundation; this is a pre-existing/environmental check failure, not a Connections route regression.
- `git diff --check` passes. Auth, Gateway, RAG, TES, Billing, IAM-client, Usage Phase 2, Storage Ledger and existing integration worktrees were not modified.
