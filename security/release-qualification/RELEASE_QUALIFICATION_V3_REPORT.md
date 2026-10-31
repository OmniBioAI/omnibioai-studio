# OmniBioAI Studio v0.8.1 — Electron hardening qualification

**WORKSTREAM:** `OMNIBIOAI_STUDIO_V0_8_1_ELECTRON_SECURITY_AND_PACKAGED_LOGIN_HARDENING_V1`

**Assessment date:** 2026-10-31
**Decision:** `NO-GO — SPECIFIC BLOCKERS REMAIN`

## A. Where we stand

- Candidate branch: `security/studio-v0.8.1-electron-hardening`
- Implementation commit: `5f02cefb6595ce32d7a26ec1857618ae1ada830d`
- Base: `e487f649c59669663bbcf783b00db1536772d837`
- Readiness gates: 13 of 19 satisfied; one failed, three blocked, and two partial/blocked gates remain. The count is descriptive, not a release score.
- No push, tag, GitHub release, installer publication, landing-page deployment, or production deployment occurred.
- The source hardening and local builds are useful candidate evidence, but the release cannot proceed without the Auth/session and actual packaged-login evidence below.

## B. Electron security findings

### Implemented in source

- BrowserWindow now enables `webSecurity`, context isolation and sandboxing; renderer Node integration and insecure-content loading are disabled.
- The packaged renderer uses a loopback HTTP origin (`http://localhost:5174`) served by the main process rather than `file://`. The server validates the Host/method, restricts files to `dist`, rejects traversal and symlink escapes, and supplies a restrictive production CSP. Script `unsafe-inline` and `unsafe-eval` are absent; `style-src 'unsafe-inline'` remains for existing inline styling.
- Preload exposes wrappers, not raw `ipcRenderer`; event listeners are removable. All `ipcMain.handle` registrations use a main-frame sender and exact application-origin check. Configuration size and license payload shape/length are bounded; external URLs and local service URLs are constrained.
- `window.__OMNIBIOAI_SERVER__` and Auth host configuration are restored via a normalized runtime configuration source so existing service URL consumers continue to receive their configured host.
- Webviews remain enabled because `ServiceViewer` and Grafana use them. Attachment checks allow only enumerated service destinations on loopback or the configured service host, remove guest preload/Node/pop-up/web-preference escalation, and reject untrusted navigation. This is helper-level coverage, not an Electron guest-process integration test.
- Raw `.env` secret values are no longer exposed by the preload/IPC or Settings UI. Renderer-supplied `sync-auth-cookie` and arbitrary `load-url` channels are removed.

### Trust-boundary limitation

```text
Renderer ── narrow preload + validated IPC ──> Electron main ──> local config/services
   │
   ├── direct HTTP Auth requests to configured host:8001
   ├── access/refresh token persistence in localStorage
   └── JavaScript-readable cookie for existing protected iframe behavior

External HTTPS links ──> OS browser; service views ──> restricted webviews
```

The renderer still persists and can read access/refresh tokens; its cookie is not `HttpOnly`. Auth transport is still `http://<configured-host>:8001`. These behaviors were not changed because replacing them safely requires an Auth-backed secure session contract or a reviewed main-process API broker. Electron `safeStorage` alone would not solve the active renderer exposure while the UI directly sends bearer tokens. This remains a release-blocking security architecture gap.

### Regression tests

`node --test tests/electron/*.test.js` — PASS, 10/10. Coverage exercises preference objects, origin/frame checks, URL policy, webview restrictions, bounded payloads, CSP, preload API shape and the packaged static server over loopback (headers, traversal, symlink escape and Host rejection). These are unit/helper and local HTTP integration tests; they do not instantiate Electron or a packaged GUI.

## C. Staging authentication

Status: **BLOCKED; no staging login was attempted.** No staging Auth base URL, dedicated non-production account, or approved secret injection was available in the checked-out worktree/configuration. The existing source constructs Auth URLs as `http://<host>:8001`; no guessed or production endpoint was substituted.

Required inputs: staging endpoint identity and its supported CORS/cookie contract for `http://localhost:5174`, a non-production test account through an approved secret mechanism, and a disposable GUI runner. Once supplied, execute the requested valid/invalid/empty credential, unavailable/timeout/server error, session persistence, expiry, logout/re-login, restart, and protected-route cases with all credentials/cookies/tokens redacted.

## D. Packaged application and artifacts

Built from implementation commit `5f02cefb6595ce32d7a26ec1857618ae1ada830d` using Node 22.23.3, npm 10.9.9, Electron 42.11.18 and electron-builder 26.18.1 on Linux ARM64. The renderer and web/PWA outputs were rebuilt; the local ARM64 unpacked directory, AppImage and DEB were generated. Package generation is not install, launch, or login evidence.

| Artifact | Build/metadata evidence | SHA-256 | Runtime/login |
|---|---|---|---|
| `OmniBioAI Studio-0.8.1-arm64.AppImage` | ARM64 AppImage generated locally | See manifest | Not tested |
| `omnibioai-studio_0.8.1_arm64.deb` | Package metadata: `omnibioai-studio`, version `0.8.1`, architecture `arm64`, homepage `https://omnibioai.org` | See manifest | Not installed/launched; login not tested |
| `omnibioai-studio-0.8.1.aarch64.rpm` | Not generated in this run | — | Blocked: `rpmbuild` unavailable |

The builder warns `desktopName` is unset. Artifacts are unsigned; no notarization is present. A prior qualification's disposable-container DEB/RPM install-remove result applies to earlier artifacts only, not these rebuilt files. Do not reuse its hashes or install evidence.

The app was not launched because its current startup path invokes Docker Compose and performs installation-user-data setup. No disposable GUI harness was available. Linux ARM64 AppImage/DEB login, restart/session persistence, logout/uninstall, and RPM remain unverified. Linux x64, macOS x64/ARM64, and Windows x64 were not tested.

## E. Regression and dependency evidence

- Full UI suite: `npm run test:ui` — PASS, 153 files passed, 2 skipped; 2,434 passed, 2 skipped. The skipped suites are the existing tests requiring `WORKBENCH_SOURCE`.
- Electron focused suite: `node --test tests/electron/*.test.js` — PASS, 10/10.
- Desktop renderer: `npm run build:ui` — PASS; JS 1,451.06 kB minified / 380.84 kB gzip.
- Web/PWA: `npm run web:build` — PASS; JS 1,451.97 kB minified / 381.28 kB gzip; 8 entries precached.
- Both builds retain the existing Vite warning for a >500 kB chunk. They also show the existing Vite config-loader and Tailwind content warnings.
- `npm run check-docs` — PASS, service catalog matches Compose (42 services).
- Fresh npm audit: 0 critical, 0 high, 27 moderate, 2 low; production-only audit: 0 findings. No dependency changes were made.
- Node 20 was not available during this workstream; current results are Node 22 only. Earlier Node 20 qualification is historical and does not qualify this new Electron source.
- `npm run test:secrets` passed the repository's secret-generation tests; it is not a secret scanner. The approved Gitleaks script requires Docker, and current Docker socket access is denied. The prior qualification's 23 redacted directory findings and history scan are preserved as earlier evidence, but there is no fresh current-worktree full scan. No clean current scan is claimed.
- Renderer output contains current `0.8.1` package version and BETA badge. The only `v0.8.0` string found is a Workbench startup-log example; it is not a current Studio version label and was preserved.

## F. Preservation and change record

- The implementation is isolated in `/tmp/omnibioai-studio-v0.8.1-electron-hardening`; code commit `5f02cefb6595ce32d7a26ec1857618ae1ada830d` is local only.
- Release branch baseline remains `b7f547516b12d13bbb1a4e29dae26129085731a8`; dependency branch baseline remains `332a5df4dbbad40b86245faf55ee15c2b20bb93c`; v0.9 branch remains `a06b8b5aa90696873cd1fea657b1fc190e5569c8`; qualification baseline remains `e487f649c59669663bbcf783b00db1536772d837`.
- Original checkout remains on `fix/control-center-report-work-mount` at `384120b8041122c643fada943e04bb9ef59e07d9`; its existing `.bak` files and `tmp_images/` were not edited.
- The landing repository was inspected read-only at `/home/manish/Desktop/omnibioai-ecosystem/omnibioai-landing`, branch `main`, HEAD `6ed4dcb0916b666ca6e780531aa0014ea3ff72bc`; its existing untracked `reports/landing-production-deployment-report.md` was preserved.
- Implementation files are listed by the code commit. Qualification evidence is in this report, `security/electron/ELECTRON_SECURITY_REGRESSION_REPORT.md`, the updated candidate manifest, and the updated release-notes draft. No Auth repository or production service was changed.

## G. Landing-page synchronization (prepare only)

Read-only source review found current Studio references in landing repository `index.html` at the beta badge and access-request copy, `about.html` at the product badge, and `README.md` in download/release instructions. The landing page's `#download` section currently says desktop apps are coming soon; its working buttons link to the web app and beta request, not a published installer. The page has no shared Studio-version source; `data/site-data.json` drives catalog counts, not product release version.

The live HTTPS homepage was checked on 2026-10-31. It presents “Desktop apps are coming soon,” calls the web app available, has no installer URL, and the access-request copy still says Studio v0.8.0-beta. [Public landing page](https://omnibioai.org/).

After the GitHub release is formally published, update only the current-release labels/product copy in `index.html`, `about.html`, and applicable `README.md` instructions. Preserve history. Keep the web-app and access-request URLs; add platform download links only when the corresponding files are attached to the actual v0.8.1 release and verified to resolve. Then deploy the landing repo separately and check desktop/mobile HTTPS, browser errors, links and CDN freshness. No landing source or deployment was changed here; this gate is pending post-publication.

## H. Final recommendation

`NO-GO — SPECIFIC BLOCKERS REMAIN`

Do not publish v0.8.1 from this candidate yet. Highest-priority actions:

1. Provide staging Auth endpoint/CORS/session contract and a non-production account through approved secret injection.
2. Resolve plaintext renderer token persistence and HTTP Auth transport with an Auth-supported design; then add real session lifecycle coverage without altering protocol semantics speculatively.
3. Run the exact committed ARM64 AppImage and DEB in a disposable GUI environment against staging; capture login, restart persistence, expiry, logout and re-login evidence. Provide RPM tooling/environment if RPM is required.
4. Obtain a valid current-worktree secret scan in an approved Docker environment and document all findings/dispositions; rerun Node 20 qualification if required by release policy.
5. After those gates pass, refresh artifact hashes/manifest from the final reviewed commit, seek explicit owner approval, publish the GitHub release, then synchronize and deploy the landing page.

No HIPAA, legal-compliance, regulatory, or security-certification claim is made.
