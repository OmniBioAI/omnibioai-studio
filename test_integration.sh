#!/usr/bin/env bash
# ============================================================
# OmniBioAI Security Control Plane — Integration Smoke Test
# ============================================================
# Usage:
#   chmod +x test_integration.sh
#   ./test_integration.sh
#
# Requires: curl, jq, docker compose
# Run from: ~/Desktop/machine/omnibioai-studio/
# ============================================================

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass() { echo -e "${GREEN}  ✓ $1${NC}"; ((PASS++)); }
fail() { echo -e "${RED}  ✗ $1${NC}"; ((FAIL++)); }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; ((WARN++)); }
section() { echo -e "\n${BLUE}══ $1 ══${NC}"; }

# ── Config ───────────────────────────────────────────────────
HOST="${HOST:-localhost}"
GATEWAY_PORT="${GATEWAY_PORT:-8080}"
AUTH_PORT="${AUTH_PORT:-8001}"
POLICY_PORT="${POLICY_PORT:-8002}"
HPC_PORT="${HPC_PORT:-8003}"
AUDIT_PORT="${AUDIT_PORT:-8004}"
WORKBENCH_PORT="${WORKBENCH_PORT:-8000}"
TES_PORT="${TES_PORT:-8081}"
TOOLSERVER_PORT="${TOOLSERVER_PORT:-9090}"
REDIS_PORT="${REDIS_PORT:-6380}"

GATEWAY="http://$HOST:$GATEWAY_PORT"
AUTH="http://$HOST:$AUTH_PORT"
POLICY="http://$HOST:$POLICY_PORT"
HPC="http://$HOST:$HPC_PORT"
AUDIT="http://$HOST:$AUDIT_PORT"
WORKBENCH="http://$HOST:$WORKBENCH_PORT"
TES="http://$HOST:$TES_PORT"
TOOLSERVER="http://$HOST:$TOOLSERVER_PORT"

TIMEOUT=5

# ── Helper ───────────────────────────────────────────────────
check_http() {
    local label=$1
    local url=$2
    local expected_status=${3:-200}
    local response
    local status

    status=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time $TIMEOUT "$url" 2>/dev/null || echo "000")

    if [ "$status" = "$expected_status" ]; then
        pass "$label → HTTP $status"
        return 0
    else
        fail "$label → expected HTTP $expected_status, got HTTP $status"
        return 1
    fi
}

check_json_field() {
    local label=$1
    local url=$2
    local field=$3
    local expected=$4

    local body
    body=$(curl -s --max-time $TIMEOUT "$url" 2>/dev/null || echo "{}")
    local value
    value=$(echo "$body" | jq -r "$field" 2>/dev/null || echo "parse_error")

    if [ "$value" = "$expected" ]; then
        pass "$label → $field = $value"
    else
        fail "$label → expected $field=$expected, got $value"
    fi
}

# ============================================================
section "1. Docker Service Health"
# ============================================================

echo "  Checking all containers are running..."

EXPECTED_SERVICES=(
    "api-gateway"
    "policy-engine"
    "hpc-policy-engine"
    "security-audit"
    "auth-service"
    "redis"
    "mysql"
    "workbench"
    "tes"
    "toolserver"
)

for svc in "${EXPECTED_SERVICES[@]}"; do
    state=$(docker compose ps --format json 2>/dev/null \
        | jq -rs ".[] | select(.Service=="$svc") | .State" 2>/dev/null ||         docker compose ps $svc --format json 2>/dev/null \
        | jq -r ".State" 2>/dev/null || echo "missing")
    if [ "$state" = "running" ]; then
        pass "Container $svc is running"
    else
        fail "Container $svc is $state (expected running)"
    fi
done

# ============================================================
section "2. Health Endpoints — New Security Services"
# ============================================================

check_http "API Gateway health"     "$GATEWAY/health"
check_http "Auth Service health"    "$AUTH/health"
check_http "Policy Engine health"   "$POLICY/health"
check_http "HPC Policy health"      "$HPC/health"
check_http "Security Audit health"  "$AUDIT/health"

# ============================================================
section "3. Health Endpoints — Existing Services"
# ============================================================

check_http "Workbench reachable"    "$WORKBENCH"            200
check_http "TES reachable"          "$TES/api/tools"        200
check_http "Toolserver reachable"   "$TOOLSERVER/health"    200

# ============================================================
section "4. Redis Connectivity"
# ============================================================

echo "  Checking Redis is accepting connections..."
if redis-cli -p $REDIS_PORT ping 2>/dev/null | grep -q "PONG"; then
    pass "Redis responding on port $REDIS_PORT"
else
    warn "redis-cli not available locally — skipping Redis direct check"
fi

echo "  Checking Redis keys from gateway cache..."
KEY_COUNT=$(redis-cli -p $REDIS_PORT keys "iam:*" 2>/dev/null | wc -l || echo "0")
echo "  → IAM cache entries: $KEY_COUNT (expected 0 before any logins)"

# ============================================================
section "5. Gateway — Unauthenticated Request (should be rejected)"
# ============================================================

echo "  Sending request to gateway without JWT token..."
status=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time $TIMEOUT \
    "$GATEWAY/api/tools" 2>/dev/null || echo "000")

if [ "$status" = "401" ]; then
    pass "Gateway correctly rejects unauthenticated request → HTTP 401"
else
    fail "Gateway should return 401 for no token, got $status"
fi

# ============================================================
section "6. Auth Service — Login + Token"
# ============================================================

echo "  Attempting login with test credentials..."
LOGIN_RESPONSE=$(curl -s --max-time $TIMEOUT \
    -X POST "$AUTH/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin"}' 2>/dev/null || echo "{}")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.access_token // empty' 2>/dev/null || echo "")

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    pass "Auth service issued JWT token"
    echo "  → Token preview: ${TOKEN:0:40}..."
else
    warn "Could not get token — auth service may need different credentials"
    echo "  → Response: $LOGIN_RESPONSE"
    TOKEN=""
fi

# ============================================================
section "7. Gateway — Authenticated Request"
# ============================================================

if [ -n "$TOKEN" ]; then
    echo "  Sending authenticated request through gateway..."
    status=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time $TIMEOUT \
        -H "Authorization: Bearer $TOKEN" \
        "$GATEWAY/api/tools" 2>/dev/null || echo "000")

    if [ "$status" = "200" ]; then
        pass "Gateway forwards authenticated request → HTTP 200"
    elif [ "$status" = "403" ]; then
        warn "Gateway returned 403 — token valid but policy denied (check RBAC roles)"
    else
        fail "Gateway returned unexpected status $status for authenticated request"
    fi
else
    warn "Skipping authenticated gateway test — no token available"
fi

# ============================================================
section "8. Policy Engine — Direct Evaluation"
# ============================================================

echo "  Sending test policy evaluation request..."
POLICY_RESPONSE=$(curl -s --max-time $TIMEOUT \
    -X POST "$POLICY/policy/evaluate" \
    -H "Content-Type: application/json" \
    -H "X-Internal-Service: gateway" \
    -H "X-Trace-Id: test-trace-001" \
    -d '{
        "user_id": "test-user",
        "resource": "tes/jobs",
        "action": "submit",
        "attributes": {}
    }' 2>/dev/null || echo "{}")

DECISION=$(echo "$POLICY_RESPONSE" | jq -r '.allowed // .decision // empty' 2>/dev/null || echo "")

if [ -n "$DECISION" ]; then
    pass "Policy engine responded with decision: $DECISION"
else
    fail "Policy engine did not return expected decision field"
    echo "  → Response: $POLICY_RESPONSE"
fi

# ============================================================
section "9. HPC Policy Engine — Direct Evaluation"
# ============================================================

echo "  Sending test HPC quota evaluation..."
HPC_RESPONSE=$(curl -s --max-time $TIMEOUT \
    -X POST "$HPC/jobs/evaluate" \
    -H "Content-Type: application/json" \
    -H "X-Internal-Service: gateway" \
    -H "X-Trace-Id: test-trace-002" \
    -d '{
        "user_id": "test-user",
        "gpu_requested": 1,
        "cpu_requested": 4,
        "cluster": "default"
    }' 2>/dev/null || echo "{}")

HPC_DECISION=$(echo "$HPC_RESPONSE" | jq -r '.allowed // .decision // empty' 2>/dev/null || echo "")

if [ -n "$HPC_DECISION" ]; then
    pass "HPC policy engine responded with decision: $HPC_DECISION"
else
    fail "HPC policy engine did not return expected decision field"
    echo "  → Response: $HPC_RESPONSE"
fi

# ============================================================
section "10. Security Audit — Test Log Entry"
# ============================================================

echo "  Triggering test audit log entry..."
AUDIT_RESPONSE=$(curl -s --max-time $TIMEOUT \
    "$AUDIT/audit/test" 2>/dev/null || echo "{}")

LOGGED=$(echo "$AUDIT_RESPONSE" | jq -r '.logged // empty' 2>/dev/null || echo "")

if [ "$LOGGED" = "true" ]; then
    pass "Security audit service logged test event"
else
    fail "Security audit did not confirm log entry"
    echo "  → Response: $AUDIT_RESPONSE"
fi

echo "  Checking Redis stream for audit events..."
STREAM_LEN=$(redis-cli -p $REDIS_PORT xlen "audit:events" 2>/dev/null || echo "unknown")
echo "  → audit:events stream length: $STREAM_LEN"

# ============================================================
section "11. Internal Service Headers — Propagation Check"
# ============================================================

echo "  Checking gateway adds internal headers to upstream calls..."
if [ -n "$TOKEN" ]; then
    HEADERS_RESPONSE=$(curl -s --max-time $TIMEOUT \
        -H "Authorization: Bearer $TOKEN" \
        -H "X-Trace-Id: smoke-test-trace-999" \
        -D - \
        "$GATEWAY/health" 2>/dev/null || echo "")

    if echo "$HEADERS_RESPONSE" | grep -qi "x-trace-id"; then
        pass "Gateway propagates X-Trace-Id header"
    else
        warn "X-Trace-Id not visible in response headers (may be internal only)"
    fi
else
    warn "Skipping header propagation check — no token available"
fi

# ============================================================
section "12. Redis Pub/Sub — policy:invalidate Channel"
# ============================================================

echo "  Checking policy:invalidate channel is subscribable..."
PUBSUB_CHECK=$(redis-cli -p $REDIS_PORT \
    pubsub channels "policy:invalidate" 2>/dev/null || echo "error")

if echo "$PUBSUB_CHECK" | grep -q "policy:invalidate"; then
    pass "policy:invalidate channel has active subscribers"
else
    warn "No active subscribers on policy:invalidate yet (services may not have connected)"
fi

# ============================================================
section "Summary"
# ============================================================

TOTAL=$((PASS + FAIL + WARN))
echo ""
echo -e "  Total checks : $TOTAL"
echo -e "  ${GREEN}Passed${NC}        : $PASS"
echo -e "  ${RED}Failed${NC}        : $FAIL"
echo -e "  ${YELLOW}Warnings${NC}      : $WARN"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}  ✓ All critical checks passed. Stack is healthy.${NC}"
elif [ $FAIL -le 3 ]; then
    echo -e "${YELLOW}  ⚠ Minor issues found. Review failures above.${NC}"
else
    echo -e "${RED}  ✗ Multiple failures. Check docker compose logs for details:${NC}"
    echo -e "    docker compose logs api-gateway policy-engine hpc-policy-engine security-audit"
fi

echo ""
echo "  Useful debug commands:"
echo "  → docker compose logs -f api-gateway"
echo "  → docker compose logs -f policy-engine"
echo "  → docker compose logs -f security-audit"
echo "  → redis-cli -p 6380 xread COUNT 10 STREAMS audit:events 0"
echo "  → redis-cli -p 6380 keys 'iam:*'"
echo ""

exit $FAIL