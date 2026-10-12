#!/usr/bin/env bash
# Read-only inventory of ledger payload storage inside the running Workbench
# and Celery containers (P0 managed-storage pre-cutover gate).
#
# Requires Docker access (docker group or sudo). All logic lives in
# storage_container_inventory.py, which emits exactly one JSON document and
# records failures as structured errors (exit 1 = partial, report still valid).
#
# Usage:
#   sudo bash scripts/storage_container_inventory.sh --output storage-inventory.json
#   sudo bash scripts/storage_container_inventory.sh > storage-inventory.json
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "${SCRIPT_DIR}/storage_container_inventory.py" "$@"
