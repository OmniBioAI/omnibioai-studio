# Changelog

All notable changes to OmniBioAI Studio are documented here.
Format: [Keep a Changelog](https://keepachangelog.com)

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
