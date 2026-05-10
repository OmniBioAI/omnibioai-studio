#!/bin/bash
echo "======================================"
echo " Stopping OmniBioAI Studio"
echo "======================================"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/../docker-compose.yml"

if [ -f "$COMPOSE_FILE" ]; then
  docker compose -f "$COMPOSE_FILE" down
  echo "✅ Stack stopped"
else
  # Fallback — stop by container name prefix
  docker ps --filter "name=omnibioai-studio" -q | xargs -r docker stop
  echo "✅ Containers stopped"
fi

echo "======================================"
echo " OmniBioAI Studio stopped"
echo "======================================"
