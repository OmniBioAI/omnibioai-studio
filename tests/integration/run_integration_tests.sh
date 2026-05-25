#!/usr/bin/env bash
# =============================================================================
# OmniBioAI Integration Test Runner
# =============================================================================
# Runs all integration tests and reports pass/fail per suite.
#
# Usage:
#   cd ~/Desktop/machine/omnibioai-studio
#   chmod +x tests/integration/run_integration_tests.sh
#   ./tests/integration/run_integration_tests.sh
#
# Environment overrides:
#   OMNIBIOAI_BASE_URL   — nginx router  (default: http://localhost)
#   OMNIBIOAI_AUTH_URL   — auth service  (default: http://localhost:8001)
#   OMNIBIOAI_LIMS_URL   — LIMS service  (default: http://localhost:7000)
#   OMNIBIOAI_TES_URL    — TES service   (default: http://localhost:8081)
#   OMNIBIOAI_RAG_URL    — RAG service   (default: http://localhost:8090)
#   RAGBIO_API_KEY       — RAG API key
#   PYTEST_EXTRA_ARGS    — extra flags forwarded to pytest (e.g. "-x --tb=short")
#
# Requires: python3, pytest, requests
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0

section() { echo -e "\n${BLUE}══ $1 ══${NC}"; }
pass()    { echo -e "${GREEN}  ✓ $1${NC}"; ((PASS++)); }
fail()    { echo -e "${RED}  ✗ $1${NC}"; ((FAIL++)); }

# ── Dependency check ──────────────────────────────────────────────────────────

section "Dependency check"

if ! command -v python3 &>/dev/null; then
    fail "python3 not found"; exit 1
fi

if ! python3 -c "import pytest" 2>/dev/null; then
    echo "  Installing pytest + requests..."
    pip install -q pytest requests
fi

pass "python3 and pytest available"

# ── Default URLs ──────────────────────────────────────────────────────────────

export OMNIBIOAI_BASE_URL="${OMNIBIOAI_BASE_URL:-http://localhost}"
export OMNIBIOAI_AUTH_URL="${OMNIBIOAI_AUTH_URL:-http://localhost:8001}"
export OMNIBIOAI_LIMS_URL="${OMNIBIOAI_LIMS_URL:-http://localhost:7000}"
export OMNIBIOAI_TES_URL="${OMNIBIOAI_TES_URL:-http://localhost:8081}"
export OMNIBIOAI_RAG_URL="${OMNIBIOAI_RAG_URL:-http://localhost:8090}"

echo ""
echo "  Base URL  : $OMNIBIOAI_BASE_URL"
echo "  Auth URL  : $OMNIBIOAI_AUTH_URL"
echo "  LIMS URL  : $OMNIBIOAI_LIMS_URL"
echo "  TES URL   : $OMNIBIOAI_TES_URL"
echo "  RAG URL   : $OMNIBIOAI_RAG_URL"

# ── Quick reachability check before running pytest ────────────────────────────

section "Pre-flight reachability"

check_url() {
    local name="$1"
    local url="$2"
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")
    if [ "$status" != "000" ] && [ "$status" -lt 500 ] 2>/dev/null; then
        pass "$name ($url) → HTTP $status"
        return 0
    else
        fail "$name ($url) → HTTP $status (unreachable or 5xx)"
        return 1
    fi
}

check_url "nginx-router"  "$OMNIBIOAI_BASE_URL/_health"
check_url "auth-service"  "$OMNIBIOAI_AUTH_URL/health"
check_url "lims"          "$OMNIBIOAI_LIMS_URL/healthz"
check_url "tes"           "$OMNIBIOAI_TES_URL/health"
check_url "rag"           "$OMNIBIOAI_RAG_URL/health"

# ── Run test suites ───────────────────────────────────────────────────────────

PYTEST_ARGS="-v --tb=short ${PYTEST_EXTRA_ARGS:-}"
RESULTS_DIR="$SCRIPT_DIR/results"
mkdir -p "$RESULTS_DIR"

run_suite() {
    local name="$1"
    local file="$2"
    local xml="$RESULTS_DIR/${name}.xml"

    section "Suite: $name"
    if python3 -m pytest "$file" \
        $PYTEST_ARGS \
        --junit-xml="$xml" \
        --confcutdir="$SCRIPT_DIR" \
        2>&1; then
        pass "$name passed"
    else
        fail "$name FAILED (see above)"
    fi
}

cd "$SCRIPT_DIR"

run_suite "services_health"   "test_services_health.py"
run_suite "auth_integration"  "test_auth_integration.py"
run_suite "lims_integration"  "test_lims_integration.py"
run_suite "tes_integration"   "test_tes_integration.py"
run_suite "rag_integration"   "test_rag_integration.py"

# ── Summary ───────────────────────────────────────────────────────────────────

section "Summary"
TOTAL=$((PASS + FAIL))
echo ""
echo "  Suites run  : $TOTAL"
echo -e "  ${GREEN}Passed${NC}      : $PASS"
echo -e "  ${RED}Failed${NC}      : $FAIL"
echo ""
echo "  JUnit XML reports saved to: $RESULTS_DIR/"
echo ""

if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}  ✓ All integration test suites passed.${NC}"
    exit 0
else
    echo -e "${RED}  ✗ $FAIL suite(s) failed. Review output above.${NC}"
    echo ""
    echo "  Useful debug commands:"
    echo "    docker compose logs auth-service"
    echo "    docker compose logs lims"
    echo "    docker compose logs tes"
    echo "    docker compose logs rag"
    echo "    docker compose ps"
    exit 1
fi
