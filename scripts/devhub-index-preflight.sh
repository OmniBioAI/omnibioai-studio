#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
STUDIO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
MACHINE_DIR="${MACHINE_DIR:-$(cd "${STUDIO_DIR}/.." && pwd -P)}"
INDEX_DIR="${DEVHUB_INDEX_DIR:-${MACHINE_DIR}/omnibioai-dev-hub/data/faiss_index}"
VERIFIER="${MACHINE_DIR}/omnibioai-dev-hub/scripts/verify_index.py"

if [[ ! -f "${VERIFIER}" ]]; then
  echo "Dev Hub preflight failed: verifier is missing: ${VERIFIER}" >&2
  exit 1
fi

exec python3 "${VERIFIER}" "${INDEX_DIR}" --require-public-only
