# Electron security hardening — v0.8.1 candidate

> **Current status (2026-10-31):** This report has a V5 update appended below. The earlier sections describe the pre-auth-hardening state at implementation commit `5f02cefb` and are retained as historical evidence; statements there that renderer tokens remain in localStorage or packaged Auth uses HTTP are superseded for the new desktop-session code by the current update. Staging/package login remains unverified and release remains NO-GO.

**Status: PARTIAL — release remains NO-GO.** This report records source and local test evidence from `security/studio-v0.8.1-electron-hardening`, implementation commit `5f02cefb6595ce32d7a26ec1857618ae1ada830d`, based on `e487f649c59669663bbcf783b00db1536772d837`. It does not establish deployed or packaged authentication behavior.

## Trust boundaries

```text
Studio renderer (local app origin)
        │ narrow contextBridge API; every invoke checks main frame + origin
        ▼
Electron preload ── IPC ──> Electron main process ──> local config / Docker / Grafana / license
        │
        ├── direct HTTP requests ──> Auth service at configured host:8001
        ├── localStorage + JS-readable cookie: access and refresh tokens
        └── isolated webviews ──> allowlisted local services (no Node/preload)

External HTTPS links ── validated IPC ──> operating-system browser
Packaged UI: Electron main serves dist from 127.0.0.1:5174; renderer origin is http://localhost:5174
```

The preload and IPC boundary is materially narrower, but the renderer still owns and persists Auth tokens. Auth is still requested over HTTP. Those are unresolved authentication architecture risks, not closed by these changes.

## Changes and evidence

- `electron/security.js` centralizes secure BrowserWindow preferences, exact app-origin and main-frame checks, bounded configuration/license payload validation, a constrained local-service destination list, external URL validation, webview attachment restrictions, and production CSP generation. BrowserWindow enables web security, context isolation and sandboxing; disables Node integration and insecure content. Webviews remain enabled because ServiceViewer and Grafana use them; guests are restricted to configured service hosts/ports, have no preload or Node access, and cannot open popups.
- `electron/staticServer.js` serves packaged renderer files only from the packaged `dist` tree on loopback, blocks traversal/symlink escapes and unexpected Host/method values, emits production security headers, and injects only a normalized non-secret service host through a same-origin, no-store JavaScript endpoint.
- `electron/main.js` uses the secure preferences, local packaged origin, navigation/redirect and popup controls, strict webview attachment checks, sender validation for every handled IPC channel, bounded config/license inputs, HTTPS external-link handling (plus enumerated local tools), and no longer accepts renderer-supplied Auth-cookie tokens or generic `load-url` requests. Raw `.env` values are no longer returned to the renderer.
- `electron/preload.js`, `src/ui/pages/Settings.jsx`, `src/ui/lib/session.js`, `src/ui/pages/Services.jsx`, and `src/ui/pages/ServiceViewer.jsx` remove broad secret display, token-cookie IPC, fixed host leakage, and `nodeintegration="true"`; Settings now reports configured/not-configured only.
- `tests/electron/security.test.js` has 10 passing Node tests covering effective preference objects, trusted origin/frame checks, URL policy, allowlisted webview restrictions, payload limits, CSP generation, the packaged static server (including headers, host rejection, traversal and symlink escape), and preload API shape.
- Existing UI regression tests were updated to assert that renderer tokens are not sent through IPC and that Settings does not render secret values or paths.

Commands and results:

- `node --check electron/main.js && node --check electron/security.js && node --check electron/staticServer.js` — PASS.
- `node --test tests/electron/*.test.js` — PASS, 10/10. The local HTTP integration portion required host execution because the sandbox denied loopback binding.
- `npm run test:ui` — PASS, 153 files passed, 2 skipped; 2,434 passed, 2 skipped. The two skips are the existing Workbench-source-dependent tests.
- `npm run build:ui` — PASS. Main JS bundle 1,451.06 kB minified (380.84 kB gzip); existing >500 kB chunk warning remains.
- `npm run web:build` — PASS. Main JS bundle 1,451.97 kB minified (381.28 kB gzip); same chunk warning.
- `npm audit` — 29 findings: 0 critical, 0 high, 27 moderate, 2 low. `npm audit --omit=dev` — 0 findings. No dependency changes were made.

## Remaining risks / required follow-up

1. No staging Auth endpoint or dedicated test-account configuration was available in this worktree. No authentication test was attempted against production or a guessed endpoint.
2. Packaged login, token refresh/expiry, restart persistence, logout and unauthorized-route behavior were not exercised. A successful renderer build is not packaged login evidence.
3. `src/ui/lib/session.js` still stores access and refresh tokens in `localStorage` and writes a JavaScript-readable cookie without `HttpOnly`; Auth URLs remain `http://<configured-host>:8001`. An Auth-supported secure cookie/session or main-process-mediated API contract is needed before these can be closed without inventing protocol semantics.
4. `safeStorage` was not adopted: the current UI requires bearer tokens for direct API requests, and handing decrypted tokens back to the renderer would not remove active-session exposure. Linux `safeStorage` backend behavior also needs platform-specific qualification.
5. The full-worktree secret scanner could not run because Docker socket access was denied. The earlier qualification's 23 redacted findings and history scan results are prior evidence only; the current edited worktree has no fresh scanner result.
6. Node 20 was not available in the current execution environment. Current tests/builds ran with Node 22.23.3 / npm 10.9.9.
7. Electron's main process was not launched as a GUI app: startup currently invokes Docker Compose and mutates installation user data, so running it was not a safe substitute for a dedicated packaged integration harness.
8. Webviews remain an Electron-specific legacy surface. Their attachment policy is tested at the helper level, not through a real Electron guest process. Production CSP retains `style-src 'unsafe-inline'` for existing inline styles; it removes script `unsafe-inline`/`unsafe-eval`.
9. Package generation warns that `desktopName` is unset. RPM requires `rpmbuild`, unavailable here. No signatures/notarization or install/login/uninstall testing is claimed.

## Staging/package test inputs still required

- The approved staging Auth base URL and documented CORS/cookie settings for `http://localhost:5174`.
- A dedicated non-production account and approved secret-injection path, without placing credentials in repository files or logs.
- A disposable Linux ARM64 desktop/GUI environment for launching the exact AppImage and DEB artifacts and testing login, persistence, refresh, logout and restart.
- A compatible RPM builder/test environment if RPM is in v0.8.1 release scope.

No credentials, tokens, or private endpoint values are included in this report.

## V5 update — main-owned desktop session (2026-10-31)

The current implementation is on `security/studio-v0.8.1-electron-hardening` through commits `3cc1414da7a7c2bd26d2bf2499e869da90b9b85f`, `63ec5a3d822af630018fb507b7a9e8d8b3a5da76`, `3fde584d73ace15059e960e79ae55519ec36e45b`, `ec0b4d1173e8904deaf1888026aa9d255d43c06c`, and `3230d41e24c7b8dc1a8813dc336300917e8cceb8`; the report commit is recorded in the final handoff.

- `electron/authSession.js` now owns desktop Auth login, MFA challenge token, access/refresh tokens, validation, `/me`, refresh and logout. It uses the existing routes and response contract from the inspected Auth source; Auth itself was not modified.
- Packaged Auth origin is the existing `LICENSE_SERVER` value `https://webstudio.omnibioai.org`, and the desktop client rejects packaged HTTP origins and redirects. Development permits only loopback HTTP or HTTPS. Actual TLS/staging connectivity has not been tested.
- Preload exposes only explicit status/login/MFA/refresh/identity/logout operations. Every IPC goes through main-frame/origin validation. The renderer receives sanitized profile metadata and opaque MFA IDs, not raw Auth tokens or a generic authenticated-fetch method.
- Refresh-token persistence uses Electron `safeStorage`; Linux `basic_text` is refused. No plaintext or authenticated in-memory-only fallback exists; login fails closed if protected storage cannot protect the refresh token. Tests use a fake adapter, so actual OS-keychain behavior remains unverified.
- The desktop renderer clears legacy token localStorage entries and the readable access cookie. The web/PWA session implementation was not changed. `session.js` returns only a non-secret desktop session marker to legacy API clients; the main request policy strips renderer Authorization and attaches the main-owned token only for the fixed Auth origin or explicitly trusted service origins. Remote private service hosts require HTTPS; remote HTTP targets receive no bearer token.
- Electron/auth unit and helper regression suite: `npm run test:electron-security` — PASS, 29/29 on `ec0b4d11`; rerun on final source `3230d41e` passed 30/30 with host permissions for its loopback static-server integration test. Includes recovery-code compatibility, storage/validation failure, and packaged path tests. Focused app-shell, login, and session UI tests: PASS, 46/46. Full UI: PASS, 2,437 passed, 2 skipped (the UI suite was not rerun after the main-process-only `3230d41e` change). Desktop renderer and PWA builds pass on Node 22.23.3; both were built on final source.
- Initial V5 ARM64 artifacts from `ec0b4d11` are superseded. Final-source ARM64 AppImage and DEB from `3230d41e` are recorded in the V5 report and manifest. AppImage process/runtime initialization passed with isolated user data after fixing an `app.asar` runtime-path defect; visual GUI and login remain blocked, and the DEB was not installed. `latest-linux-arm64.yml` names a hyphenated AppImage filename while the actual artifact filename contains spaces; auto-update metadata requires correction. RPM is blocked because `rpmbuild` is unavailable.
- The desktop now requires account login after license entitlement; it does not silently retain the prior license-only entry behavior. Staging Auth URL/account injection were not found; no production endpoint or credentials were used. Fresh exact-commit audits report 0 critical/high, 27 moderate, 2 low and 0 production advisories. Current-file pattern scanning found no high-confidence matches; official Docker Gitleaks remains blocked by the denied Git-history mount.

See the V5 qualification report and `DESKTOP_AUTH_SESSION_ADR.md` for exact evidence and limitations. This update is not evidence of deployed behavior or formal certification.

### Final implementation follow-up — `3230d41e24c7b8dc1a8813dc336300917e8cceb8`

Packaged runtime `.env` path resolution now uses Electron `userData` rather than the read-only packaged application directory; development continues to use the source app path. A focused path test was added, and `npm run test:electron-security` passed 30/30 when rerun with host loopback permission. Final AppImage and DEB were rebuilt and hashed. AppImage process/runtime initialization passed with isolated user data and protected file modes; the environment exposed no inspectable GUI. No staging authentication or OS-keychain integration was performed. Generated update metadata has an AppImage filename mismatch (hyphenated metadata versus spaced artifact) and is a release blocker if auto-update is in scope. This update is not evidence of deployed behavior or formal certification.

## Historical V4 authentication assessment (superseded by V5) — 2026-10-31

The following records the pre-V5 finding and is retained as historical evidence only. It is superseded by the main-owned session implementation and V5 findings above; it is not a description of the current source tree.

Fresh source inspection for release qualification confirmed the blocker remains unresolved:

- The desktop Auth URL in `src/ui/lib/session.js` is still `http://<configured-host>:8001`.
- `setSession` persists both access and refresh tokens in renderer `localStorage` and mirrors the access token to a JavaScript-readable cookie.
- At least 20 UI modules depend on session token access, and 21 renderer call sites build bearer headers. A main-only `safeStorage` wrapper that returns tokens to these callers would not protect them from renderer JavaScript.
- Read-only inspection of the adjacent Auth service found that login/refresh/MFA responses still return token values in JSON. Auth also sets an HttpOnly Secure refresh cookie for `.omnibioai.org`; this cookie does not match the packaged `localhost` UI origin. Logout currently requires the refresh token in its JSON body. No Auth source was changed.
- No staging Auth origin or approved test-account injection mechanism was found in this Studio checkout or environment. Production credentials/endpoints were not used.

Fresh execution: `node --test tests/electron/*.test.js` passed 10/10 when run with host permissions. The initial sandbox run could not bind the test's temporary loopback server (`EPERM`); no test was skipped. The complete UI suite passed 2,434 tests with the same two existing `WORKBENCH_SOURCE` skips. Desktop and web/PWA builds passed on Node 22.23.3. Fresh npm audit was blocked by registry DNS (`EAI_AGAIN`). The official Git-history Gitleaks script was blocked by Docker socket permissions; a fresh directory scan was not run because no standalone scanner was available. See `security/release-qualification/RELEASE_QUALIFICATION_V4_REPORT.md` for exact command evidence and the current NO-GO decision.

No authentication-storage, Auth-transport, staging-login, or packaged-login behavior is claimed as fixed or verified.
