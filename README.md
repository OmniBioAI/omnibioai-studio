# 📦 OmniBioAI Studio

**OmniBioAI Studio** is a desktop-first orchestration interface for the OmniBioAI ecosystem.
It provides a **single-click launcher (Electron DMG / AppImage-ready)** for configuring and running:

* Local bioinformatics stack
* Docker-based execution runtime
* HPC workflows (Slurm / Apptainer via TES)
* Cloud execution (AWS Batch / Azure Batch / Kubernetes)
* Local + cloud LLM integration (Ollama, Claude API, Codex-style APIs)

---

# 🧠 Current Status (Beta v0.1)

This repository is currently in **Beta Prototype Stage**.

## ✅ What is implemented

### 🖥 Electron Desktop App

* Electron main process (`electron/main.js`)
* Secure preload bridge (`electron/preload.js`)
* IPC communication layer

### ⚛ React UI (Wizard-based setup)

* Mode selection (Local / HPC / Cloud / Hybrid)
* LLM configuration (Claude API, Ollama toggle)
* Cloud configuration UI (AWS / Azure placeholders)
* HPC configuration UI (Slurm / cluster placeholders)
* Launch screen (start system button)

### 🐳 Docker Runtime Integration

* Docker Compose-based backend orchestration
* `start.sh` bootstrap script
* Service lifecycle controlled from Electron

### ⚙ Backend Configuration System

* Config persistence via JSON
* Electron → Node backend config bridge

### 📦 Packaging Ready

* `electron-builder.json` configured for **DMG builds**
* Vite frontend build system ready

---

# 🏗 Current Architecture

```text
┌──────────────────────────────┐
│     OmniBioAI Studio UI      │
│   (Electron + React Wizard)  │
└──────────────┬───────────────┘
               │ IPC
               ▼
┌──────────────────────────────┐
│     Electron Main Process     │
│  - Config manager             │
│  - Docker trigger            │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│     Docker Compose Runtime    │
│  - TES                       │
│  - ToolServer               │
│  - Model Registry           │
│  - LIMS                     │
│  - Control Center           │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ External Execution Backends   │
│ - HPC (Slurm / Apptainer)    │
│ - AWS Batch                  │
│ - Azure Batch                │
│ - Kubernetes                 │
│ - Local GPU / CPU           │
└──────────────────────────────┘
```

---

# 🎯 Current Capability

## 🟢 What users can do right now

* Launch desktop app (Electron)
* Select execution mode (Local / HPC / Cloud / Hybrid)
* Configure LLM providers:

  * Claude API key
  * Ollama toggle
* Trigger Docker stack startup
* Persist configuration locally

---

# ⚠️ Limitations (Beta scope)

This version is intentionally minimal:

* ❌ No authentication system
* ❌ No RBAC / enterprise security
* ❌ No cloud provisioning automation
* ❌ No HPC job submission UI (only config stage)
* ❌ No runtime orchestration engine yet
* ❌ No live logs or monitoring dashboard
* ❌ No auto-update system

---

# 🚀 Future Roadmap

## 🧩 Phase 1 — Runtime Intelligence Layer (Next Major Step)

* Mode-aware runtime orchestrator
* Intelligent backend routing:

  * Local execution
  * HPC submission via TES
  * Cloud batch execution
* Service health monitoring inside UI
* Live logs streaming (Docker + TES)

---

## ☁️ Phase 2 — Cloud & HPC Integration

### AWS

* AWS Batch job submission UI
* IAM profile support
* S3 input/output mapping

### Azure

* Azure Batch integration
* Azure Blob storage support
* Managed identity support

### HPC

* Slurm cluster integration
* Apptainer/Singularity support
* Job queue visualization

---

## 🤖 Phase 3 — LLM Orchestration Layer

* Multi-LLM routing engine:

  * Local: Ollama
  * Cloud: Claude API
  * Future: Codex-style APIs
* Model switching per workflow
* Context-aware AI assistant for workflows

---

## 🐳 Phase 4 — Production Deployment Layer

* GHCR-based image distribution
* CI/CD pipeline for all backend services
* Version-pinned deployments
* Offline-first bundle installer

---

## 🔐 Phase 5 — Enterprise Layer

* Authentication system (SSO-ready)
* RBAC + ABAC policy engine
* Open Policy Agent (OPA) integration
* Audit logging (HIPAA / pharma compliance ready)
* Data lineage tracking across workflows

---

## 📦 Phase 6 — Desktop Evolution

* DMG auto-updater system
* Silent background updates
* Version sync with backend services
* Offline installer bundles

---

# 🧪 Development Setup

## Requirements

* Node.js 18+
* Docker + Docker Compose
* Python 3.10+ (optional for backend tools)

---

## Run in Development Mode

```bash
npm install
npm run dev
```

---

## Build Production UI

```bash
npm run build
```

---

## Create DMG (macOS)

```bash
npm run dist
```

---

# 🐳 Start Backend Stack

```bash
bash scripts/start.sh
```

or manually:

```bash
docker compose -f docker/docker-compose.yml up -d
```

---

# 🧠 Design Principles

* Local-first execution (no mandatory cloud dependency)
* Docker-native orchestration
* Mode-driven architecture (Local / HPC / Cloud / Hybrid)
* Plugin-ready backend ecosystem
* Future-proof for distributed compute systems
* Offline-capable desktop control plane

---

# 🔗 Relationship to OmniBioAI Ecosystem

This repository is the **desktop control layer** of:

* TES (Tool Execution Service)
* ToolServer
* LIMS
* Model Registry
* Workflow Bundles
* RAG system

It does NOT contain bioinformatics logic itself.

---

# ⚡ Key Insight

OmniBioAI Studio is NOT a bioinformatics tool.

It is:

> 🧠 A **desktop orchestration system for distributed scientific computation**

---

# 🏁 Current Release

```text
Version: v0.1.0 (Beta)
Status: Functional Prototype
Target: Internal + Early Beta Users
```

---

# 📌 Next Immediate Step Recommendation

Before adding more features:

👉 Build **Runtime Orchestrator Layer**

That is the missing “brain” between:

* Electron UI
* Docker runtime
* HPC / Cloud / LLM backends

