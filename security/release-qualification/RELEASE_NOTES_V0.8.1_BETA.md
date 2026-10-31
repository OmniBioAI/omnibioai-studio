# OmniBioAI Studio v0.8.1-beta

OmniBioAI Studio v0.8.1-beta is an ARM64 Linux evaluation release focused on desktop authentication and Electron security hardening.

## Highlights

- Moves packaged desktop access, refresh, and MFA challenge tokens into the Electron main process.
- Persists refresh sessions only through Electron protected storage, rejecting Linux `basic_text` and failing closed without a plaintext fallback.
- Requires HTTPS for packaged authentication and rejects redirects, credential-bearing origins, and TLS downgrade.
- Strips renderer-supplied bearer headers and injects the main-owned token only for explicitly trusted destinations.
- Adds sender-validated, narrow authentication IPC and keeps raw tokens out of the renderer.
- Fixes packaged runtime secret paths so generated runtime files live under Electron user data rather than inside `app.asar`.
- Updates the v0.8.1 dependency baseline to zero critical/high findings and zero production dependency advisories in the recorded audit.

## Downloads

This beta publishes Linux ARM64 AppImage and DEB packages. Verify each download against the attached checksum file before use. Automatic-update metadata is not part of the qualified beta artifact set.

## Qualification summary

- Electron authentication/security: 30/30 passed.
- Full UI suite: 2,437 passed; 2 documented skips.
- Desktop renderer and web/PWA builds: passed on Node.js 22.23.3.
- Dependency audit: 0 critical, 0 high, 27 moderate, 2 low; production-only audit: 0 advisories.
- AppImage and DEB integrity and DEB metadata: verified.
- AppImage isolated process/runtime initialization: passed; visual GUI and packaged live login remain unverified.

Read the attached `KNOWN_ISSUES_V0.8.1_BETA.md` before installing. This prerelease is intended for evaluation and does not claim production, regulatory, or HIPAA qualification.
