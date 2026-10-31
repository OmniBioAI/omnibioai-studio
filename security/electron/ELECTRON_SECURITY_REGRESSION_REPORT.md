# Electron security hardening — v0.8.1 candidate

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
