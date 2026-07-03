# Changelog

All notable changes to OmniBioAI Studio are documented here.
Format: [Keep a Changelog](https://keepachangelog.com)

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
