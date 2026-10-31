# OmniBioAI Studio v0.8.1 — release-notes draft

**Qualification status: NO-GO. Do not publish these notes or artifacts yet.**

## Candidate changes

- Keep the Studio release version consistent at v0.8.1 in the UI and application metadata.
- Correct the omics renderer test to import its registry from the owning module.
- Refresh vulnerable dependencies. The recorded baseline-to-final npm audit moved from 4 critical / 11 high findings to zero critical / high; the final full-tree audit still reports 27 moderate and 2 low findings. The production-only audit reports zero findings.
- Add the repository homepage to package metadata for Linux package generation and replace a static Grafana credential example with a required environment variable.
- Harden Electron browser defaults, preload/IPC boundaries, navigation and packaged UI serving; remove renderer access to raw local service secrets and renderer-supplied Auth-cookie IPC. These changes are not release-qualified until staging Auth and packaged login/session tests pass.

## Compatibility and availability

- Qualification generated Linux ARM64 unpacked, AppImage, DEB, and RPM outputs using the Node 20 CI runtime. These are local qualification artifacts, not public downloads.
- Linux x64, macOS, and Windows packages were not qualified in this environment.
- Electron 42 dependency tooling emits Node engine warnings (`>=22.12.0`); CI commands and ARM64 packages nevertheless passed on Node 20.20.2.

## Known limitations — release blockers

- Electron source hardening is implemented and has focused helper/static-server regression tests, but a real Electron runtime/guest test has not been run.
- Packaged login, Auth origin/CORS behavior, session recovery, refresh, and logout have not been verified against staging Auth with a non-production account. No staging endpoint or test account was available in this workstream.
- Auth access/refresh tokens remain in renderer `localStorage` and a JavaScript-readable cookie; Auth requests still use HTTP. A secure Auth-side session contract or reviewed main-process broker is required before this risk can be closed.
- 27 moderate and 2 low development/build-tool advisories remain; explicit release-owner risk acceptance is outstanding.
- The previous full-directory secret scan reported 23 matches with documented redacted dispositions. The official Git-history scan was blocked by Docker socket permissions in the final pass; no fresh directory scan ran because standalone Gitleaks is unavailable. Do not treat the current scan as clean.
- Current ARM64 AppImage and DEB were built locally; RPM is blocked because `rpmbuild` is unavailable. The builder warns that `desktopName` is unset. Artifacts are unsigned and packaged login was not tested.
- Last completed full dependency audit at the implementation source commit: 0 critical, 0 high, 27 moderate and 2 low; production-only audit: 0 findings. A fresh audit in the final qualification pass was blocked by npm registry DNS and must not be treated as current verification. Node 20 is unavailable in this final environment; fresh builds/tests used Node 22.23.3.
- Final qualification report V4 remains NO-GO: no approved staging HTTPS Auth origin or non-production test account was available, so secure session migration and actual packaged login were not verified. Do not publish these notes or artifacts.

## Install, upgrade, and rollback guidance (draft)

Do not upgrade a user installation from this candidate. Before an authorized release, publish only the explicitly supported platform packages, document their exact requirements, back up user data, and test install/upgrade/login/uninstall on a clean target system. Rollback should use the prior verified v0.8.0-beta package and its documented data-compatibility procedure; no rollback drill was performed in this qualification.

No HIPAA certification, legal-compliance, or security-certification claim is made.
