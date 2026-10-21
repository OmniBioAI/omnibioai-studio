#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
ENV_FILE="${OMNIBIOAI_DGX_ENV_FILE:-${PROJECT_DIR}/.env}"

COMPOSE=(
  docker compose
  --project-name omnibioai-studio
  --project-directory "${PROJECT_DIR}"
  --env-file "${ENV_FILE}"
  -f "${PROJECT_DIR}/docker-compose.yml"
  -f "${PROJECT_DIR}/docker-compose.override.yml"
  -f "${PROJECT_DIR}/docker-compose.arm64.yml"
)

# Keep the production-only host binding and Workbench policy opt-in so routine
# DGX helper use does not silently recreate services with a different network
# boundary. Set this explicitly when rendering or applying the production layer.
if [[ "${OMNIBIOAI_DGX_PRODUCTION:-0}" == "1" ]]; then
  COMPOSE+=( -f "${PROJECT_DIR}/docker-compose.dgx-production.yml" )
fi

if (( $# == 0 )); then
  set -- config
fi

exec "${COMPOSE[@]}" "$@"
