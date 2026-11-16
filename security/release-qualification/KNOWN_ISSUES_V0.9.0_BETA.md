# OmniBioAI Studio v0.9.0-beta — Known Issues and Limitations

## Release status

This is a beta release intended for early evaluation and feedback. It does not meet the v0.9.0 roadmap exit criteria (Trusted Tool Catalog, multi-tenancy, technical-readiness closure); that work remains open.

## Authentication and sessions

- Platform signing keys were rotated on 2026-11-16. Every session from before the rotation has ended: users, desktop installs and integrations that hold tokens must sign in again once.
- The v0.8.1 desktop authentication architecture is unchanged in this release; its limitations still apply.
- Packaged HTTPS staging login has not been independently verified.
- Real operating-system keychain behavior and packaged session restoration have not been fully qualified.

Users should report authentication or session-restoration problems with relevant non-sensitive diagnostic information. Never include passwords, tokens, cookies or credentials in bug reports.

## Literature search (RAG v6)

- A study is required for every search: `POST /v1/literature/search` without a study returns `400 invalid_request`. There is no "all studies" search in v6.
- RAG v6 does not generate answers yet. `/v1/literature/answers` is unchanged, and RAG+LLM answers on the Lit AI page are disabled.
- Ingest (Ingest study, Fetch abstracts, New study), Embed and Benchmark on the Lit AI page are disabled with the retired legacy indexes.
- Searching requires a signed-in user with dataset read permission and is rate-limited per user (`429 rate_limited` with `Retry-After`).

## Temporarily restricted APIs

These are restricted at the router until each one has per-user authentication:

- The format converter and workflow builder APIs are read-only (#282).
- The multi-agent orchestrator plugin routes are read-only: Studio's orchestrator view can't start, dry-run, cancel or replay runs and shows a 403. The Bio Agent's Execute DAG is not affected (#280).
- The Benchling integration API is closed; the ServiceNow integration API is read-only (#290).
- The genome viewer track API is unavailable (#292).
- Audit service routes are restricted (#277).

## Plugins

- Plugin results are verified only for plugins covered by the plugin testkit with a passing run from their own image; the others are evaluation-only.
- ATAC peak calling's published image is not runnable and needs a rebuild from the plugin's Dockerfile.
- DMR analysis tests individual CpG sites; it does not merge them into regions.
- ATAC differential accessibility normalises by library size only (CPM), which can report false positives when a few peaks change a lot.
- Variant annotation fails when its SnpEff database is not available, instead of returning placeholder annotations.

## Self-hosted stack

- The security-audit worker requires `AUDIT_RECORD_INTEGRITY_KEY` and `AUDIT_RECORD_INTEGRITY_KEY_ID`; compose refuses to start it without them (#261).
- MySQL backups are written encrypted to an age recipient (`MYSQL_BACKUP_AGE_RECIPIENT_FILE`); there is no plaintext mode, and a backup fails closed when the recipient file is missing or invalid (#273).
- JupyterLab, RStudio and VS Code rely on the router for authentication. RStudio has no login of its own and no published port; do not expose the `ide-rstudio` network or re-publish port 8787.
- VS Code access uses a router-injected session cookie derived from `VSCODE_PASSWORD`. Treat `VSCODE_SESSION_COOKIE` as a password-equivalent secret.

## Packaging and platform support

- Only the ARM64 AppImage (`OmniBioAI.Studio-0.9.0-arm64.AppImage`) and ARM64 DEB (`omnibioai-studio_0.9.0_arm64.deb`) are qualified.
- `SHA256SUMS-v0.9.0-beta.txt` lists the published installers so you can check your download. A file being listed there does not mean it is qualified.
- RPM, x64 Linux, macOS and Windows installers are not part of this beta.
- Installation, upgrade, uninstall and rollback procedures have not all been independently verified.
- Automatic-update metadata has not been qualified; use only explicitly published, checksum-verified artifacts.

## Build and dependency notes

- Release CI builds use Node.js 20; local qualification uses Node.js 22.23.3.
- Full official Docker-backed Gitleaks history scanning remains incomplete.

## Beta expectations

This release is provided for evaluation. Users should retain backups of important data and report reproducible defects.

The beta status does not imply regulatory certification, HIPAA certification or production suitability for regulated workloads.
