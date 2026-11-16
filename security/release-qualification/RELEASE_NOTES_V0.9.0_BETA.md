# OmniBioAI Studio v0.9.0-beta

OmniBioAI Studio v0.9.0-beta is an evaluation release. It moves literature search to the PubMed RAG v6 indexes, fixes plugin correctness issues found by the plugin testkit, and continues the platform hardening work since v0.8.2-beta.

### 📦 Downloads

| Platform | Architecture | File | Notes |
|---|---|---|---|
| Linux | ARM64 | `OmniBioAI.Studio-0.9.0-arm64.AppImage` | DGX/Graviton, qualified |
| Linux | ARM64 | `omnibioai-studio_0.9.0_arm64.deb` | Ubuntu/Debian ARM64, qualified |

Check every download against `SHA256SUMS-v0.9.0-beta.txt`. x64 Linux, macOS and Windows installers are not part of this beta.

### 🚀 Quick Start

**Linux (DEB - Ubuntu/Debian):**
```bash
sudo dpkg -i omnibioai-studio_0.9.0_arm64.deb
omnibioai-studio
```

**Linux (AppImage):**
```bash
chmod +x OmniBioAI.Studio-0.9.0-arm64.AppImage
./OmniBioAI.Studio-0.9.0-arm64.AppImage --no-sandbox
```

### 📋 Requirements
- Docker (auto-prompted on first launch)
- 16GB RAM minimum (32GB recommended)
- 50GB free disk space
- License key (get one at omnibioai.org)

### 🔑 Get Beta Access
Sign up at: https://omnibioai.org/#request

## Highlights

### Literature search on PubMed RAG v6
- New per-study PubMed search, using Qwen3-Embedding-4B indexes, one per study. Results are keyed by PMID and include the title, year, journal, a snippet and the studies each hit came from (omnibioai-rag#48).
- The Lit AI page now uses the v6 catalog and search. It has a studies sidebar with filter and multi-select (up to 8 studies), result cards, and Index Stats showing the model, dimension, vector counts and docstore status (omnibioai-rag#51).
- The API Gateway literature routes (`/v1/literature/search`, `/studies`, `/domains`) now use RAG v6. Public response shapes are unchanged. Snippets are now real excerpts instead of full abstracts (omnibioai-api-gateway#37).
- The Bio Agent's literature mode calls RAG v6 over HTTP (omnibioai-workbench#926).
- Literature search requires a signed-in user with dataset read permission, and is rate-limited per user. Logs record the query length, not the query text.

### Plugin fixes
These fixes come from the plugin testkit runs. Each fixed plugin now has a regression test that runs on its own testkit data.
- Plugins now report a failure when their input is missing or a required container step fails. Before, some returned synthetic or placeholder results marked as successful (single-cell import and trajectory, variant annotation, metabolomics stats/normalize/imputation/outlier detection) (omnibioai-workbench#927, #931).
- Run manifests for CyTOF analysis, HRD score and ctDNA liquid biopsy now pass schema validation, so correct runs are no longer marked failed (#927).
- Statistical corrections:
  - Metabolomics outlier detection uses a robust PCA-based test that works when metabolites outnumber samples.
  - Imputation uses each metabolite's own minimum.
  - Benjamini–Hochberg adjustment is applied correctly in ATAC differential, motif enrichment, ATAC report and DMR analysis.
  - Proteomics QC CV excludes missing values.
  - ATAC peaks no longer cross chromosome boundaries.
  - DMR delta-beta follows the declared group order (#931).
- Matching corrections:
  - Clinical trial matching uses whole-word terms.
  - Oncoprint classifies variant consequence terms exactly.
  - HRD LST counting requires a change in copy-number state (#927).

### Security hardening
- Several plugin and integration APIs are temporarily restricted at the router until per-user authentication is added. The format converter and workflow builder are read-only; the Benchling integration API is closed; the ServiceNow integration API is read-only; the genome viewer track API is unavailable (omnibioai-studio#282, #290, #292).
- The Bio Agent no longer writes query text to logs (omnibioai-workbench#923, fixed in #926).
- Deployment tooling keeps secret values out of terminal output and logs (omnibioai-ecosystem#111).
- Search indexes and shared reference data are now mounted read-only into the services that read them.
- Platform signing keys were rotated on 2026-11-16 and the rotation was verified: tokens signed with the previous key are rejected on every endpoint, and a fresh sign-in and Bio Agent search work with the new key. All sessions from before the rotation ended, so every user signs in again once.

## Behaviour changes
- **A study is required for literature search.** `POST /v1/literature/search` returns `400 invalid_request` (field `domain`) when no study is given. There is no "all studies" search in v6. Unknown study names return `400` and are not billed. Legacy names such as "DNA damage response" still resolve.
- **Retired legacy literature features:**
  - The legacy embedding and knowledge-graph build paths are disabled.
  - On the Lit AI page, ingest (Ingest study, Fetch abstracts, New study), Embed, Benchmark and RAG+LLM answers are disabled, along with the features that depend on the retired legacy indexes.
- `/v1/literature/answers` is unchanged, but RAG v6 does not generate answers yet.
- When the per-user literature search limit is hit, the API returns `429 rate_limited` with `Retry-After`.

## Qualification summary

To be recorded from the exact release commit before tagging:

- Electron authentication/security tests.
- Full UI suite.
- Desktop renderer and web/PWA builds.
- Dependency audit (full and production-only).
- Installer integrity: every published file matches `SHA256SUMS-v0.9.0-beta.txt`.
- AppImage isolated process/runtime initialization.

## Known issues
Read the attached `KNOWN_ISSUES_V0.9.0_BETA.md` before installing. This prerelease is intended for evaluation and does not claim production, regulatory, or HIPAA qualification.

**Full Changelog**: https://github.com/OmniBioAI/omnibioai-studio/compare/v0.8.2-beta...v0.9.0-beta
