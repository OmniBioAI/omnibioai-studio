# ADR: Electron desktop authentication session ownership

**Status:** Implemented locally; packaged staging authentication qualification pending.
**Date:** 2026-10-31
**Scope:** Studio desktop session only. The web/PWA session implementation is unchanged.

## Decision

The Electron main process owns desktop Auth credentials. The renderer may submit login form data through one sender-validated IPC operation, but it never receives access tokens, refresh tokens, Auth challenge tokens, or authenticated-fetch primitives. The main process holds the access token in memory and persists only the refresh token, encrypted by Electron `safeStorage`, when an OS-protected backend is available. On Linux, `basic_text` is rejected. There is no plaintext fallback; login fails closed if protected storage is unavailable, and an existing opaque encrypted session file is retained for a later retry if the OS key store is temporarily unavailable.

This keeps the existing Auth request/response contract: `/auth/login`, `/users/me/mfa/challenge`, `/users/me/mfa/email/resend`, `/auth/refresh`, `/auth/validate`, `/me`, and `/auth/logout`. No Auth service was changed. Production origin is the existing main-process `LICENSE_SERVER` value, `https://webstudio.omnibioai.org`; development is restricted to loopback `http://localhost:8001`. Packaged builds reject HTTP Auth origins and redirects.

## Trust boundaries and flow

```text
Renderer (trusted Studio local origin; treated as untrusted input)
  ├─ email/password, MFA code ── narrow IPC ──> Preload ──> Main process
  ├─ receives safe profile/status + opaque MFA challenge ID only
  └─ ordinary API fetches (renderer bearer header is stripped)
                                                   │
                                                   ├─ Auth requests over HTTPS in packaged builds
                                                   ├─ access token held in memory
                                                   ├─ encrypted refresh token via OS protected storage
                                                   └─ approved main-window API requests get main-owned Authorization

Web/PWA ── existing browser session code, unchanged
External HTTPS navigation ── existing validated system-browser path
Embedded service webviews ── isolated guest; no Studio preload or Node access
```

Every auth IPC operation passes the existing exact main-frame/origin sender validation. Payload keys and values are bounded in the main session module. MFA challenge tokens remain in a main-process map and renderer-visible challenge IDs are opaque UUIDs. IPC exposes no arbitrary URL, filesystem, shell, process, raw IPC, token-read, or generic authenticated-fetch operation.

For ordinary renderer API calls, Electron's main-process `webRequest` policy removes renderer-provided Authorization headers case-insensitively. It injects the in-memory access token only for the exact HTTPS Auth origin or approved loopback HTTP service origins/ports. A configured private service host receives credentials only over HTTPS; the existing HTTP-based remote-host API configuration therefore does not receive a bearer token until that service is available over HTTPS. CORS preflights do not receive Authorization. The application CSP allows the fixed production Auth origin.

## Session lifecycle

- Login and MFA use the existing server response shape. The main process validates the resulting access token with `/auth/validate` and returns only `userId`, email, roles, permissions, and organization ID.
- Startup decrypts the refresh token if possible, calls `/auth/refresh`, validates the new access token, and refreshes encrypted persistence. Transient network errors retain the encrypted refresh file for retry; invalid/expired refresh responses remove it. Auth network calls have a 15-second timeout.
- A refresh rotates/updates the in-memory access token and persists a returned refresh token when provided. No new refresh semantics are invented.
- Logout clears memory and encrypted local state before attempting the server revocation endpoint. Network failure cannot restore renderer access, though server-side revocation is then unverified.
- Corrupt/unreadable storage is discarded and the app is signed out. Missing protected storage is surfaced via `storageStatus` and login is rejected; tokens are never written as plaintext or kept in an authenticated in-memory-only desktop session.
- Multiple-window operations are rejected because IPC accepts only the registered main window's main frame.

## Compatibility and known limitations

- Web/PWA localStorage/cookie behavior and its tests remain unchanged.
- Studio stays at v0.8.1. License validation remains a distinct entitlement operation and does not create an identity session.
- The license entitlement remains a distinct gate; after it succeeds, the desktop now displays an account-only login form to establish an identity session. This UI policy change is covered by app-shell and login tests but still requires real packaged staging verification.
- No approved staging Auth URL or non-production test-account injection was found. The production endpoint was not used for testing.
- The exact AppImage was process-smoke-tested with isolated user data and a no-op Docker shim. It initialized Chromium and protected runtime files, but this runner did not expose an inspectable X11 window. No actual packaged login, application restart, real OS keychain behavior, or service API compatibility was verified. Unit tests use an injected fake secure-storage adapter; they do not validate Electron's OS key store.
- Remote configured service hosts are commonly generated as HTTP URLs. The token policy intentionally does not send credentials to those remote HTTP targets; deployment/service HTTPS support is required for authenticated remote-host API access.

## Verification references

See `ELECTRON_SECURITY_REGRESSION_REPORT.md` and `../release-qualification/RELEASE_QUALIFICATION_V5_REPORT.md` for exact local test/build results and remaining gates. This ADR is not a security certification or production-readiness claim.
