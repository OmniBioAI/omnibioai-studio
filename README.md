# OmniBioAI Studio

> Desktop orchestration platform for AI-powered bioinformatics computation

**OmniBioAI Studio** is an Electron desktop app that launches and manages the full OmniBioAI stack — locally, on HPC clusters, or in the cloud — with a single click.

---

## ✨ What's New in v0.1.0-beta.1

- Full local stack launch with 14 containerized services
- Live service health monitoring (Control Center)
- Docker image dashboard (platform + plugin images)
- Dev Hub with knowledge graph + RAG UI
- SDK Launcher for OmniBioAI Python SDK
- Mode-aware startup: Local / HPC / Cloud / Hybrid
- LLM configuration: Ollama (local) + Claude API (cloud)
- AWS / Azure / GCP / HPC configuration UI

---

## 🖥 Services

| Service | Port | Description |
|---|---|---|
| Workbench | :8000 | Main bioinformatics platform (Django) |
| TES | :8081 | Task Execution Service (Slurm/AWS/Azure/K8s) |
| ToolServer | :9090 | FastAPI bioinformatics tool server |
| Model Registry | :8095 | ML model versioning and serving |
| LIMS | :7000 | Lab Information Management System |
| Control Center | :7070 | Service health + Docker image dashboard |
| RAG | :8090 | PubMed literature AI + DeepSeek RAG |
| Dev Hub | :5173 | Knowledge graph + embeddings UI |
| SDK Launcher | :5190 | OmniBioAI Python SDK UI |
| Ollama | :11434 | Local LLM inference |
| OPA | :8181 | Open Policy Agent (access control) |

### Plugin images (pulled on-demand by TES)

| Image | Description |
|---|---|
| `omnibioai-plugin-scanpy` | Single-cell RNA-Seq analysis |
| `omnibioai-plugin-fastq-qc` | FASTQ quality control (FastQC + MultiQC) |
| `omnibioai-plugin-fastq-trimmer` | Read trimming (Trimmomatic) |
| `omnibioai-plugin-rnaseq-analysis` | Bulk RNA-Seq (DESeq2/edgeR) |
| `omnibioai-plugin-workflow-runner` | WDL/Nextflow/Snakemake execution |
| `omnibioai-plugin-variant-annotation` | Variant annotation (SnpEff/ANNOVAR) |
| `omnibioai-plugin-marker-identification` | Marker gene identification |
| `omnibioai-plugin-phenotype-association` | GWAS + phenotype association |

---

## 📋 Requirements

| Requirement | Minimum | Recommended |
|---|---|---|
| RAM | 16GB | 32GB |
| Disk | 50GB free | 100GB free |
| Docker | Engine 24+ | Docker Desktop |
| OS | Ubuntu 20.04+ | Ubuntu 22.04+ |
| GPU | — | NVIDIA + nvidia-container-toolkit |

Also required:
- `jq` — `sudo apt install jq` or `brew install jq`
- Docker Compose v2 — included with Docker Engine 24+

---

## 🚀 Quick Start

### Linux (AppImage)

```bash
chmod +x "OmniBioAI Studio-0.1.0-beta.1.AppImage"
./"OmniBioAI Studio-0.1.0-beta.1.AppImage"
```

1. Select execution mode (Local recommended for first run)
2. Set Data Directory and Work Directory in Settings
3. Click **Boot System** on the Launch page
4. Open Workbench at http://localhost:8000

### Stack only (headless / no Electron)

```bash
bash scripts/start.sh    # start all services
bash scripts/stop.sh     # stop all services
```

### From source

```bash
npm install
npm run dev              # development mode
npm run build            # build AppImage (Linux)
npm run build:mac        # build DMG (macOS)
```

---

## 🔐 GHCR Authentication

Private service images require a GitHub token:

```bash
export GITHUB_TOKEN=your_github_personal_access_token
export GITHUB_USER=your_github_username
```

Add to `~/.bashrc` to persist. Token needs `read:packages` scope.

**Public images (no auth needed):**
- `omnibioai-base`
- `omnibioai-dev-env`
- `omnibioai-tool-runtime`
- All `omnibioai-plugin-*` images

---

## 🏗 Architecture

```
┌─────────────────────────────────────┐
│      OmniBioAI Studio               │
│   Electron + React (Wizard UI)      │
└──────────────┬──────────────────────┘
               │ IPC
               ▼
┌─────────────────────────────────────┐
│      Electron Main Process          │
│  - Config manager (JSON)            │
│  - Docker Compose lifecycle         │
│  - Health check polling             │
│  - Log streaming                    │
└──────────────┬──────────────────────┘
               │ docker compose
               ▼
┌─────────────────────────────────────┐
│      Docker Compose Runtime         │
│  14 services via GHCR images        │
│  Workbench · TES · ToolServer       │
│  Model Registry · LIMS · RAG        │
│  Control Center · Dev Hub · SDK     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      Execution Backends             │
│  - Local CPU/GPU                    │
│  - HPC: Slurm + Apptainer via TES   │
│  - Cloud: AWS Batch / Azure Batch   │
│  - Kubernetes                       │
└─────────────────────────────────────┘
```

---

## ⚙ Configuration

Studio stores config at:
- **Linux:** `~/.config/omnibioai/omnibioai.config.json`
- **macOS:** `~/Library/Application Support/omnibioai-studio/omnibioai.config.json`

Key settings:

```json
{
  "mode": "local",
  "settings": {
    "data_dir": "/path/to/omnibioai/data",
    "work_dir": "/path/to/omnibioai/work"
  },
  "llm": {
    "enable_ollama": true,
    "enable_claude": false,
    "claude_api_key": ""
  }
}
```

---

## 🔗 OmniBioAI Ecosystem

OmniBioAI Studio is the **desktop control layer** for:

| Repository | Role |
|---|---|
| `omnibioai` | Main Django workbench + 80+ plugins |
| `omnibioai-tes` | Task Execution Service |
| `omnibioai-toolserver` | FastAPI tool API |
| `omnibioai-lims` | Lab data management |
| `omnibioai-model-registry` | ML model versioning |
| `omnibioai-control-center` | Health + image dashboard |
| `omnibioai-rag` | PubMed RAG pipeline |
| `omnibioai-dev-hub` | Knowledge graph + embeddings |
| `omnibioai-workflow-bundles` | WDL/Nextflow/Snakemake bundles |
| `omnibioai-tool-images` | 80+ bioinformatics tool containers |
| `omnibioai_sdk` | Python SDK + React launcher |
| `omnibioai-dev-docker` | DGX/GPU development environment |

---

## 🗺 Roadmap

**v0.2 — Runtime Intelligence**
- Mode-aware workflow routing
- Live TES job monitoring in UI
- Auto-pull plugin images on first use

**v0.3 — Cloud & HPC**
- AWS Batch job submission
- Slurm queue visualization
- Azure Batch integration

**v0.4 — Enterprise**
- SSO authentication
- RBAC via OPA
- HIPAA audit logging

**v0.5 — Desktop Evolution**
- Auto-updater (AppImage + DMG)
- Offline installer bundle
- Version-pinned deployments

---

## 🐛 Known Issues (Beta)

- System MySQL/Redis must be stopped before starting studio stack (`sudo systemctl stop mysql redis-server`)
- `GITHUB_TOKEN` must be set manually for private image pull
- macOS DMG not yet published (AppImage Linux only for now)
- Kubernetes health check requires kubeconfig at `~/.kube/config`

---

## 📄 License

Apache 2.0 — see [LICENSE](LICENSE)

---

## 👤 Author

Manish Kumar — [GitHub](https://github.com/man4ish)

---

*OmniBioAI Studio is not a bioinformatics tool — it is a desktop orchestration system for distributed scientific computation.*