# OmniBioAI Studio v0.8.1 authentication and packaged qualification V5

Assessment date: 2026-10-31
Branch: `security/studio-v0.8.1-electron-hardening`
Implementation commits: `3cc1414da7a7c2bd26d2bf2499e869da90b9b85f`, `63ec5a3d822af630018fb507b7a9e8d8b3a5da76`, `3fde584d73ace15059e960e79ae55519ec36e45b`, `ec0b4d1173e8904deaf1888026aa9d255d43c06c`, `3230d41e24c7b8dc1a8813dc336300917e8cceb8`
Decision: **NO-GO**

## Architecture

```text
Licensed packaged renderer (no Node; isolated/sandboxed)
  ├─ credentials/MFA code -> narrow sender-validated preload IPC
  ├─ safe session/profile status <- main process
  └─ renderer bearer headers stripped; main policy adds its token only to trusted destinations
                                      |
Electron main process                 ├─ HTTPS Auth origin (packaged)
  ├─ access/MFA tokens: memory only   ├─ existing Auth routes/rotation contract
  └─ refresh token: safeStorage       └─ protected userData session file

Web/PWA -> existing browser session behavior, unchanged
```

The Auth contract was derived read-only from the adjacent Auth source: `/auth/login`, rotating `/auth/refresh`, `/auth/validate`, `/auth/logout`, `/users/me/mfa/challenge`, `/users/me/mfa/email/resend`, and `/me`. No endpoint or staging hostname was invented. Packaged Auth rejects HTTP, credentials in URLs, redirects, query/fragment/path origin configuration, and TLS downgrade. Linux `safeStorage` `basic_text` is rejected. The renderer receives no raw access, refresh, or MFA challenge token and no arbitrary IPC/authenticated-fetch API.

The existing license gate remains an entitlement check. A licensed but unauthenticated desktop now gets the account-only password/MFA screen. Legacy renderer token keys/cookie are cleared; web/PWA storage is unchanged.

## Validation matrix

Environment: Linux ARM64; Node 22.23.3; npm 10.9.9; Electron 42.11.18; electron-builder 26.18.1.

| Check | Command | Result |
|---|---|---|
| Focused Electron/auth | `npm run test:electron-security` | PASS, 30/30; localhost test required host permission |
| Focused UI auth/shell | `npm run test:ui -- --run tests/ui/session.test.js tests/ui/auth.test.jsx tests/ui/app-shell.test.jsx` | PASS, 46/46 |
| Full UI | `npm run test:ui` | PASS, 153 files / 2,437 tests; 2 existing `WORKBENCH_SOURCE` skips |
| Electron syntax | individual `node --check` calls for `electron/main.js`, `authSession.js`, `preload.js`, `security.js`, `runtimePaths.js` | PASS |
| Desktop renderer | `npm run build:ui` | PASS; 1,453.23 kB JS / 381.46 kB gzip; existing config-loader/chunk warnings |
| Web/PWA | `npm run web:build` | PASS; 1,452.68 kB JS / 381.65 kB gzip; PWA generated |
| Full dependency audit | `npm audit --json` | PASS for critical/high (0/0); 27 moderate and 2 low dev/build findings remain |
| Production audit | `npm audit --omit=dev --json` | PASS, 0 advisories |
| Changed/worktree high-confidence secret patterns | local redacted `rg` scan | PASS, zero current-file matches |
| Official Gitleaks history/worktree | `bash scripts/secret-scan.sh` | BLOCKED; Docker history mount denied as an unsafe third-party-container data transfer |
| Limited history patterns | `git log -p ... | rg ...` | REVIEWED: two historical matches only in tracked generated Chromatic code, commits `8231fc44` and `701e38b1`; not current files or this change |
| Node 20 | tool discovery (`nvm`, `fnm`, `volta`, `n`) | BLOCKED; only Node 22.23.3 available |
| AppImage/DEB | `npm run build:ui && npx cross-env OMNIBIOAI_DEV_MODE=false electron-builder --linux AppImage deb --arm64 --publish never -c.directories.output=/tmp/studio-v0.8.1-auth-3230-mYy6i7` | PASS build |
| RPM | `command -v rpmbuild rpm` | BLOCKED; unavailable |
| AppImage process smoke | isolated 30-second run with temporary XDG roots/no-op Docker and `--disable-gpu` | PASS runtime initialization; visual GUI BLOCKED |
| Packaged HTTPS login/lifecycle | repository/config/environment staging search | BLOCKED; no approved staging origin/account injection |

The full UI suite ran before `3230d41e`; that commit changed only Electron main/runtime-path code and its Electron test. The affected Electron suite and package build were rerun afterward. Web/PWA was rerun at `3230d41e`.

## Artifacts

Exact source commit: `3230d41e24c7b8dc1a8813dc336300917e8cceb8`.

| File | Bytes | SHA-256 |
|---|---:|---|
| `/tmp/studio-v0.8.1-auth-3230-mYy6i7/OmniBioAI Studio-0.8.1-arm64.AppImage` | 95,800,883 | `188de8351ad4f2662669a246d0836eafd9d40e2e11849388f873ea4a0c33967e` |
| `/tmp/studio-v0.8.1-auth-3230-mYy6i7/omnibioai-studio_0.8.1_arm64.deb` | 96,623,392 | `e82d630772eb36e12967429498845b7dfb624e00f14a4a6d4dff5a80231fc893` |

DEB metadata: `omnibioai-studio`, `0.8.1`, `arm64`, homepage `https://omnibioai.org`. The packaged `electron/main.js` Git blob matched the implementation commit. These hashes prove identity, not login or release acceptance.

## Package smoke finding and fix

The first exact-candidate AppImage run found that packaged runtime secret initialization targeted `app.asar`, raising `EEXIST` before window creation. Commit `3230d41e` moved the packaged `.env` to Electron user data and added a test. The rebuilt artifact created `.env` and Redis ACL inputs under isolated user data with `0600` file modes and did not repeat the exception. The X11 runner showed no inspectable window, so visual GUI launch remains BLOCKED.

## Packaging-audit integration

The audit worktree remains unchanged at `452d52ee745a278e0b7b8e32970854d97fa96cb5`; nothing was merged or cherry-picked. Its `npm ci`, LICENSE inclusion, checksum tooling/CI and packaging runbook are applicable after authentication qualification. It overlaps `package.json`, `package-lock.json`, builder configuration and CI, not the authentication session files. Integration should occur in the later release-engineering workstream.

Open audit findings remain: updater metadata names `OmniBioAI-Studio-0.8.1-arm64.AppImage` while the built file contains spaces; RPM is blocked; reproducibility, installation, upgrade, uninstall, rollback, signing/notarization, visual GUI, and final full-set integrity are unverified. `desktopName` remains unset. Optional signing/notarization is not treated as an ARM64 Linux blocker unless declared in scope.

## Changes since V4

V4 at `e83d24adf1f21614c589714c57e64df8b7824795` reported renderer-readable tokens, HTTP desktop Auth, no protected session, and no packaged login path. V5 adds main-owned access/refresh/MFA state, OS-protected refresh persistence with no plaintext fallback, packaged HTTPS origin enforcement, redirect rejection, sender/frame-validated IPC, safe renderer status, legacy desktop token cleanup, account login after license entitlement, request timeouts, lifecycle/error coverage, and a packaged-user-data path fix found by the actual AppImage smoke test.

Still unresolved: no approved staging environment/account; no actual packaged login/API/restart/refresh/revocation/logout/keychain evidence; no visual GUI evidence; updater filename mismatch; RPM/tooling and package lifecycle gaps; official Gitleaks scan blocked; 27 moderate/2 low development findings; Node 20 unavailable.

## Preservation and recovery

- `backup/studio-v0.8.1-electron-hardening-pre-auth-20261031` -> `b786aa69c6d25fa53dfb3b7dab1dd01a3d682471`
- `backup/studio-v0.8.1-electron-auth-20261031` -> `e83d24adf1f21614c589714c57e64df8b7824795`
- Packaging branch/worktree -> `452d52ee745a278e0b7b8e32970854d97fa96cb5`, unchanged
- No push, tag, release, main merge, production Auth/configuration change or deployment occurred.

# WHERE WE STAND

### Overall status
- Overall readiness: PARTIAL; source security implementation and automated tests pass, mandatory packaged evidence does not.
- Release decision: **NO-GO**.
- Authentication implementation: PASS at source/unit level.
- Authentication security: PASS for designed renderer/main/storage boundary; real OS-keychain behavior BLOCKED.
- HTTPS transport: PASS policy/unit; real staging TLS flow BLOCKED.
- Session lifecycle: PASS unit/helper; packaged lifecycle BLOCKED.
- Packaging: AppImage/DEB built and identified; release lifecycle incomplete.
- Packaged login: BLOCKED.
- Main integration readiness: NOT READY until mandatory package/login gates and packaging fixes close.

### Implementation
- Files changed: Electron session/main/runtime paths/security policy/preload, desktop session/UI entry, tests, ADR and qualification documents across commits listed above.
- Architecture changes: main-owned tokens/MFA, protected refresh persistence, narrow validated IPC, trusted-destination request policy.
- Security improvements: no renderer desktop tokens, no plaintext fallback, HTTPS-only packaged Auth, redirect rejection, fail-closed storage, bounded requests.
- Compatibility preserved: existing Auth routes/rotation, roles/permissions/org profile, license entitlement separation, web/PWA session behavior.
- Local commits created: `ec0b4d1173e8904deaf1888026aa9d255d43c06c`, `3230d41e24c7b8dc1a8813dc336300917e8cceb8` (plus prior local `3cc1414d`, `63ec5a3d`, `3fde584d`).

### Validation
- Focused tests: PASS, 46/46 UI.
- Full UI tests: PASS, 2,437 passed / 2 skipped.
- Desktop build: PASS.
- Web/PWA build: PASS.
- Security tests: PASS, 30/30.
- Dependency audit: PASS critical/high; 27 moderate / 2 low remain. Production PASS, 0.
- Secret scan: limited local scans PASS/current clean; official Gitleaks BLOCKED.
- AppImage: PASS build/hash/process initialization.
- DEB: PASS build/hash/metadata; install NOT RUN.
- RPM: BLOCKED.
- Packaged GUI launch: BLOCKED visual; process initialization PASS.
- Packaged HTTPS login: BLOCKED.
- Session lifecycle: PASS unit; BLOCKED package.

### Evidence
- Exact report paths: `security/release-qualification/RELEASE_QUALIFICATION_V5_REPORT.md`, `security/release-qualification/KNOWN_ISSUES_V0.8.1_BETA.md`, `security/electron/ELECTRON_SECURITY_REGRESSION_REPORT.md`, `security/electron/DESKTOP_AUTH_SESSION_ADR.md`, `security/electron/SESSION_LIFECYCLE_TEST_REPORT.md`, `security/release-qualification/PACKAGED_APPLICATION_QUALIFICATION_REPORT.md`, `security/release-qualification/REMAINING_INFRASTRUCTURE_DEPENDENCIES.md`.
- Exact commit SHAs: implementation `3230d41e24c7b8dc1a8813dc336300917e8cceb8`; V4 `e83d24adf1f21614c589714c57e64df8b7824795`; packaging audit `452d52ee745a278e0b7b8e32970854d97fa96cb5`.
- Artifact paths: listed above.
- SHA256 checksums: listed above.

### Remaining blockers
- Code blockers: none known in the authentication implementation after the completed automated checks. Final review may still require narrowing or explicitly accepting the authenticated destination-broker policy.
- Infrastructure blockers: approved HTTPS staging Auth, non-production account injection, real OS key store and controllable expiry/revocation.
- Packaging blockers: updater filename mismatch; visual GUI, install/upgrade/uninstall/rollback, RPM if in scope, reproducibility and full-set integrity.
- Environment limitations: no inspectable X11 window, no RPM tools, no Node 20, official Docker Gitleaks denied.
- Optional release improvements: declared-scope signing/notarization/provenance, SBOM/notices, chunk splitting and `desktopName`.

### Changes since V4
V4's renderer-token, HTTP Auth and absent protected-session failures are implemented and covered by automated tests. Mandatory real packaged staging authentication and full artifact lifecycle evidence remain unresolved.

### Next priority
Provide the approved HTTPS staging Auth origin and authorized non-production account in a disposable ARM64 GUI/keychain environment, then run the exact AppImage and DEB through login, restart, refresh/expiry, revocation, logout and network/storage-failure cases.

No production-readiness, HIPAA, regulatory or security-certification claim is made.
