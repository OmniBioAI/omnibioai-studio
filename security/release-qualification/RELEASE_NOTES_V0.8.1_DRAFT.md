# OmniBioAI Studio v0.8.1 — release-notes draft

**Qualification status: NO-GO. Do not publish these notes or artifacts yet.**

## Candidate changes

- Keep the Studio release version consistent at v0.8.1 in the UI and application metadata.
- Correct the omics renderer test to import its registry from the owning module.
- Refresh vulnerable dependencies. The recorded baseline-to-final npm audit moved from 4 critical / 11 high findings to zero critical / high; the final full-tree audit still reports 27 moderate and 2 low findings. The production-only audit reports zero findings.
- Add the repository homepage to package metadata for Linux package generation and replace a static Grafana credential example with a required environment variable.

## Compatibility and availability

- Qualification generated Linux ARM64 unpacked, AppImage, DEB, and RPM outputs using the Node 20 CI runtime. These are local qualification artifacts, not public downloads.
- Linux x64, macOS, and Windows packages were not qualified in this environment.
- Electron 42 dependency tooling emits Node engine warnings (`>=22.12.0`); CI commands and ARM64 packages nevertheless passed on Node 20.20.2.

## Known limitations — release blockers

- Electron browser security settings still disable web security and permit insecure content/webviews. This must be fixed and tested before publication.
- Packaged login, Auth origin/CORS behavior, session recovery, refresh, and logout have not been verified against staging Auth with a non-production account.
- 27 moderate and 2 low development/build-tool advisories remain; explicit release-owner risk acceptance is outstanding.
- The full directory secret scan reports 23 matches. All have redacted documented dispositions, but the scanner result is not clean.
- The Linux package builder warns that `desktopName` is unset. Artifact signatures/notarization were not produced.

## Install, upgrade, and rollback guidance (draft)

Do not upgrade a user installation from this candidate. Before an authorized release, publish only the explicitly supported platform packages, document their exact requirements, back up user data, and test install/upgrade/login/uninstall on a clean target system. Rollback should use the prior verified v0.8.0-beta package and its documented data-compatibility procedure; no rollback drill was performed in this qualification.

No HIPAA certification, legal-compliance, or security-certification claim is made.
