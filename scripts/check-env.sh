#!/usr/bin/env bash
# check-env.sh — Validate .env before starting OmniBioAI
# Run before 'docker compose up' to catch placeholder secrets.
#
# Usage: ./scripts/check-env.sh
# Exit code 0 = all good, 1 = dangerous defaults found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[ERROR] .env not found at ${ENV_FILE}"
  echo "        Copy .env.example to .env and fill in your values."
  exit 1
fi

# Load .env
set -a
source <(grep -v '^#' "$ENV_FILE" | grep -v '^$')
set +a

ERRORS=0

check_not_default() {
  local var="$1"
  local forbidden="$2"
  local val="${!var:-}"
  if [[ -z "$val" || "$val" == "$forbidden" || "$val" == "change-me" || \
        "$val" == "change-me-in-production" || "$val" == "omnibioai" ]]; then
    echo "[ERROR] ${var} is not set or uses a default/placeholder value"
    ERRORS=$((ERRORS + 1))
  fi
}

check_not_empty() {
  local var="$1"
  local val="${!var:-}"
  if [[ -z "$val" ]]; then
    echo "[WARN]  ${var} is empty (may be intentional)"
  fi
}

echo "[INFO] Checking .env secrets..."

# Critical secrets — must not be defaults
check_not_default "MYSQL_ROOT_PASSWORD"  "change-me-in-production"
check_not_default "AUTH_SECRET_KEY"      "change-me-in-production"
check_not_default "LICENSE_SECRET"       "change-me-in-production"
check_not_default "LIMS_PASSWORD"        "change-me"
check_not_default "GF_ADMIN_PASSWORD"    "omnibioai"
check_not_default "JUPYTER_TOKEN"        "omnibioai"
check_not_default "RSTUDIO_PASSWORD"     "omnibioai"
check_not_default "VSCODE_PASSWORD"      "omnibioai"

# Required paths — must be set
check_not_default "MACHINE_DIR"   "/path/to/your/machine/dir"
check_not_default "WORKSPACE_HOST" "/path/to/omnibioai"
check_not_default "WORK_DIR"      "/path/to/omnibioai"
check_not_default "DATA_DIR"      "/path/to/data"

# Optional but worth noting if empty
check_not_empty "ANTHROPIC_API_KEY"
check_not_empty "SENTRY_DSN"

if [[ "$ERRORS" -gt 0 ]]; then
  echo ""
  echo "[FAIL] ${ERRORS} secret(s) need to be changed before running in production."
  echo "       Edit .env and replace placeholder values with real secrets."
  exit 1
fi

echo "[OK]  All critical secrets are set."
echo "[OK]  Safe to start the stack."
exit 0
