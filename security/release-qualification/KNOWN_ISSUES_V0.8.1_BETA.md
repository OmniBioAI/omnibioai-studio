# OmniBioAI Studio v0.8.1-beta — Known Issues and Limitations

## Release status

This is a beta release intended for early evaluation and feedback. Some platform and authentication scenarios have not yet received complete end-to-end qualification.

## Authentication and sessions

- Desktop authentication uses an Electron main-process-owned session architecture.
- Automated authentication and Electron security tests pass.
- Packaged HTTPS staging login has not been independently verified because an approved staging endpoint and test-account injection method were unavailable.
- Real operating-system keychain behavior and packaged session restoration have not been fully qualified.
- Session expiry, server-side revocation and logout have automated test coverage but remain unverified against a live staging Auth service.

Users should report authentication or session-restoration problems with relevant non-sensitive diagnostic information. Never include passwords, tokens, cookies or credentials in bug reports.

## Packaging and platform support

- ARM64 AppImage and DEB packages were built and their checksums verified.
- RPM packaging is not included in the qualified artifact set.
- Installation, upgrade, uninstall and rollback procedures have not all been independently verified.
- Non-ARM64 platform qualification remains incomplete.
- Automatic-update metadata has not been qualified; use only explicitly published, checksum-verified artifacts.
- Code signing and notarization depend on the distribution platforms and release scope.

## Build and dependency notes

- UI and Electron security tests passed in the recorded qualification environment.
- Builds used Node.js 22.23.3; Node.js 20 qualification remains incomplete.
- Production dependency audit reported no advisories. Development dependency audit reported 27 moderate and 2 low findings.
- Full official Docker-backed Gitleaks history scanning remains incomplete.

## Beta expectations

This release is provided for evaluation. Users should retain backups of important data and report reproducible defects.

The beta status does not imply regulatory certification, HIPAA certification or production suitability for regulated workloads.
