# OmniBioAI Studio v0.9.1-beta — Known Issues and Limitations

## Release status

This is a beta release intended for early evaluation and feedback. It does not meet the v0.9.0 roadmap exit criteria (Trusted Tool Catalog, multi-tenancy, technical-readiness closure); that work remains open.

## BioRepository is not ready for protected health information

Do not put PHI, or any regulated personal data, in the BioRepository in this release. The following controls are not in place yet, and are tracked in omnibioai-workbench#947:

- **No encryption at rest** for repository file storage.
- **No TLS between the services and the database**, so repository metadata crosses the internal network unencrypted.
- **No read auditing.** Writes and administrative actions are recorded, but who read or downloaded which dataset version is not yet part of the audit record.
- **No identifier validation**, so nothing yet prevents a direct identifier being entered in a free-text field.

Use it for reference data, derived results and non-identifiable datasets while these are open.

Other BioRepository limitations in this release:

- Signed download links are time-limited and authorised per request. Treat a live link as a credential for as long as it is valid; do not paste it into shared channels or tickets.
- Restore drills verify that a backup restores and, with an exact log position, that a point-in-time restore lands where expected. A full disaster-recovery exercise against the production database has not been performed.
- Dataset type validation covers genomics, transcriptomics and a generic type. Other file kinds are accepted as generic without content checks.
- Lineage records what was registered against a run. A dataset version created outside that path has no lineage, and nothing forces registration.
- The GA4GH DRS API implements the v1 read paths needed to resolve and fetch an object. It has not been tested against third-party DRS clients beyond our own.

## Plugins

- Plugin results are verified only for plugins covered by the plugin testkit with a passing run from their own image; the others are evaluation-only.
- **The ADMET and toxicity plugins report no toxicity endpoints at all.** The previous hERG, Ames, liver-injury, skin-sensitisation and carcinogenicity values and the overall safety flag were removed in this release because they were not supportable. What remains is the outcome of each named physicochemical rule and the structural alerts that matched. These are screening heuristics for triage by someone qualified to read them — not a safety assessment, and an empty result is not evidence that a compound is safe. Real endpoints need trained models or assay data (omnibioai-workbench#953).
- **Output shape changed** for those two plugins: the `endpoints` block, `safety_flag` and ADMET `overall_flag` no longer exist. Code reading those fields needs updating.
- The polygenic-score, GWAS, phenotype-association and eQTL plugins now fail when a required input is missing, where they previously returned a result. This is intended, but it will surface as new failures in pipelines that relied on the old behaviour.
- GWAS fits one variant at a time with no covariates and no principal components, so population structure is not corrected. It is suitable for quality control and teaching, not as a substitute for a dedicated GWAS tool on a structured or admixed cohort.
- Phenotype association without gene annotations completes with the phenotype columns unscored rather than failing.
- One ADMET workflow bundle is disabled because its predictions were not reproducible (omnibioai-workflow-bundles#77).
- Several plugins still have no runnable published image and cannot reach a verified state until one is built: ATAC peak calling, binding-site prediction, selection scan, admixture analysis, docking analysis, molecular docking. Protein-evolution and Fst have no image at all.
- A path-resolution helper in the plugin layer, given an absolute path that does not exist, searches recent run directories for a file with the same name. A mistyped path can therefore resolve to a different run's file. Tracked as a follow-up; avoid relying on non-existent paths being reported as errors.

## Authentication and sessions

- The platform signing-key rotation announced in v0.9.0-beta (2026-11-16) remains in effect. **No new rotation ships in v0.9.1-beta**, and installing it does not end existing sessions.
- LIMS signing-key rotation, the move to RS256 for platform authentication, and rotation of the remaining internal service credentials are scheduled and not yet done.
- The v0.8.1 desktop authentication architecture is unchanged in this release; its limitations still apply.
- Packaged HTTPS staging login has not been independently verified.
- Real operating-system keychain behavior and packaged session restoration have not been fully qualified.

Users should report authentication or session-restoration problems with relevant non-sensitive diagnostic information. Never include passwords, tokens, cookies or credentials in bug reports.

## Literature search (RAG v6)

Unchanged from v0.9.0-beta:

- A study is required for every search: `POST /v1/literature/search` without a study returns `400 invalid_request`. There is no "all studies" search in v6.
- RAG v6 does not generate answers yet. `/v1/literature/answers` is unchanged, and RAG+LLM answers on the Lit AI page are disabled.
- Ingest (Ingest study, Fetch abstracts, New study), Embed and Benchmark on the Lit AI page are disabled with the retired legacy indexes.
- Searching requires a signed-in user with dataset read permission and is rate-limited per user (`429 rate_limited` with `Retry-After`).

## Temporarily restricted APIs

These remain restricted at the router until each one has per-user authentication:

- The format converter and workflow builder APIs are read-only (#282).
- The multi-agent orchestrator plugin routes are read-only (#280).
- The Benchling integration API is closed; the ServiceNow integration API is read-only (#290).
- The genome viewer track API is unavailable (#292).
- Audit service routes are restricted (#277).

## Self-hosted stack

- The security-audit worker requires `AUDIT_RECORD_INTEGRITY_KEY` and `AUDIT_RECORD_INTEGRITY_KEY_ID`; compose refuses to start it without them (#261).
- MySQL backups are written encrypted to an age recipient (`MYSQL_BACKUP_AGE_RECIPIENT_FILE`); there is no plaintext mode, and a backup fails closed when the recipient file is missing or invalid (#273).
- Router access logs are rotated with a size and retention limit (#301). Operators who ship logs elsewhere should confirm their collector handles rotation.
- JupyterLab, RStudio and VS Code rely on the router for authentication. RStudio has no login of its own and no published port; do not expose the `ide-rstudio` network or re-publish port 8787.
- VS Code access uses a router-injected session cookie derived from `VSCODE_PASSWORD`. Treat `VSCODE_SESSION_COOKIE` as a password-equivalent secret.

## Packaging and platform support

- All nine installers (Linux x64 and ARM64 AppImage, DEB and RPM; macOS Intel and Apple Silicon DMG; Windows x64 installer) are built by GitHub Actions from the `v0.9.1-beta` tag. Installation and launch have not been independently qualified on every platform.
- `SHA256SUMS-v0.9.1-beta.txt` lists all nine published installers so you can check your download.
- The macOS and Windows installers are unsigned and not notarized.
- Installation, upgrade, uninstall and rollback procedures have not all been independently verified.
- Automatic-update metadata has not been qualified; use only explicitly published, checksum-verified artifacts.

## Build and dependency notes

- Release CI builds use Node.js 20; local qualification uses Node.js 22.23.3.
- Full official Docker-backed Gitleaks history scanning remains incomplete.

## Beta expectations

This release is provided for evaluation. Users should retain backups of important data and report reproducible defects.

The beta status does not imply regulatory certification, HIPAA certification or production suitability for regulated workloads.
