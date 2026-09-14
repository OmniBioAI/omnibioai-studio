# Changelog

All notable changes to OmniBioAI Studio are documented here.
Format: [Keep a Changelog](https://keepachangelog.com)

---
## [Unreleased]

- 🌐 Public web domain moved from app.omnibioai.org to webstudio.omnibioai.org (old domain kept working during the transition period)

---
## v0.7.1 erratum (2026-09-14)

A post-release audit verified every v0.7.1 claim below against real evidence
(merged PRs, live container state, running code, passing tests). One claim
did not hold up as originally written:

- **"Hardened Neo4j: credential rotation, ..."** — the network-restriction
  and tile-gating parts (below) were genuinely done for the v0.7.1 release.
  The **credential-rotation part was not actually true when originally
  published**: `NEO4J_PASSWORD` had been added to `.env.example` and the
  container's env, but nothing had ever executed the rotation against the
  already-initialized data volume (`NEO4J_AUTH` only takes effect on a
  fresh volume), and the live instance's real credential no longer matched
  *any* documented value — old default or "new" placeholder. **This has
  now been genuinely rotated** (2026-09-14): the stale system/auth database
  was reset, a newly generated strong password was set, verified live (old
  credentials confirmed rejected, new one confirmed accepted, real graph
  data — 138,621 nodes — confirmed intact throughout), and propagated to
  every consumer (`rag`, `control-center`). Access-gated remote entry via
  Cloudflare Access could not be verified either way from this repo — it's
  infra-level, tracked for follow-up.

Everything else in v0.7.1 (SSRF fix, info-disclosure fix, the nginx fixes,
the 6 admin views, the documentation rewrite) was independently verified
against real merged commits, running code, and passing tests, and stands
as originally written.

---
## v0.7.1 (2026-09-12)

### Security
- Closed an SSRF exposure in toolserver by routing outbound calls through the authenticated gateway
- Closed an information-disclosure surface in Control Center
- Hardened Neo4j: network access restriction, tile gating on `platform.manage_infra` — credential rotation was documented but not actually executed at release time; see the 2026-09-14 erratum above

### Added
- Compliance Center, Audit Explorer, Audit Logs, API Keys & Service Accounts, Security Posture, and Billing (Usage/Overview) admin views — each backed by real API clients and real backend routes/services (verified 2026-09-14: real proxying to omnibioai-security-audit, a real SQLAlchemy-backed compliance service, 69 passing backend tests)

### Fixed
- Fixed recurring nginx proxy bugs affecting RAG, Jupyter, RStudio, and VS Code
- Found and fixed real correctness bugs in the plugin execution layer

### Documentation
- Rewrote documentation for 28+ plugins and core services to reflect verified, not assumed, behavior

---
## v0.7.0 (2026-08-07)

### New Features
- 🔐 Unified license key system (OMNI-XXXX-XXXX-XXXX-XXXX)
  → One key works for web + desktop
  → Auto-creates user on first validation
  → Same JWT as OAuth login
- 🌐 webstudio.omnibioai.org fully working
  → License key login enforced
  → All workbench pages loading correctly
  → Service worker fixed
  → nginx routes fixed (/license/, /roles/)
  → Control Center JWT cookie fallback
- 👥 Team expansion
  → Dr. Rajnish Kumar (Scientific Consultant, SR University)
  → Praveen C.V. Raghavulu (Scientific Advisor, KUMC)
  → About page restructured as company team page
- 🛠 12,110 bioinformatics tools (up from 11,577)
  → 100+ new HTTP API tools added
  → All tools validated (100% clean)
  → 0 duplicates, 0 ToolSpec errors
- 🤖 Tool selection AI improved
  → GPU enabled for Ollama (57x faster: 120s → 2.1s)
  → Accuracy: 0% → 60%
  → Recall@K: 60% → 85%
- 📦 1,000 ARM64 SIF images
- 🔧 Control Center web service added
- 💰 Billing service integrated
- 🔧 Admin Console at admin.omnibioai.org

---
## v0.6.0-beta (2026-07-18)

### New Features
- 🌐 Web version at app.omnibioai.org
- 🔐 SSO/OAuth2 (Google, GitHub, Microsoft)
- 🛡 Cloudflare Access email whitelist
- 🤗 HuggingFace Push button in Model Registry
- 📦 800 ARM64 SIF images
- 🛠 12,000+ bioinformatics tools
- 90 Kubernetes tool definitions
- 1,200 HTTP API tools
- YAML validation fixes

## [0.5.0-beta] - 2026-07-19
### Added
- 225+ bioinformatics/ML plugins updated and tested — full coverage across scRNA-seq, WGS, WES, proteomics, spatial
- 36M PubMed abstracts indexed for RAG pipeline — 150-domain coverage with PubMedBERT FAISS, BM25 + vector retrieval, RRF reranking, Neo4j knowledge graph
- Enhanced literature AI with full corpus coverage
- 1,025 container images migrated to `ghcr.io/omnibioai` — 225 Docker + 800 ARM64 SIF
- 600+ workflow bundles across Nextflow, WDL, CWL, Snakemake
- Live platform metrics dashboard publicly available at control.omnibioai.org — architecture, codebase stats, and service health
- `omnibioai-dev-hub` RAG index now rebuilds automatically on each Studio release via `check_and_reindex.sh` (hourly cron on spark-70f0)
- Sudoers rule for passwordless dev-hub service restarts post-reindex

### Fixed
- `build_index.py` no longer silently exits 0 on zero-vector runs — now exits non-zero so failed reindex attempts are never mistaken for success
- Dev Hub reindex now runs via `docker exec` inside the container (correct `REPO_BASE=/repos` and `ollama` DNS resolution), rather than on the bare host where neither resolved correctly
- Auth Service port corrected in documentation (was incorrectly listed as :8081, actually :8001)

### Changed
- Beta launch date moved to July 15, 2026, full release July 19, 2026
- README overhauled with corrected port mappings, reconciled tool/service counts, and a live-proof stats link
- Roadmap table updated — v0.5.0-beta marked Current

---

## [0.4.0-beta] - 2026-07-03
### Added
- Screenshots added to README (Mode, Workbench, LLM, Cloud, HPC, Launch, Services, IDE Services, Logs, Jobs, Settings, Bug Report)
- `packages/` directory — design-tokens and ui bundled as regular files for CI reproducibility
- `package-lock.json` now tracked in git for deterministic CI installs
- `exports` field added to `@man4ish/design-tokens` package.json for vite/rolldown subpath resolution
- Dummy `.env` creation step in CI lint job to fix docker compose validation
- `npx cross-env` used in CI build:ui step for cross-platform compatibility
### Fixed
- Version strings unified across all UI components (was v0.1.0/v0.2.0, now v0.4.0 everywhere)
  - `src/ui/App.jsx` — top-right badge
  - `src/ui/components/Sidebar.jsx` — sidebar logo
  - `src/ui/pages/Settings.jsx` — About panel Studio Version
  - `src/ui/pages/Logs.jsx` — startup log message
- CI lint job failing due to missing `.env` (MACHINE_DIR, DB_INIT_DIR, DATA_DIR, WORK_DIR blank)
- CI build-ui failing with `cross-env: command not found`
- CI build-ui failing with rolldown native binding error (ARM64 lock file used on x64 runner)
- `@man4ish/design-tokens/tokens.css` unresolvable in CI (packages were git submodules, not regular files)
- X11 forwarding for Electron app over SSH — XQuartz + ForwardX11Trusted + XAuthLocation in ~/.ssh/config
- Electron GPU errors over X11 (`--disable-gpu --disable-software-rasterizer --in-process-gpu` flags added to dev script)
### Changed
- `npm run dev` now includes `--disable-gpu --disable-software-rasterizer --in-process-gpu` for X11 remote dev
- `packages/omnibioai-design-tokens` and `packages/omnibioai-ui` moved into repo (were external `file:../` references)
- README.md fully regenerated from actual app screenshots and live service data
- `docs/screenshots/` directory added with 15 annotated screenshots

---
## [0.3.0-beta] - 2026-06-10

### Added
- Auto-updater (electron-updater) — in-app update banner and one-click restart to install
- CI/CD across all 28 ecosystem repos
- docker-compose-release.yml and .env.example attached to every release
- SHA256SUMS.txt for all release artifacts
- WDL validation in workflow-bundles CI
- Linux ARM64 builds (AppImage, DEB, RPM) for DGX/Graviton
- Windows NSIS installer now live (was waitlist)
- Screenshots in README (Control Center, Health, Coverage, Tool Images)
- License card and ATAC-seq card on landing page
- sync-version GitHub Actions workflow on landing page

### Fixed
- Stray `cd` instruction in launcher Dockerfile
- docker-compose-release.yml using MACHINE_DIR (now portable)
- macOS DMG build failing due to npm socket hang up (added caching)
- Compose validation in CI failing due to missing env vars
- .env committed to git history (purged + secrets rotated)

### Changed
- All download links on omnibioai.org updated to v0.3.0-beta exact filenames
- Release workflow now uses --publish onTag for auto-updater manifests
- jupyter/rstudio/vscode added to release compose (were missing)
- license-server added to release compose

---

## [0.2.0-beta] - 2026-05-28

### Added
- License key system (OMNI-XXXX-XXXX-XXXX-XXXX, 30-day trial)
- Sentry error tracking + in-app bug report button
- Cython IP protection (.so compiled binaries)
- MySQL-backed license server
- Zero-trust security control plane (JWT + RBAC/ABAC)
- API Gateway — single enforced entry point
- HPC Policy Engine — GPU/CPU quota governance
- Security Audit Service — async audit via Redis Streams
- Redis token caching (TTL=300s) with pub/sub invalidation
- RAG V6 FAISS index — persistent vector store
- 500+ bioinformatics tools (350 HTTP API + 144 Slurm)
- Windows NSIS .exe installer

---

## [0.1.0-beta.1] - 2026-05-01

### Added
- Full local stack launch with containerized services
- Live service health monitoring (Control Center)
- Docker image dashboard
- Dev Hub with knowledge graph + RAG UI
- SDK Launcher for OmniBioAI Python SDK
- Mode-aware startup: Local / HPC / Cloud / Hybrid
- LLM configuration: Ollama + Claude API + OpenAI
- Cloud execution: AWS/Azure/GCP Batch + Kubernetes
- HPC execution: Slurm / PBS / LSF via TES
