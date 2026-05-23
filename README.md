# OmniBioAI Studio

> Desktop orchestration platform for AI-powered bioinformatics computation

**OmniBioAI Studio** is an Electron desktop app that launches and manages the full OmniBioAI stack — locally, on HPC clusters, or in the cloud — with a single click.

---

## ✨ What's New in v0.2.0

- **Zero-trust security control plane** — JWT authentication + RBAC/ABAC policy enforcement on every request
- **API Gateway** — single enforced entry point for all service traffic
- **HPC Policy Engine** — per-user GPU/CPU quota governance
- **Security Audit Service** — async audit logging via Redis Streams (user, action, decision, latency, trace ID)
- **Redis token caching** — validated tokens cached (TTL=300s) with pub/sub invalidation on logout
- Internal service header propagation (`X-Internal-Service`, `X-Trace-Id`, `X-User-Id`) across all TES calls
- Fail-closed on auth/policy/HPC failure; fail-open on audit (never blocks requests)
- **RAG V6 FAISS index** — persistent vector store with recursive document indexing for large literature corpora

### v0.1.0-beta.1
- Full local stack launch with containerized services
- Live service health monitoring (Control Center)
- Docker image dashboard (platform + plugin images)
- Dev Hub with knowledge graph + RAG UI
- SDK Launcher for OmniBioAI Python SDK
- Mode-aware startup: Local / HPC / Cloud / Hybrid
- LLM configuration: Ollama (local) + Claude API + OpenAI
- Cloud execution: AWS Batch / Azure Batch / GCP Batch / Kubernetes
- HPC execution: Slurm / PBS / LSF via TES

---

## 🔐 Security Control Plane

All requests are enforced through a zero-trust pipeline:

```
Internet / Client
       ↓
api-gateway :8080     ← single entry point, JWT enforcement
       ↓
auth-service :8001    ← JWT validation + Redis cache (TTL=300s)
       ↓
policy-engine :8002   ← RBAC/ABAC authorization decision
       ↓
hpc-policy-engine :8003  ← GPU/CPU quota check (compute requests only)
       ↓
target service (workbench / tes / toolserver / rag)
       ↓
security-audit :8004  ← async audit log → Redis Streams (never blocks)
```

**Failure policy:**
| Layer | On failure |
|---|---|
| Auth | FAIL CLOSED → HTTP 401 |
| Policy | FAIL CLOSED → HTTP 403 |
| HPC quota | FAIL CLOSED → HTTP 403 |
| Audit | FAIL OPEN → ignored |

---

## 🖥 Services

| Service | Port | Description |
|---|---|---|
| **API Gateway** | :8080 | Zero-trust entry point — auth + policy + HPC enforcement |
| **Auth Service** | :8001 | JWT issuance, validation, refresh, logout |
| **Policy Engine** | :8002 | RBAC/ABAC authorization decisions |
| **HPC Policy Engine** | :8003 | GPU/CPU quota governance per user/team |
| **Security Audit** | :8004 | Async audit logging via Redis Streams |
| Workbench | :8000 | Main bioinformatics platform (Django) |
| TES | :8081 | Task Execution Service (Slurm / AWS / Azure / GCP / K8s) |
| ToolServer | :9090 | FastAPI bioinformatics tool server |
| Model Registry | :8095 | ML model versioning and serving |
| LIMS | :7000 | Lab Information Management System |
| Control Center | :7070 | Service health + Docker image dashboard |
| RAG | :8090 (ext) / :8096 (int) | PubMed literature AI + DeepSeek RAG (V6 FAISS, persistent vector store) |
| Dev Hub | :5173 / :8082 | Knowledge graph + embeddings UI |
| Workflow Bundles | :8098 | WDL/Nextflow/Snakemake/CWL workflow bundle server |
| Tool Images | :8097 | Bioinformatics tool image registry |
| Videos | :8086 | Tutorial and demo video server |
| SDK Launcher | :5190 | OmniBioAI Python SDK UI |
| Ollama | :11434 | Local LLM inference |
| OPA | :8181 | Open Policy Agent (policy rules backend) |

### Plugin images (pulled on-demand by TES)

| Image | Description |
|---|---|
| `omnibioai-plugin-scanpy` | Single-cell RNA-Seq analysis |
| `omnibioai-plugin-fastq-qc` | FASTQ quality control (FastQC + MultiQC) |
| `omnibioai-plugin-fastq-trimmer` | Read trimming (Trimmomatic) |
| `omnibioai-plugin-rnaseq-analysis` | Bulk RNA-Seq (DESeq2/edgeR) |
| `omnibioai-plugin-workflow-runner` | WDL/Nextflow/Snakemake/CWL execution |
| `omnibioai-plugin-variant-annotation` | Variant annotation (SnpEff/ANNOVAR) |
| `omnibioai-plugin-marker-identification` | Marker gene identification |
| `omnibioai-plugin-phenotype-association` | GWAS + phenotype association |

---

## 🧬 Bioinformatics Modules

### Core Platform
Home · OnboardAI · Omni Assistant · Job Monitor · Plugin Manager · Admin

### Workflows
Workflow Runner · Workflow Builder · Agent Studio · Pipeline Dashboard · Multi-Agent Bio Orchestrator · Workflow Compiler

### Omics Analysis
RNA-Seq · Single Cell (scRNA-Seq) · Exome Analysis · FASTQ QC · Proteomics · Metabolomics

### AI & Intelligence
Drug Target AI · Literature AI · Pathway Enrichment · Bio Hypothesis AI · Bio Narrator AI

### Learn
Getting Started · Tutorials · Demo Workflows · Example Pipelines · Developer Hub · Videos

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

### Stack only (headless / no Electron)

```bash
git clone https://github.com/man4ish/omnibioai-studio
cd omnibioai-studio
cp .env.example .env
# Edit .env — fill in your paths and secrets
docker compose up -d
```

Then register your first user and get a token:

```bash
# Register
curl -X POST http://localhost:8001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"yourpassword","full_name":"Admin"}'

# Login — returns JWT token
curl -X POST http://localhost:8001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"yourpassword"}'

# Use token through gateway
curl -H "Authorization: Bearer <token>" http://localhost:8080/api/tools
```

### Linux (AppImage)

```bash
chmod +x "OmniBioAI Studio-0.1.0-beta.1.AppImage"
./"OmniBioAI Studio-0.1.0-beta.1.AppImage"
```

1. Select execution mode (Local recommended for first run)
2. Set Data Directory and Work Directory in **Settings**
3. Click **Boot System** on the Launch page
4. Open Workbench at http://localhost:8000

### From source

```bash
npm install
npm run dev              # development mode
npm run build            # build AppImage (Linux)
npm run build:mac        # build DMG (macOS)
```

---

## 🔑 Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Database
MYSQL_ROOT_PASSWORD=your-db-password
MYSQL_DEFAULT_DB=omnibioai

# Auth (change in production)
AUTH_SECRET_KEY=your-secret-key-here

# Network
HOST_IP=0.0.0.0

# Paths (absolute paths on host)
DB_INIT_DIR=/path/to/omnibioai-studio/db-init
WORKSPACE_HOST=/path/to/workspace
WORK_DIR=/path/to/work
DATA_DIR=/path/to/data
VIDEO_DIR=/path/to/videos

# AI API Keys (optional)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

---

## 🔗 GHCR Authentication

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

## ☁️ Execution Backends

### Local
- CPU/GPU execution via Docker
- NVIDIA GPU support with nvidia-container-toolkit

### HPC
- **Slurm** — cluster job submission via TES
- **PBS / LSF** — alternative schedulers
- **Apptainer/Singularity** — container runtime for HPC
- SSH-based remote execution

### Cloud
- **AWS Batch** — S3 input/output, IAM profiles
- **Azure Batch** — Blob storage, managed identity
- **GCP Batch** — Cloud Storage, service accounts
- **Kubernetes** — any K8s cluster via kubeconfig

### LLM
- **Ollama** — local inference (Llama, DeepSeek, Mistral, etc.)
- **Claude API** — Anthropic cloud API
- **OpenAI** — GPT-4 and compatible APIs

---

## 🏗 Architecture

```
┌─────────────────────────────────────────┐
│        OmniBioAI Studio                 │
│     Electron + React (Wizard UI)        │
└──────────────┬──────────────────────────┘
               │ IPC
               ▼
┌─────────────────────────────────────────┐
│        Electron Main Process            │
│  - Config manager (JSON)                │
│  - Docker Compose lifecycle             │
│  - Health check polling                 │
│  - Log streaming                        │
└──────────────┬──────────────────────────┘
               │ docker compose
               ▼
┌─────────────────────────────────────────┐
│     Security Control Plane              │
│  API Gateway · Auth · Policy Engine     │
│  HPC Policy · Security Audit · Redis    │
└──────────────┬──────────────────────────┘
               │ verified requests only
               ▼
┌─────────────────────────────────────────┐
│        Docker Compose Runtime           │
│  Workbench · TES · ToolServer           │
│  Model Registry · LIMS · RAG            │
│  Control Center · Dev Hub · SDK         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│        Execution Backends               │
│  Local GPU/CPU · Slurm/PBS/LSF          │
│  AWS Batch · Azure Batch · GCP          │
│  Kubernetes · Ollama · Claude API       │
└─────────────────────────────────────────┘
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
    "claude_api_key": "",
    "enable_openai": false
  },
  "cloud": {
    "enable_aws_batch": false,
    "enable_gcp_batch": false,
    "gcp_project": "",
    "gcp_region": ""
  },
  "hpc": {
    "enabled": false,
    "scheduler": "slurm",
    "hostname": "hpc.university.edu",
    "username": "",
    "private_key": "~/.ssh/id_rsa"
  }
}
```

---

## 🔗 OmniBioAI Ecosystem

OmniBioAI Studio is the **desktop control layer** for:

| Repository | Role |
|---|---|
| `omnibioai` | Main Django workbench + 80+ plugins |
| `omnibioai-api-gateway` | Zero-trust API gateway |
| `omnibioai-auth` | JWT authentication service |
| `omnibioai-policy-engine` | RBAC/ABAC authorization |
| `omnibioai-hpc-policy-engine` | GPU/CPU quota governance |
| `omnibioai-security-audit` | Async audit logging |
| `omnibioai-iam-client` | Python SDK for auth integration |
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
| `omnibioai-security-sdk` | Security SDK for service auth integration |
| `omnibioai-design-tokens` | Shared design tokens and theme system |
| `omnibioai-ui` | Shared UI component library |
| `omnibioai-landing` | Public-facing landing page |

---

## 🗺 Roadmap

**v0.2 — Security Control Plane** ✅ Released
- Zero-trust JWT authentication on every request
- RBAC/ABAC policy engine
- HPC quota governance
- Async audit logging via Redis Streams
- Redis token caching with pub/sub invalidation
- Internal service header propagation

**v0.3 — Runtime Intelligence**
- Mode-aware workflow routing
- Live TES job monitoring in UI
- Auto-pull plugin images on first use
- Slurm queue visualization

**v0.4 — Cloud & HPC**
- AWS/Azure/GCP job submission UI
- Cost estimation per workflow
- Multi-tenant workspace isolation

**v0.5 — Enterprise**
- SSO / SAML integration
- Role management UI
- HIPAA compliance reporting from audit logs
- Cost attribution per user/team

**v0.6 — Desktop Evolution**
- Auto-updater (AppImage + DMG)
- Offline installer bundle
- Version-pinned deployments

---

## 🖥 Platform Notes

**ARM machines (Apple Silicon, AWS Graviton):**
Some service images were built for `linux/amd64`. They run via emulation on ARM with a warning:
```
The requested image's platform (linux/amd64) does not match the detected host platform (linux/arm64/v8)
```
This is expected and harmless for development. For production ARM deployments, rebuild affected images with `--platform linux/arm64`.

---

## 🐛 Known Issues (Beta)

- System MySQL/Redis must be stopped before starting: `sudo systemctl stop mysql redis-server`
- `GITHUB_TOKEN` must be set manually for private image pull
- macOS DMG not yet code-signed (GateKeeper warning expected)
- Windows installer not yet code-signed
- Kubernetes health check requires `~/.kube/config`
- policy-engine and hpc-policy-engine do not expose a `/health` endpoint (returns 404, services are running)

---

## 📄 License

Apache 2.0 — see [LICENSE](LICENSE)

---

## 👤 Author

Manish Kumar — [GitHub](https://github.com/man4ish)

---

*OmniBioAI Studio is not a bioinformatics tool — it is a desktop orchestration system for distributed, secure, AI-native scientific computation.*