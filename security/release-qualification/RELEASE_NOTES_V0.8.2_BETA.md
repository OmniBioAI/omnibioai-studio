# OmniBioAI Studio v0.8.2-beta

OmniBioAI Studio v0.8.2-beta is an evaluation release focused on edge and admin-route hardening, router-gated IDE access, and service stability fixes since v0.8.1-beta.

## Highlights

- Enforces P0 admin route gates, gates P1 operator proxies and guards P2 operator pages.
- Denies the public agent-run API and Workbench self-signup/email pages at the router, closes the OPA API (`/_svc/opa` returns 404) and serves `workbench.omnibioai.org` with the same deny rules.
- Hardens the shared docker-socket-proxy: `VolumesFrom`, `container:` and named networks, create-time network attachment, sysctls, host cgroupns and Docker/containerd socket or daemon-state binds are denied.
- Gates JupyterLab, RStudio and VS Code on a Studio session with IDE permission; the router authenticates each IDE server-side, so users no longer see a second login, and RStudio is reachable only through the router. IDE home directories now persist across container recreation.
- Redesigns Studio navigation and home, adds a runtime tool-outage notice, renames the Agent mode to "Run analyses", and raises the ADMIN toggle, Settings entry and footer links to 44px touch targets.
- Runs Workbench with gunicorn and adds Workbench and celery-worker healthchecks (requires a Workbench image that includes Workbench #790).
- Gives celery-worker the bio-agent service credential, fixing `auth_unavailable` failures in BioQueryAI analyses; TES requests are refreshed and retried on 401.

## Downloads

This beta publishes the installers built by the tag's CI run. Verify each download against the attached checksum file before use. The qualified artifact set and its checksums are recorded in `SHA256SUMS-v0.8.2-beta.txt`. Automatic-update metadata is not part of the qualified beta artifact set.

## Qualification summary

To be recorded from the exact release commit before tagging:

- Electron authentication/security tests.
- Full UI suite.
- Desktop renderer and web/PWA builds.
- Dependency audit (full and production-only).
- Installer integrity: every published file matches `SHA256SUMS-v0.8.2-beta.txt`.
- AppImage isolated process/runtime initialization.

Read the attached `KNOWN_ISSUES_V0.8.2_BETA.md` before installing. This prerelease is intended for evaluation and does not claim production, regulatory, or HIPAA qualification.
