# OmniBioAI Studio v0.8.1 — final authentication and packaged release qualification

**Workstream:** `OMNIBIOAI_STUDIO_V0_8_1_FINAL_AUTHENTICATION_AND_PACKAGED_RELEASE_QUALIFICATION_V1`

**Assessment date:** 2026-10-31
**Decision:** `NO-GO — authentication storage, secure transport, and packaged login remain unverified.`

## Result

- Branch: `security/studio-v0.8.1-electron-hardening`.
- Application/security implementation source commit: `5f02cefb6595ce32d7a26ec1857618ae1ada830d`.
- Prior qualification report commit: `b786aa69c6d25fa53dfb3b7dab1dd01a3d682471`.
- Recovery reference created before this assessment: `backup/studio-v0.8.1-electron-hardening-pre-auth-20261031` at `b786aa69c6d25fa53dfb3b7dab1dd01a3d682471`.
- The branch was clean before this report update. No application source changes were made in this qualification pass because a safe token-storage migration cannot be completed against the currently established client/server contract without either a broad, untested API broker or an Auth-side contract change.
- No push, tag, release, public artifact upload, production deployment, or production Auth/configuration change occurred.

## Authentication flow and trust boundaries

```text
Packaged Electron renderer (http://localhost:5174)
  ├─ Login / MFA / refresh / validation ── direct fetch over HTTP ──> configured-host:8001 Auth
  ├─ access + refresh JWTs ── localStorage and JS-readable cookie
  └─ Authorization: Bearer <access token> ── direct fetch ──> Auth and multiple API clients

Preload (contextBridge, narrow wrapper API) ── validated IPC ──> Electron main
Electron main ── local packaged static server, local services, OS browser
```

The Electron boundary hardening from `5f02cefb` protects privileged main-process operations, but it does not own the active Auth session. `src/ui/lib/session.js` reads/writes both tokens in renderer `localStorage`, mirrors the access token into a script-readable cookie, and sends requests directly. At least 20 UI modules consume session getters, and 21 renderer call sites construct bearer authorization. The platform has no single authenticated request broker today.

The adjacent Auth checkout was inspected read-only to establish the source contract visible in that checkout; it is not part of this Studio worktree, its current commit/deployment identity was not qualified here, and it was not changed. Its `/auth/login`, `/auth/refresh`, and MFA completion handlers return access/refresh token values in JSON. They also set `omnibioai_session` as a `Secure`, `HttpOnly`, `SameSite=Lax` refresh cookie for `.omnibioai.org`. `/auth/refresh` can fall back to that cookie, but `/auth/logout` requires `refresh_token` in its request body. The cookie domain does not match the packaged renderer's `localhost` origin, and the Studio Auth URL is HTTP on port 8001. Thus, simply adopting `safeStorage`, or merely removing localStorage writes, would not preserve existing bearer-authenticated API behavior. This source inspection does not prove what is deployed in staging or production.

### Required architecture decision / external Auth contract

Before implementation, the release owner and Auth owner must select and document one of:

1. A main-process session and request broker that owns access/refresh secrets and performs all explicitly allowlisted authenticated Auth/API requests. Existing renderer clients must be migrated off raw tokens; destination, method, payload, response, timeout, cancellation and file-transfer contracts need explicit bounded schemas. This is a substantial but Studio-local compatibility migration and requires full integration coverage.
2. An Auth/service-gateway supported desktop session contract that never returns durable credentials to renderer JavaScript, is available over HTTPS at a configured trusted origin, supports login/MFA/refresh/revocation and logout, and allows the required API calls without renderer bearer tokens. The current adjacent Auth implementation does not provide this whole contract as evidenced above.

No staging Auth origin, documented staging CORS/cookie policy, approved non-production account injection, or disposable packaged GUI runner was present in Studio docs/configuration or the environment. No production endpoint or credential was substituted. Staging and packaged login tests were not attempted.

## Transport and storage assessment

| Requirement | Current evidence | Result |
|---|---|---|
| Renderer cannot read authentication secrets | Tokens remain in renderer `localStorage` and an ordinary JS-readable cookie | **FAIL / release blocker** |
| Persistent storage protected by OS | Electron `safeStorage` is not used; no plaintext fallback redesign exists | **NOT IMPLEMENTED** |
| Packaged Auth uses HTTPS | `authUrl()` constructs `http://<host>:8001` for the desktop renderer | **FAIL / release blocker** |
| Trusted Auth origin available | Host is configurable from runtime/local configuration; no approved staging endpoint/origin supplied | **BLOCKED** |
| Refresh and logout semantics | Source contract uses refresh-token JSON; logout requires refresh token body | Code behavior inspected; **not packaged-tested** |
| Auth API contract preserved | No Auth or Studio Auth contract changed | **PASS (unchanged)** |

No transport guard was added that would knowingly disable the current packaged login path without a verified HTTPS endpoint. No insecure TLS exception was introduced. No `safeStorage` wrapping was added that would decrypt tokens back into JavaScript and falsely label that secure.

## Fresh verification on branch HEAD

Tests and builds ran at branch HEAD `b786aa69c6d25fa53dfb3b7dab1dd01a3d682471`; the only intervening commit after application implementation `5f02cefb6595ce32d7a26ec1857618ae1ada830d` updated qualification documentation. No application source was changed between these commits.

Runtime: Node `v22.23.3`, npm `10.9.9`.

| Check | Command/result |
|---|---|
| Focused UI/auth shell tests | `npm --prefix packages/omnibioai-ui run test:app -- --run tests/ui/auth.test.jsx tests/ui/app-shell.test.jsx tests/ui/nav-components.test.jsx` — **PASS**, 3 files / 55 tests |
| Full UI suite | `npm run test:ui` — **PASS**, 153 files passed, 2 skipped; 2,434 passed, 2 skipped. Existing skips require `WORKBENCH_SOURCE`. |
| Electron security tests | `node --test tests/electron/*.test.js` — **PASS**, 10/10. One sandbox attempt failed only because loopback bind was denied (`EPERM`); rerun with host permissions passed, including the local static-server HTTP test. |
| Desktop renderer production build | `npm run build:ui` — **PASS**, JS 1,451.06 kB minified / 380.84 kB gzip. Existing >500 kB chunk and Vite config-loader warnings remain. |
| Web/PWA production build | `npm run web:build` — **PASS**, JS 1,450.78 kB minified / 380.86 kB gzip; PWA generated, same chunk/config warnings. |
| UI version | Builds include current Studio `0.8.1` and BETA. `v0.8.0` in `src/ui/pages/Logs.jsx` is a sample Workbench log line, not a current Studio version label, and remains unchanged. |
| Node 20 | **BLOCKED** in this environment: Node is 22.23.3; `nvm`, `fnm`, and `volta` are unavailable. No system runtime was changed. |
| Fresh npm audit | **BLOCKED**: registry request failed DNS resolution (`EAI_AGAIN registry.npmjs.org`). This is not an audit pass. The prior completed audit at the same source commit reported 0 critical, 0 high, 27 moderate, 2 low; production-only 0. Those results are historical for this pass, not a fresh audit. |
| Official Git-history secret scan | **BLOCKED**: `bash scripts/secret-scan.sh` attempted the repository-approved Docker Gitleaks container and failed with permission denied on `/var/run/docker.sock`. No raw secret output was produced. |
| Fresh working-tree/directory secret scan | **NOT RUN**: the checked-in script scans Git history, not the current directory; no standalone `gitleaks` binary is installed, and the Docker execution path is unavailable. The prior 23 redacted directory findings/dispositions are historical evidence only. |
| RPM tooling | **BLOCKED**: `rpmbuild` unavailable. |

## Existing ARM64 artifacts

The following previously built artifacts still match the implementation source commit `5f02cefb6595ce32d7a26ec1857618ae1ada830d`; no application source changed after that build. Checksums and DEB metadata were re-read in this pass.

| Artifact | Size | SHA-256 | Verification |
|---|---:|---|---|
| `release/OmniBioAI Studio-0.8.1-arm64.AppImage` | 96,198,429 bytes | `e0aedefcb0fdec84f2e1b3b4a90ec99b54474909528e427b34f814872e08785b` | File/hash only; launch/login not tested |
| `release/omnibioai-studio_0.8.1_arm64.deb` | 96,638,496 bytes | `f3b515810fccd8462c805c991cb2fb728681388483c633d03c5b103d74ec9cde` | `dpkg-deb`: package `omnibioai-studio`, version `0.8.1`, architecture `arm64`, homepage `https://omnibioai.org`; install/launch/login not tested |
| RPM | — | — | Not built; `rpmbuild` unavailable |

These hashes establish artifact identity, not security or functional acceptance. The application was not launched: current startup invokes Docker Compose and can modify installation/user state, and no disposable GUI runner was available. No packaged login, session persistence, expiry, logout, restart, or network-failure case passed. No HTTP Auth request capture was performed because there was no staging target and production use was prohibited.

## Preservation

- Original development checkout remains `fix/control-center-report-work-mount` at `384120b8041122c643fada943e04bb9ef59e07d9`; its three pre-existing `.bak` files and `tmp_images/` remain present. The checkout status still lists those same user-owned assets as untracked; none was changed.
- Release, dependency-remediation, qualification and v0.9 branch refs were re-resolved and remain at `b7f547516b12d13bbb1a4e29dae26129085731a8`, `332a5df4dbbad40b86245faf55ee15c2b20bb93c`, `e487f649c59669663bbcf783b00db1536772d837`, and `a06b8b5aa90696873cd1fea657b1fc190e5569c8`, respectively. No commands modified those worktrees or refs.
- The pre-auth recovery branch points at the pre-assessment report commit. Current branch was clean before report edits; build outputs are ignored/generated and do not appear in Git status.
- No other worktree was edited.

The original checkout was checked read-only for branch, HEAD, status, and presence of the three backup files and `tmp_images/`; all match the expected preserved state. No contents were read or altered.

## Required next action

Have the Studio/Auth owners approve the desktop authentication architecture and provide a real HTTPS staging origin plus approved test-account secret injection. Then implement the chosen contract in a disposable qualification worktree, add broker/session regression tests, run actual packaged login/lifecycle checks on the final AppImage and DEB (RPM only if in supported scope), refresh audits/scans in approved environments, rebuild artifacts, and make a new GO/NO-GO decision. Until then, v0.8.1 publication remains **NO-GO**.

No HIPAA, regulatory, legal-compliance, or security-certification claim is made.
