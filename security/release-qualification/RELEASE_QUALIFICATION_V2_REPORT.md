# OmniBioAI Studio v0.8.1 — Final Release Qualification V2

Assessment timestamp: 2026-10-31 21:01 UTC. This is a local qualification; nothing was pushed, tagged, published, or deployed.

## Decision

`NO-GO — SPECIFIC BLOCKERS REMAIN`

12 of 14 explicit qualification gates passed (86%). The percentage is gate coverage, not a probability of release safety. A serious Electron browser-security configuration remains in the v0.8.1 source, and packaged authentication has not been exercised. A successful package build cannot substitute for either.

Qualification branch: `qualification/studio-v0.8.1-final`.

Reviewed application/metadata commit: `6f6c8e8932e559d2a7305d37c7d32caadc0dfb9d` (`fix(release): add homepage metadata and remove static Grafana credential example`). It is based directly on remediation HEAD `332a5df4dbbad40b86245faf55ee15c2b20bb93c`. The report/evidence commit is separate and follows this commit in the branch history.

## Source and version integrity

- `package.json`, the root lockfile, and `src/ui/lib/appVersion.js` resolve the Studio version to `0.8.1`; version-display tests passed for sidebar and header, and the BETA marker remains.
- Node 20 desktop and web output contains the `0.8.1` Studio release value and BETA. The sole `v0.8.0` occurrence in each bundle is in a Workbench example, not a Studio release label.
- The package application ID is `com.omnibioai.studio`. The package homepage was added as `https://omnibioai.org`, which is already linked from the project README. This unblocked Debian package generation without changing lockfile dependencies.
- `docs/CHANGELOG.md` still labels v0.8.1 as a release candidate. This workstream does not claim a release has happened.
- Changed source files are limited to `package.json` and `docs/DEPLOYMENT.md`. The latter replaces a static Grafana credential example with a required environment-variable reference. No auth implementation, API contract, licensing, or service-routing code changed.

## Dependency security

Fresh `npm audit` ran after clean `npm ci` in the isolated Node 20.20.2 environment, using npm 10.8.2 and the committed lockfile:

| Scope | Critical | High | Moderate | Low | Total |
|---|---:|---:|---:|---:|---:|
| Pre-remediation baseline at v0.8.1 release commit | 4 | 11 | 33 | 3 | 51 |
| Fresh full dependency tree | 0 | 0 | 27 | 2 | 29 |
| Fresh production-only tree | 0 | 0 | 0 | 0 | 0 |

The full audit exits 1 because advisories remain; the production-only audit exits 0. The raw, fresh audit outputs are preserved in `audit-full-node20.json` and `audit-production-node20.json`. Package paths/advisories are also detailed in the parent remediation record at `../dependency-remediation/audit-classification.json` and `../dependency-remediation/REPORT.md`.

The 29 remaining findings are development/build/test/packaging dependencies: Electron Builder and its `glob`/`minimatch`/`ejs`/`jake`/`temp` chain; Workbox/PWA (`workbox-build`, `vite-plugin-pwa`, Rollup node resolution); Storybook React docgen; Vitest 4.1.10; and `standard-version`/`dotgitignore`. No remaining finding is direct production code according to `npm audit --omit=dev`. The remediation report records why the suggested fixes require incompatible peer ranges or major downgrades. These are documented residual risks, not a zero-vulnerability claim; release-owner risk acceptance is still required.

### Secret-scan findings and dispositions

The committed-state directory scan completed with `--redact=100` and reports 23 matches; it is **not a clean scan**. Every finding was inspected with redacted output and is dispositioned below. The redacted JSON is `gitleaks-directory-redacted.json`.

| File and location | Rule / redacted context | Disposition and risk |
|---|---|---|
| `docs/DEPLOYMENT.md:268` | `curl-auth-user`; local health-check curl block, no credential on the reported line | Scanner false positive/context spillover. No secret at the location. Low. |
| `docs/DEPLOYMENT.md:433,436` | `curl-auth-user`; Grafana `curl --user` using `${GF_ADMIN_PASSWORD:?...}` | Current text contains an environment reference, not a credential. Compose requires the operator-provided Grafana password; no corresponding literal is configured in Compose. Accepted scanner matches. The prior hard-coded documentation example was removed. It is unknown whether any external installation reused that historical example; rotate its Grafana password if it was reused. No production secret rotation was performed. Low current-tree risk; external reuse remains unknown. |
| `tests/browser/developer-redesign.test.mjs:17` | `generic-api-key`; `FAKE_KEY` fixture, redacted | Fabricated test-only string assembled with an explicit fake suffix; not an issued key. Accepted fixture exception. Informational. |
| `tests/browser/developer-redesign.test.mjs:28-30` | `generic-api-key`; API-key `key_prefix` display fixtures, redacted | Synthetic partial prefixes used to render UI status states; prefixes are not complete credentials and have no service mapping. Accepted fixture exceptions. Informational. |
| `tests/ui/developer.test.jsx:16,19` | `generic-api-key`; active/revoked UI fixture prefixes, redacted | Synthetic partial display data in unit tests; “active” is fixture state, not evidence of an active credential. Accepted fixture exceptions. Informational. |
| `security-artifacts/devhub-security-gate-rc-v2-baseline-image-scan.json:95,421` | `generic-api-key`; `GPG_KEY=[REDACTED]` in image metadata | Public Python base-image OpenPGP release-key fingerprint, not a credential. Matches the exact public fingerprint/path described in `.gitleaks.toml`. Accepted. Informational. |
| `security-artifacts/devhub-security-gate-rc-v2-final-image-vuln.json:95,421` | Same rule/context | Same public fingerprint in image scan metadata. Accepted. Informational. |
| `security-artifacts/devhub-v2-isolated-rollback-vuln.json:95,421` | Same rule/context | Same public fingerprint in rollback image metadata. Accepted. Informational. |
| `security-artifacts/devhub-security-gate-rc-v2b-final-image-vuln.json:96,428` | Same rule/context | Same public fingerprint in image scan metadata. Accepted. Informational. |
| `security-artifacts/devhub-security-gate-rc-v1.provenance.statement.json:1` (6 findings) | Same rule/context | Six occurrences of that public fingerprint in BuildKit provenance. Not a signing secret or access credential. Accepted. Informational. |

Changed-file scan results: the two changed files contain three scanner matches in the environment-based Grafana curl examples/context above; `package.json` has none. All 23 directory findings have explicit dispositions, but the scanner still reports them. The first history scan after the documentation change found two alerts on the deleted lines in commit `6f6c8e8`; redacted inspection confirmed they were deletion-diff detections of the former example, not current values. Exact commit/file/rule/line fingerprints were added to `.gitleaksignore` in `798fde0194bf2876efb59fb81fb3f0a67d91b139`. The official history scan then passed: 724 commits / approximately 240.19 MB, no unignored leaks. The final report-only commit is followed by another final scan. History exceptions do not make the directory scan clean.

## Runtime, tests, and builds

Node 20.20.2 / npm 10.8.2 was obtained from the official Node container; the DGX host runtime was not changed. `npm ci` passed (1,022 packages). It emitted `EBADENGINE` warnings because Electron 42.11.18, `@electron/get`, `@electron/rebuild`, and `node-abi` declare Node `>=22.12.0`. Despite those warnings, the project's actual Node 20 CI operations all passed below, including the ARM64 installer matrix. Keep the engine mismatch visible; successful commands do not erase the declarations.

An initial host Node 22 `npm ci --offline` attempt failed because the restricted host sandbox denied executing the installed esbuild child (`EPERM`). A fresh install in an isolated Node 22.23.4 container then passed. A direct host `npm audit` initially failed registry DNS (`EAI_AGAIN`); the clean Node 20 container audit succeeded against npm registry and is the recorded current result.

- Focused version/sidebar/header tests: **2 files, 51 passed**, exit 0.
- Full UI suite: **153 files passed, 2 skipped; 2,434 passed, 2 skipped**, exit 0. The skipped tests are `tests/ui/workbench-catalog-contracts.test.js` and `tests/ui/promoted-plugin-live-contracts.test.js`; both require `WORKBENCH_SOURCE` and are not blanket skips.
- Secret-generation test: **1 passed**, exit 0.
- Service-catalog documentation check: **42 Compose services matched**, exit 0.
- Desktop renderer production build: **PASS**, 1,452.37 kB minified JavaScript.
- Web/PWA production build: **PASS**, 1,453.30 kB minified JavaScript; service worker generated, 8 precache entries (~1,661 KiB).
- Both builds retain the existing >500 kB chunk warning. Bundle size is comparable to the previously recorded baseline; no performance refactor was made.
- No dedicated lint, typecheck, Electron security, Electron login, or packaged-auth integration script/test suite is configured. The full UI suite includes auth component tests but does not establish packaged Electron behavior.

## Electron security and login

**FAIL — release blocker.** On the release candidate source, `electron/main.js:315-319` has `nodeIntegration: false` and `contextIsolation: true`, but also `webSecurity: false`, `allowRunningInsecureContent: true`, and `webviewTag: true`. These are high-risk renderer/browser controls. The remediation branch upgraded Electron but did not include the separate unfinished v0.9 security work; this configuration is still present. No Electron-specific regression suite verifies attachment policy, navigation, IPC sender validation, or packaged authentication.

**BLOCKED — packaged login not tested.** No non-production test account/auth endpoint was supplied, and this environment has no X virtual display. Development, unpacked, AppImage, DEB, and RPM login/session recovery were not tested. In particular, packaged `file://` origin behavior, Auth CORS/cookie rules, token persistence/refresh, logout invalidation, and restart recovery remain unverified. No production credentials were attempted. A package build or the React login tests is not packaged-login evidence.

## Linux ARM64 packaging

Node 20.20.2 / npm 10.8.2 / Electron 42.11.18 / electron-builder 26.18.1, Linux ARM64:

- Unpacked application directory: PASS.
- AppImage: PASS, 95,792,562 bytes.
- DEB: PASS, `omnibioai-studio` version `0.8.1`, architecture `arm64`; package file layout and desktop entry inspected.
- RPM: PASS, version `0.8.1`, architecture `aarch64`.
- DEB and RPM package-manager install/remove operations passed in disposable ARM64 containers. Dependency resolution was forced/omitted because the isolated container is not a complete desktop OS; these checks establish package scripts/file removal, not runtime library availability. One initial custom-root harness attempt failed; the subsequent normal disposable-container install/remove checks passed.
- The first combined Node 22 package command stopped at RPM because that container lacked `rpmbuild`; after installing CI-equivalent RPM tooling inside a disposable container, the RPM target passed. The subsequent Node 20 CI-style matrix built all three targets successfully.
- AppImage file is ARM64 ELF. AppImage mounting/launch, application startup, and GUI behavior were not verified. The package builder warns that `desktopName` is not configured; package generation succeeds, but desktop window association should be corrected before claiming desktop polish.
- All three installer artifact SHA-256 values are recorded in `RELEASE_CANDIDATE_MANIFEST.json`; artifacts are in `/tmp/obai-studio-node20-qual-results/installers/` and are not committed or published.
- Linux x64, macOS x64/ARM64, and Windows x64 were not built or run. Their configuration entries are not platform qualification.
- No code-signing or notarization evidence/configuration was found for these artifacts. Checksums are generated, not signed provenance.

## Release gate summary

| Gate | Result | Evidence / outstanding |
|---|---|---|
| Source integrity | PASS | Qualification branch; reviewed two-file source commit; report/evidence commit follows. |
| Version integrity | PASS | Package/lock/UI helper/tests and generated artifacts identify 0.8.1; BETA retained. |
| Critical/high advisories | PASS | 0 critical, 0 high in fresh audit. |
| Production dependency audit | PASS | 0 production findings. |
| Secret scan | PASS WITH ACCEPTED EXCEPTIONS | 23 directory matches individually dispositioned; scan itself remains non-clean. |
| Node 20 compatibility | PASS WITH CAVEAT | CI tests, builds, and ARM64 packages pass on Node20; npm reports Electron-related engine warnings (`>=22.12.0`). |
| UI regression | PASS | 2,434 pass, 2 expected skips. |
| Desktop build | PASS | Production renderer build. |
| Web/PWA build | PASS | Production build and service worker. |
| Electron security regression | FAIL | Insecure browser settings remain; no dedicated regression suite. |
| Packaging | PASS — Linux ARM64 only | Unpacked, AppImage, DEB, RPM generated; package lifecycle checked. Other platforms unverified. |
| Packaged login | BLOCKED | No test auth endpoint/account or GUI test environment; important origin/session flows unverified. |
| Documentation | PASS — draft only | This report, draft release notes, and manifest are present; changelog still says release candidate. |
| Preservation | PASS | Original release/v0.9/original worktrees unchanged; no remote publication or deployment. |

Issue #100 remains open. Existing README says its production verification items carry forward to v0.9; no v0.8.1 release rule requiring closure was found. No production evidence for its six areas is claimed here.

## Required before release can proceed

1. Resolve the Electron security configuration (`webSecurity`, insecure content, and webviews) with focused security regression coverage; preserve legitimate desktop functionality.
2. Run packaged login/session/refresh/logout/restart tests against a staging Auth service and dedicated non-production test account. Confirm the packaged origin/CORS/cookie contract; do not broaden CORS or disable browser security as a workaround.
3. Re-run qualification against the security-fixed commit and verify package startup/login, not only installation.
4. Obtain release-owner acceptance for the 27 moderate and 2 low development/build advisories and the explicit Linux ARM64-only release scope, or address them safely.
5. Decide whether to configure `desktopName`; validate signed/provenance requirements and any desired x64/macOS/Windows artifacts.

Until items 1–3 pass, do not tag or publish v0.8.1. This is not a HIPAA, legal-compliance, or security-certification claim.
