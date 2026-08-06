#!/usr/bin/env bash
# ============================================================
# PR12/PR13 — Enterprise IAM/RBAC Smoke Test
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
#   - PR13: the 200 path -- a role that actually holds the required
#     permission gets through. Seeds a throwaway scientist-role and
#     viewer-role user directly via MySQL (this script's existing
#     "docker compose" dependency, now also used for this) since there's
#     no HTTP-reachable way to get a self-registered user into an
#     org-scoped role without either an operator-provided admin token or
#     DB access -- see the case 4 comment below for why.
#
# This complements, not replaces, the existing broader
# ../test_integration.sh (docker health, redis, audit, HPC checks) --
# this one is scoped specifically to PR12/PR13's IAM/RBAC validation.
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

# Case 4 (PR13): valid JWT WITH the required permission -> 200, and the
# converse -- a valid JWT from a role that deliberately lacks it -> 403.
#
# Through PR12 this was unexercisable without an operator-provided
# ADMIN_BOOTSTRAP_TOKEN: no role granted workflow.execute/dataset.read/
# model.use to anyone, and there's no HTTP-reachable way for this
# self-registered smoke-test user to get itself INTO an org-scoped role
# that holds one -- org creation makes you that org's org_admin
# automatically (manage_org, not model.use), and the only other path
# (being invited into someone else's org) has no accept-invite endpoint
# to move the membership from "invited" to "active" via the API at all.
# PR13 seeds real scientist/viewer roles (org_service.ensure_default_
# org_roles, granted workflow.execute/dataset.read/model.use and
# dataset.read/workflow.read respectively), so this now seeds the
# assignment directly via MySQL -- the same "Requires: ... docker
# compose" dependency this script already declared, just exercised here
# instead of only for orchestration. ADMIN_BOOTSTRAP_TOKEN, if set,
# still works as a direct override (used as the request token itself,
# unchanged from PR12) for an operator who'd rather not grant this
# script DB access.
if [ -n "${ADMIN_BOOTSTRAP_TOKEN:-}" ]; then
    check_http_status "Gateway: token with model.use permission" \
        "$GATEWAY/model-registry/v1" 200 GET "" "Authorization: Bearer $ADMIN_BOOTSTRAP_TOKEN"
elif command -v docker >/dev/null 2>&1 && docker compose exec -T mysql true >/dev/null 2>&1; then
    MYSQL_CONTAINER_EXEC="docker compose exec -T mysql mysql -uroot -p${MYSQL_ROOT_PASSWORD:-root} -N -e"

    seed_role_and_get_token() {
        local role_name=$1 email_prefix=$2
        local email="pr13-${email_prefix}-$(date +%s)@omnibioai.test"
        local password="Pr13SmokeTest123!"

        curl -s -o /dev/null --max-time "$TIMEOUT" -X POST "$AUTH/auth/register" \
            -H "Content-Type: application/json" -d "{\"email\":\"$email\",\"password\":\"$password\"}"

        local first_login org_id
        first_login=$(curl -s --max-time "$TIMEOUT" -X POST "$AUTH/auth/login" \
            -H "Content-Type: application/json" -d "{\"email\":\"$email\",\"password\":\"$password\"}")
        local first_token
        first_token=$(echo "$first_login" | json_field access_token)
        [ -z "$first_token" ] && return 1

        org_id=$(curl -s --max-time "$TIMEOUT" -X POST "$AUTH/orgs" \
            -H "Content-Type: application/json" -H "Authorization: Bearer $first_token" \
            -d "{\"name\":\"PR13 Smoke $email_prefix\",\"slug\":\"pr13-smoke-${email_prefix}-$(date +%s)\"}" \
            | json_field id)
        [ -z "$org_id" ] && return 1

        local user_id
        user_id=$(curl -s --max-time "$TIMEOUT" -X POST "$AUTH/auth/validate" \
            -H "Content-Type: application/json" -d "{\"token\":\"$first_token\"}" | json_field user_id)
        [ -z "$user_id" ] && return 1

        # Replace this membership's role (org_admin, from org creation)
        # with the target role -- membership_roles is a bare join table
        # (0002_multi_tenant_schema), no per-row metadata to preserve.
        local role_id
        role_id=$($MYSQL_CONTAINER_EXEC "SELECT id FROM omnibioai.roles WHERE name='$role_name' AND organization_id IS NULL LIMIT 1;" 2>/dev/null)
        [ -z "$role_id" ] && return 1
        local membership_id
        membership_id=$($MYSQL_CONTAINER_EXEC "SELECT id FROM omnibioai.organization_memberships WHERE organization_id=$org_id AND user_id=$user_id LIMIT 1;" 2>/dev/null)
        [ -z "$membership_id" ] && return 1
        $MYSQL_CONTAINER_EXEC "DELETE FROM omnibioai.membership_roles WHERE membership_id=$membership_id; INSERT INTO omnibioai.membership_roles (membership_id, role_id) VALUES ($membership_id, $role_id);" >/dev/null 2>&1

        # Fresh login -- the first token's permissions claim predates the
        # role swap above (built at the moment of that earlier login).
        curl -s --max-time "$TIMEOUT" -X POST "$AUTH/auth/login" \
            -H "Content-Type: application/json" -d "{\"email\":\"$email\",\"password\":\"$password\"}" | json_field access_token
    }

    SCIENTIST_TOKEN=$(seed_role_and_get_token scientist scientist)
    if [ -n "$SCIENTIST_TOKEN" ]; then
        check_http_status "Gateway: scientist token (model.use) -> model-registry" \
            "$GATEWAY/model-registry/v1" 200 GET "" "Authorization: Bearer $SCIENTIST_TOKEN"
    else
        fail "Gateway: scientist token (model.use) -> model-registry -- could not seed scientist-role user"
    fi

    VIEWER_TOKEN=$(seed_role_and_get_token viewer viewer)
    if [ -n "$VIEWER_TOKEN" ]; then
        check_http_status "Gateway: viewer token (no model.use) -> model-registry" \
            "$GATEWAY/model-registry/v1" 403 GET "" "Authorization: Bearer $VIEWER_TOKEN"
    else
        fail "Gateway: viewer token (no model.use) -> model-registry -- could not seed viewer-role user"
    fi
else
    echo -e "${YELLOW}  [SKIP]${NC} Gateway: scientist/viewer permission checks -- set ADMIN_BOOTSTRAP_TOKEN, or run this against the docker-compose stack (mysql service) to exercise them"
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
