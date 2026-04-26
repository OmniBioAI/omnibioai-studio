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
else
  echo "[WARN] No config found, using defaults"
  MODE="local"
  DATA_DIR=""
  WORK_DIR=""
fi

# ─── Fallback defaults ────────────────────
DATA_DIR="${DATA_DIR:-$HOME/omnibioai/data}"
WORK_DIR="${WORK_DIR:-$HOME/omnibioai/work}"

echo "Mode:       $MODE"
echo "Data Dir:   $DATA_DIR"
echo "Work Dir:   $WORK_DIR"

# ─── Create dirs if missing ───────────────
mkdir -p "$DATA_DIR/PubMed/Abstracts"
mkdir -p "$DATA_DIR/PubMed/Index"
mkdir -p "$WORK_DIR/uploads"
mkdir -p "$WORK_DIR/runs"

# ─── Inject paths into compose ────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_TEMPLATE="$SCRIPT_DIR/../docker/docker-compose.yml"
DYNAMIC_COMPOSE="/tmp/omnibioai-compose-$(date +%s).yml"

sed \
  -e "s|DATA_DIR_PLACEHOLDER|$DATA_DIR|g" \
  -e "s|WORK_DIR_PLACEHOLDER|$WORK_DIR|g" \
  "$COMPOSE_TEMPLATE" > "$DYNAMIC_COMPOSE"

echo "Generated compose: $DYNAMIC_COMPOSE"

# ─── Start services by mode ───────────────
case "$MODE" in
  local)
    docker compose -f "$DYNAMIC_COMPOSE" up -d
    ;;
  hpc)
    docker compose -f "$DYNAMIC_COMPOSE" up -d \
      mysql redis toolserver tes model-registry rag ollama
    ;;
  cloud)
    docker compose -f "$DYNAMIC_COMPOSE" up -d \
      toolserver tes control-center rag ollama
    ;;
  hybrid)
    docker compose -f "$DYNAMIC_COMPOSE" up -d
    ;;
  *)
    docker compose -f "$DYNAMIC_COMPOSE" up -d
    ;;
esac

echo "Waiting for services to start..."
sleep 5
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo "======================================"
echo " OmniBioAI Studio is running"
echo "======================================"
