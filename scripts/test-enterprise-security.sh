#!/usr/bin/env bash
# ============================================================
# PR12 — Enterprise IAM/RBAC Smoke Test
# ============================================================
# Validates the live local stack end to end:
#   - Auth Service, API Gateway, Policy Engine, Control Center health
#   - JWT issuance + validation
#   - RBAC enforcement (401 missing token / 401 invalid token / 403
#     insufficient permission) through the real API Gateway middleware
#     chain, against a throwaway, self-registered user -- no fixed
#     admin credentials are assumed (admin@omnibioai's password is
#     either operator-set via ADMIN_BOOTSTRAP_PASSWORD or a one-time
#     random value printed at first boot, neither of which this script
#     can rely on).
#
# This complements, not replaces, the existing broader
# ../test_integration.sh (docker health, redis, audit, HPC checks) --
# this one is scoped specifically to PR12's IAM/RBAC validation.
#
# Usage:
#   chmod +x scripts/test-enterprise-security.sh
#   ./scripts/test-enterprise-security.sh
#
# Requires: curl, python3 (for JWT payload decoding + a temporary
#           mismatched-secret token in case 3), docker compose
# Run from: ~/Desktop/machine/omnibioai-studio/
# ============================================================

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0

pass() { echo -e "${GREEN}  [PASS]${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}  [FAIL]${NC} $1"; FAIL=$((FAIL + 1)); }
section() { echo -e "\n${BLUE}== $1 ==${NC}"; }

HOST="${HOST:-localhost}"
GATEWAY_PORT="${GATEWAY_PORT:-8080}"
AUTH_PORT="${AUTH_PORT:-8001}"
POLICY_PORT="${POLICY_PORT:-8002}"
CONTROL_CENTER_PORT="${CONTROL_CENTER_PORT:-7070}"

GATEWAY="http://$HOST:$GATEWAY_PORT"
AUTH="http://$HOST:$AUTH_PORT"
POLICY="http://$HOST:$POLICY_PORT"
CONTROL_CENTER="http://127.0.0.1:$CONTROL_CENTER_PORT"

TIMEOUT=5

check_http_status() {
    local label=$1 url=$2 expected=$3 method=${4:-GET} data=${5:-}
    local status
    if [ -n "$data" ]; then
        status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" \
            -X "$method" -H "Content-Type: application/json" -H "${6:-}" -d "$data" "$url" 2>/dev/null || echo "000")
    else
        status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" \
            -X "$method" -H "${6:-}" "$url" 2>/dev/null || echo "000")
    fi
    if [ "$status" = "$expected" ]; then
        pass "$label -> HTTP $status"
    else
        fail "$label -> expected HTTP $expected, got HTTP $status"
    fi
}

json_field() {
    python3 -c "import sys, json; d = json.load(sys.stdin); print(d.get('$1', ''))" 2>/dev/null
}

# ============================================================
section "1. Service Health"
# ============================================================

check_http_status "Auth Service health"    "$AUTH/health"     200
check_http_status "API Gateway health"     "$GATEWAY/health"  200
check_http_status "Policy Engine health"   "$POLICY/health"   200
check_http_status "Control Center health"  "$CONTROL_CENTER/health" 200

# ============================================================
section "2. JWT Issuance + Validation"
# ============================================================

TEST_EMAIL="pr12-smoke-$(date +%s)@omnibioai.test"
TEST_PASSWORD="Pr12SmokeTest123!"

REGISTER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" \
    -X POST "$AUTH/auth/register" -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" 2>/dev/null || echo "000")

if [ "$REGISTER_STATUS" = "200" ]; then
    pass "Register throwaway smoke-test user -> HTTP 200"
else
    fail "Register throwaway smoke-test user -> expected HTTP 200, got $REGISTER_STATUS"
fi

LOGIN_RESPONSE=$(curl -s --max-time "$TIMEOUT" \
    -X POST "$AUTH/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" 2>/dev/null || echo "{}")
TOKEN=$(echo "$LOGIN_RESPONSE" | json_field access_token)

if [ -n "$TOKEN" ]; then
    pass "Login issues a JWT access_token"
else
    fail "Login did not return access_token (response: $LOGIN_RESPONSE)"
fi

if [ -n "$TOKEN" ]; then
    VALIDATE_RESPONSE=$(curl -s --max-time "$TIMEOUT" \
        -X POST "$AUTH/auth/validate" -H "Content-Type: application/json" \
        -d "{\"token\":\"$TOKEN\"}" 2>/dev/null || echo "{}")
    VALID=$(echo "$VALIDATE_RESPONSE" | json_field valid)
    if [ "$VALID" = "True" ]; then
        pass "Auth Service validates the issued JWT (valid=True)"
    else
        fail "Auth Service did not validate the issued JWT (response: $VALIDATE_RESPONSE)"
    fi
else
    fail "Skipping JWT validation check -- no token from login"
fi

# ============================================================
section "3. RBAC Enforcement via API Gateway"
# ============================================================

# Case 1: no JWT at all -> 401
check_http_status "Gateway with no token" "$GATEWAY/model-registry/v1" 401

# Case 2: invalid/malformed JWT -> 401
check_http_status "Gateway with invalid token" "$GATEWAY/model-registry/v1" 401 GET "" "Authorization: Bearer not-a-real-jwt"

# Case 3: valid JWT, insufficient permission -> 403 expected.
#
# Uses /rag/v1/query rather than model-registry: a freshly registered
# user gets the default "user" role with no registry permissions
# (omnibioai-auth's role_service.py), and NONE of the reserved
# workflow.execute/dataset.read/model.use permissions PR12 wires up in
# omnibioai-policy-engine are granted to any real role yet (deliberate
# scope containment -- see this PR's report). So the Policy Engine layer
# itself would currently allow this request through (opt-in enforcement,
# a no-op when permissions=[]) for every one of the 5 gateway-routed
# services. RAG is the one exception with real, live enforcement today:
# omnibioai-rag independently re-verifies the JWT and requires dataset.read
# itself (ragbio/api/iam.py's require_permission dependency, wired on
# every /v1/query and /v1/kg/* route in ragbio/api/server.py) -- this is
# what this case actually exercises end to end right now.
if [ -n "$TOKEN" ]; then
    check_http_status "Gateway->RAG: valid token, missing dataset.read permission" \
        "$GATEWAY/rag/v1/query" 403 POST '{"query":"test"}' "Authorization: Bearer $TOKEN"
else
    fail "Skipping insufficient-permission check -- no token from login"
fi

# Case 4: valid JWT with the required permission -> 200.
# Not exercised here without a way to grant dataset.read to the
# smoke-test user without operator credentials -- covered by this PR's
# automated test suites instead (omnibioai-policy-engine's
# test_role_hierarchy_fixtures.py, omnibioai-api-gateway's
# test_pr12_middleware_chain_e2e.py). If ADMIN_BOOTSTRAP_TOKEN is set
# (a pre-issued token for a user known to hold model.use), this checks
# the real 200 path too.
if [ -n "${ADMIN_BOOTSTRAP_TOKEN:-}" ]; then
    check_http_status "Gateway: token with model.use permission" \
        "$GATEWAY/model-registry/v1" 200 GET "" "Authorization: Bearer $ADMIN_BOOTSTRAP_TOKEN"
else
    echo -e "${YELLOW}  [SKIP]${NC} Gateway: token with model.use permission -- set ADMIN_BOOTSTRAP_TOKEN to exercise this"
fi

# ============================================================
section "Summary"
# ============================================================

TOTAL=$((PASS + FAIL))
echo ""
echo "  Total checks : $TOTAL"
echo -e "  ${GREEN}Passed${NC}       : $PASS"
echo -e "  ${RED}Failed${NC}       : $FAIL"
echo ""

if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}  All enterprise IAM/RBAC checks passed.${NC}"
else
    echo -e "${RED}  One or more checks failed -- see above.${NC}"
fi

exit "$FAIL"
