#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${OMNIBIOAI_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd -P)}"
ENV_FILE="${1:-${ROOT}/.env}"
shift || true
COMPOSE_FILES=("${@:-${ROOT}/docker-compose.release.yml}")
exec python3 "${SCRIPT_DIR}/compose_path_preflight.py" --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}"
