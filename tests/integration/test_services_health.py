"""
test_services_health.py — checks all services are UP via their health endpoints.

Services are reached:
  • Through the nginx router at http://localhost/_svc/<name>/...
  • Directly on their native ports for authoritative health checks

Run: pytest tests/integration/test_services_health.py -v
"""

import uuid

import pytest
import requests

from conftest import AUTH_DIRECT_URL, BASE_URL, TIMEOUT


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get(url: str, headers: dict | None = None) -> requests.Response:
    return requests.get(url, headers=headers or {}, timeout=TIMEOUT)


def _bearer_token() -> str:
    """A real access token from the central auth service, same pattern
    test_cross_app_sso.py/test_rag_integration.py already use to satisfy an
    auth_request-gated /_svc/* location (nginx-router.conf's
    $control_authorization map accepts this directly as a Bearer header)."""
    email = f"itest-toolserver-{uuid.uuid4().hex}@example.com"
    password = "S3curePass!1"

    reg = requests.post(
        f"{AUTH_DIRECT_URL}/auth/register", json={"email": email, "password": password}, timeout=TIMEOUT
    )
    assert reg.status_code == 200, f"setup: register failed: {reg.text}"

    login = requests.post(
        f"{AUTH_DIRECT_URL}/auth/login", json={"email": email, "password": password}, timeout=TIMEOUT
    )
    assert login.status_code == 200, f"setup: login failed: {login.text}"

    return login.json()["access_token"]


def _is_up(url: str) -> bool:
    try:
        r = _get(url)
        return r.status_code < 500
    except requests.RequestException:
        return False


# ── Nginx router ──────────────────────────────────────────────────────────────

class TestNginxRouter:
    def test_nginx_health_returns_200(self):
        r = _get(f"{BASE_URL}/_health")
        assert r.status_code == 200

    def test_nginx_health_body_has_status_ok(self):
        r = _get(f"{BASE_URL}/_health")
        assert r.json()["status"] == "ok"

    def test_nginx_health_body_has_router_field(self):
        r = _get(f"{BASE_URL}/_health")
        assert "router" in r.json()


# ── Auth service ──────────────────────────────────────────────────────────────

class TestAuthServiceHealth:
    def test_direct_health_returns_200(self):
        r = requests.get("http://localhost:8001/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_direct_health_body(self):
        r = requests.get("http://localhost:8001/health", timeout=TIMEOUT)
        assert r.json().get("status") == "ok"

    def test_via_nginx_health(self):
        r = _get(f"{BASE_URL}/_svc/auth/health")
        assert r.status_code == 200


# ── Workbench (Django) ────────────────────────────────────────────────────────

class TestWorkbenchHealth:
    def test_direct_root_reachable(self):
        r = requests.get("http://localhost:8000/", timeout=TIMEOUT)
        assert r.status_code < 500

    def test_via_nginx_root_reachable(self):
        r = _get(f"{BASE_URL}/")
        assert r.status_code < 500


# ── LIMS ──────────────────────────────────────────────────────────────────────

class TestLimsHealth:
    def test_direct_healthz_returns_200(self):
        r = requests.get("http://localhost:7000/healthz", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_direct_readyz_returns_200(self):
        r = requests.get("http://localhost:7000/readyz", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_healthz(self):
        r = requests.get(f"{BASE_URL}/_svc/lims/healthz", timeout=TIMEOUT)
        assert r.status_code == 200


# ── TES ───────────────────────────────────────────────────────────────────────

class TestTesHealth:
    def test_direct_health_returns_200(self):
        r = requests.get("http://localhost:8081/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_direct_health_body_ok_true(self):
        r = requests.get("http://localhost:8081/health", timeout=TIMEOUT)
        assert r.json().get("ok") is True

    def test_direct_tools_list_reachable(self):
        r = requests.get("http://localhost:8081/api/tools", timeout=TIMEOUT)
        assert r.status_code == 200


# ── RAG ───────────────────────────────────────────────────────────────────────

class TestRagHealth:
    def test_direct_health_returns_200(self):
        r = requests.get("http://localhost:8090/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_direct_health_body(self):
        r = requests.get("http://localhost:8090/health", timeout=TIMEOUT)
        data = r.json()
        assert data.get("status") == "ok"

    def test_via_nginx_health(self):
        r = _get(f"{BASE_URL}/_svc/rag/health")
        assert r.status_code == 200


# ── API Gateway ───────────────────────────────────────────────────────────────

class TestApiGatewayHealth:
    def test_direct_health_returns_200(self):
        r = requests.get("http://localhost:8080/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_health(self):
        r = _get(f"{BASE_URL}/_svc/gateway/health")
        assert r.status_code == 200


# ── Policy Engine ─────────────────────────────────────────────────────────────
# The policy engine exposes no /health route; /openapi.json is only a liveness check.

class TestPolicyEngineHealth:
    def test_direct_openapi_returns_200(self):
        r = requests.get("http://localhost:8002/openapi.json", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_health(self):
        r = _get(f"{BASE_URL}/_svc/policy/openapi.json")
        assert r.status_code == 200


# ── HPC Policy Engine ─────────────────────────────────────────────────────────
# Same as policy engine: no /health route, use /openapi.json.

class TestHpcPolicyEngineHealth:
    def test_direct_openapi_returns_200(self):
        r = requests.get("http://localhost:8003/openapi.json", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_health(self):
        r = _get(f"{BASE_URL}/_svc/hpc/openapi.json")
        assert r.status_code == 200


# ── Security Audit ────────────────────────────────────────────────────────────

class TestSecurityAuditHealth:
    def test_direct_health_returns_200(self):
        r = requests.get("http://localhost:8004/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_health(self):
        r = _get(f"{BASE_URL}/_svc/audit/health")
        assert r.status_code == 200


# ── Control Center ────────────────────────────────────────────────────────────

class TestControlCenterHealth:
    def test_direct_reachable(self):
        r = requests.get("http://localhost:7070/health", timeout=TIMEOUT)
        assert r.status_code < 500

    def test_via_nginx_reachable(self):
        r = _get(f"{BASE_URL}/_svc/control/health")
        assert r.status_code < 500


# ── Toolserver ────────────────────────────────────────────────────────────────

class TestToolserverHealth:
    def test_direct_health_returns_200(self):
        r = requests.get("http://localhost:9090/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_health(self):
        # /_svc/toolserver is auth_request-gated end to end (including this
        # health path -- unlike Control Center's own health/summary/services
        # paths just above, toolserver has no unauthenticated carve-out) since
        # the SSRF-as-a-service exposure documented in
        # ~/toolserver-auth-gap-report-2026-09-01.md. Needs a real token.
        r = _get(
            f"{BASE_URL}/_svc/toolserver/health",
            headers={"Authorization": f"Bearer {_bearer_token()}"},
        )
        assert r.status_code == 200


# ── Model Registry ────────────────────────────────────────────────────────────

class TestModelRegistryHealth:
    def test_direct_reachable(self):
        r = requests.get("http://localhost:8095/health", timeout=TIMEOUT)
        assert r.status_code < 500

    def test_via_nginx_reachable(self):
        r = _get(f"{BASE_URL}/_svc/modelregistry/health")
        assert r.status_code < 500


# ── Workflow Bundles ──────────────────────────────────────────────────────────

class TestWorkflowBundlesHealth:
    def test_direct_reachable(self):
        r = requests.get("http://localhost:8098/health", timeout=TIMEOUT)
        assert r.status_code < 500


# ── OPA ───────────────────────────────────────────────────────────────────────
# OPA is part of the primary 40-service Compose profile and is required here.

class TestOpaHealth:
    def test_direct_health_returns_200(self):
        r = requests.get("http://localhost:8181/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_health(self):
        r = _get(f"{BASE_URL}/_svc/opa/health")
        assert r.status_code == 200


# ── Grafana ───────────────────────────────────────────────────────────────────

class TestGrafanaHealth:
    def test_direct_reachable(self):
        r = requests.get("http://localhost:3000/api/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_reachable(self):
        r = _get(f"{BASE_URL}/_svc/monitor/api/health")
        assert r.status_code == 200


# ── Parametric sweep: all services must be reachable ─────────────────────────

SERVICES = [
    pytest.param("nginx-router",   f"{BASE_URL}/_health",                   id="nginx-router"),
    pytest.param("auth-service",   "http://localhost:8001/health",           id="auth-service"),
    pytest.param("tes",            "http://localhost:8081/health",           id="tes"),
    pytest.param("rag",            "http://localhost:8090/health",           id="rag"),
    pytest.param("api-gateway",    "http://localhost:8080/health",           id="api-gateway"),
    # policy/HPC engines expose /openapi.json, not /health; 404 still counts as up
    pytest.param("policy-engine",  "http://localhost:8002/openapi.json",     id="policy-engine"),
    pytest.param("hpc-policy",     "http://localhost:8003/openapi.json",     id="hpc-policy"),
    pytest.param("security-audit", "http://localhost:8004/health",           id="security-audit"),
    pytest.param("toolserver",     "http://localhost:9090/health",           id="toolserver"),
    pytest.param("opa",            "http://localhost:8181/health",           id="opa"),
    pytest.param("grafana",        "http://localhost:3000/api/health",       id="grafana"),
]


@pytest.mark.parametrize("name,url", SERVICES)
def test_service_is_up(name, url):
    assert _is_up(url), f"Service '{name}' is not reachable at {url}"


def test_is_up_returns_false_for_unreachable_url():
    # Port 1 is reserved and nothing listens there, so this should raise a
    # RequestException that _is_up() swallows and turns into False.
    assert _is_up("http://localhost:1/health") is False
