#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
ENV_FILE="${OMNIBIOAI_DGX_ENV_FILE:-${PROJECT_DIR}/.env}"

python3 "${SCRIPT_DIR}/compose_path_preflight.py" \
  --env-file "${ENV_FILE}" \
  "${PROJECT_DIR}/docker-compose.yml" \
  "${PROJECT_DIR}/docker-compose.override.yml" \
  "${PROJECT_DIR}/docker-compose.arm64.yml"

exec "${SCRIPT_DIR}/devhub-index-preflight.sh"
