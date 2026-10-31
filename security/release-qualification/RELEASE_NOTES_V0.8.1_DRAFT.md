# OmniBioAI Studio v0.8.1 — release-notes draft

**Qualification status: NO-GO. Do not publish these notes or artifacts yet.**

## Candidate changes

- Keep the Studio release version consistent at v0.8.1 in the UI and application metadata.
- Correct the omics renderer test to import its registry from the owning module.
- Refresh vulnerable dependencies. The recorded baseline-to-final npm audit moved from 4 critical / 11 high findings to zero critical / high; the final full-tree audit still reports 27 moderate and 2 low findings. The production-only audit reports zero findings.
- Add the repository homepage to package metadata for Linux package generation and replace a static Grafana credential example with a required environment variable.
- Harden Electron browser defaults, preload/IPC boundaries, navigation and packaged UI serving. Desktop Auth sessions now keep access/refresh and MFA challenge tokens in the Electron main process, use protected `safeStorage` persistence where available, require HTTPS Auth in packaged builds, and prevent renderer bearer values from reaching non-allowlisted destinations. This remains unqualified until a staging account and actual packaged login/session tests pass.

## Compatibility and availability

- Qualification generated Linux ARM64 unpacked, AppImage, DEB, and RPM outputs using the Node 20 CI runtime. These are local qualification artifacts, not public downloads.
- Linux x64, macOS, and Windows packages were not qualified in this environment.
- Electron 42 dependency tooling emits Node engine warnings (`>=22.12.0`); CI commands and ARM64 packages nevertheless passed on Node 20.20.2.

## Known limitations — release blockers

- Electron source hardening is implemented and focused auth/session/security tests pass. The final AppImage completed isolated process/runtime initialization, but the runner exposed no inspectable GUI and no real guest/keychain/login test passed. Desktop license entitlement remains required; an account-only login form is shown after that gate.
- Packaged login, Auth origin/CORS behavior, session recovery, refresh, and logout have not been verified against staging Auth with a non-production account. No staging endpoint or test account was available in this workstream.
- New desktop sessions no longer place Auth tokens in renderer `localStorage` or a JavaScript-readable cookie; legacy desktop token entries are cleared. The web/PWA flow intentionally remains unchanged. Production Auth is configured to the existing HTTPS `webstudio.omnibioai.org` origin; actual staging/production TLS and packaged login were not tested. Remote private service hosts configured with HTTP do not receive a bearer token and require HTTPS to support authenticated API calls.
- 27 moderate and 2 low development/build-tool advisories remain; explicit release-owner risk acceptance is outstanding.
- The previous full-directory secret scan reported 23 matches with documented redacted dispositions. Current changed/worktree high-confidence local patterns found no matches, but the official Docker Gitleaks run was denied because it would mount Git history into a third-party container. Do not treat the current scan as an official clean Gitleaks result.
- Final-HEAD ARM64 AppImage and DEB were rebuilt from `3230d41e24c7b8dc1a8813dc336300917e8cceb8`. AppImage: `/tmp/studio-v0.8.1-auth-3230-mYy6i7/OmniBioAI Studio-0.8.1-arm64.AppImage` (95,800,883 bytes; SHA-256 `188de8351ad4f2662669a246d0836eafd9d40e2e11849388f873ea4a0c33967e`). DEB: `/tmp/studio-v0.8.1-auth-3230-mYy6i7/omnibioai-studio_0.8.1_arm64.deb` (96,623,392 bytes; SHA-256 `e82d630772eb36e12967429498845b7dfb624e00f14a4a6d4dff5a80231fc893`); metadata verified. AppImage process initialization passed with isolated user data, but visual GUI/login did not. DEB was not installed. RPM is blocked because `rpmbuild` is unavailable. The builder warns that `desktopName` is unset. Artifacts are unsigned.
- Fresh exact-commit dependency audit: 0 critical, 0 high, 27 moderate and 2 low; production-only audit: 0 findings. Node 20 is unavailable; fresh builds/tests used Node 22.23.3.
- Final qualification report V5 remains NO-GO: no approved staging HTTPS Auth origin or non-production test account was available. OS-keychain behavior, visual GUI, and actual packaged login remain unverified. The packaged runtime `.env` fix was exercised successfully under isolated user data. Do not publish these notes or artifacts.

## Install, upgrade, and rollback guidance (draft)

Do not upgrade a user installation from this candidate. Before an authorized release, publish only the explicitly supported platform packages, document their exact requirements, back up user data, and test install/upgrade/login/uninstall on a clean target system. Rollback should use the prior verified v0.8.0-beta package and its documented data-compatibility procedure; no rollback drill was performed in this qualification.

No HIPAA certification, legal-compliance, or security-certification claim is made.
