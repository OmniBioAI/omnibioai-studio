#!/bin/bash
set -e

echo "======================================"
echo " OmniBioAI Studio Startup"
echo "======================================"

# ─── Read config ──────────────────────────
CONFIG_FILE="$HOME/.config/omnibioai/omnibioai.config.json"

if [ ! -f "$CONFIG_FILE" ]; then
  CONFIG_FILE="$HOME/Library/Application Support/omnibioai-studio/omnibioai.config.json"
fi

if [ -f "$CONFIG_FILE" ]; then
  MODE=$(jq -r '.mode // "local"' "$CONFIG_FILE")
  DATA_DIR=$(jq -r '.settings.data_dir // ""' "$CONFIG_FILE")
  WORK_DIR=$(jq -r '.settings.work_dir // ""' "$CONFIG_FILE")
  MYSQL_PASSWORD=$(jq -r '.settings.mysql_password // "root"' "$CONFIG_FILE")
  WORKSPACE_HOST=$(jq -r '.settings.workspace_host // ""' "$CONFIG_FILE")
else
  echo "[WARN] No config found, using defaults"
  MODE="local"
  DATA_DIR=""
  WORK_DIR=""
  MYSQL_PASSWORD="root"
  WORKSPACE_HOST=""
fi

# ─── Fallback defaults ────────────────────
DATA_DIR="${DATA_DIR:-$HOME/omnibioai/data}"
WORK_DIR="${WORK_DIR:-$HOME/omnibioai/work}"
WORKSPACE_HOST="${WORKSPACE_HOST:-$HOME/omnibioai}"

echo "Mode:           $MODE"
echo "Data Dir:       $DATA_DIR"
echo "Work Dir:       $WORK_DIR"
echo "Workspace:      $WORKSPACE_HOST"

# ─── Create dirs if missing ───────────────
mkdir -p "$DATA_DIR/PubMed/Abstracts"
mkdir -p "$DATA_DIR/PubMed/Index"
mkdir -p "$WORK_DIR/uploads"
mkdir -p "$WORK_DIR/runs"

# ─── GHCR login for private images ───────
if command -v docker &>/dev/null; then
  if [ -n "$GITHUB_TOKEN" ]; then
    echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin \
      && echo "[OK] Logged in to GHCR" \
      || echo "[WARN] GHCR login failed — private images may not pull"
  else
    echo "[WARN] GITHUB_TOKEN not set — skipping GHCR login"
  fi
fi

# ─── Locate compose file ──────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/../docker-compose.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "[ERROR] docker-compose.yml not found at $COMPOSE_FILE"
  exit 1
fi

# ─── Export env vars for compose ─────────
export WORKSPACE_HOST="$WORKSPACE_HOST"
export MYSQL_ROOT_PASSWORD="$MYSQL_PASSWORD"
export DATA_DIR="$DATA_DIR"
export WORK_DIR="$WORK_DIR"

echo "Using compose: $COMPOSE_FILE"

# ─── Start services by mode ───────────────
case "$MODE" in
  local)
    echo "Starting full local stack..."
    docker compose -f "$COMPOSE_FILE" up -d
    ;;
  hpc)
    echo "Starting HPC mode (local services only)..."
    docker compose -f "$COMPOSE_FILE" up -d \
      mysql redis toolserver tes model-registry rag ollama lims sdk
    ;;
  cloud)
    echo "Starting cloud mode..."
    docker compose -f "$COMPOSE_FILE" up -d \
      toolserver tes control-center rag ollama sdk
    ;;
  hybrid)
    echo "Starting hybrid mode..."
    docker compose -f "$COMPOSE_FILE" up -d
    ;;
  *)
    echo "Starting default (full) stack..."
    docker compose -f "$COMPOSE_FILE" up -d
    ;;
esac

echo ""
echo "Waiting for services to start..."
sleep 8

echo ""
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "======================================"
echo " OmniBioAI Studio is running"
echo " Workbench:      http://localhost:8000"
echo " Control Center: http://localhost:7070"
echo " Dev Hub:        http://localhost:5173"
echo " SDK Launcher:   http://localhost:5190"
echo " TES:            http://localhost:8081"
echo " LIMS:           http://localhost:7000"
echo "======================================"
