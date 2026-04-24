#!/bin/bash

set -e

echo "======================================"
echo " OmniBioAI Studio Startup"
echo "======================================"

CONFIG_FILE="$HOME/Library/Application Support/OmniBioAI/config.json"

MODE=$(jq -r '.mode // "local"' "$CONFIG_FILE" 2>/dev/null || echo "local")

echo "Detected mode: $MODE"

# ─────────────────────────────
# LOCAL MODE
# ─────────────────────────────

if [ "$MODE" = "local" ]; then
  echo "[LOCAL] Starting full local stack..."

  docker compose \
    -f docker/docker-compose.yml \
    up -d

fi

# ─────────────────────────────
# HPC MODE
# ─────────────────────────────

if [ "$MODE" = "hpc" ]; then
  echo "[HPC] Starting only control plane..."

  docker compose \
    -f docker/docker-compose.yml \
    up -d mysql redis toolserver tes model-registry

fi

# ─────────────────────────────
# CLOUD MODE
# ─────────────────────────────

if [ "$MODE" = "cloud" ]; then
  echo "[CLOUD] Starting cloud orchestration layer..."

  docker compose \
    -f docker/docker-compose.yml \
    up -d toolserver tes control-center

fi

# ─────────────────────────────
# HYBRID MODE
# ─────────────────────────────

if [ "$MODE" = "hybrid" ]; then
  echo "[HYBRID] Starting full distributed stack..."

  docker compose \
    -f docker/docker-compose.yml \
    up -d

fi

# ─────────────────────────────
# HEALTH CHECK LOOP
# ─────────────────────────────

echo "Waiting for services to become healthy..."

sleep 5

docker ps

echo "======================================"
echo " OmniBioAI Studio Started"
echo "======================================"