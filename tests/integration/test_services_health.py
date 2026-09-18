"""
test_services_health.py — checks all services are UP via their health endpoints.

Services are reached:
  • Through the nginx router at http://localhost/_svc/<name>/...
  • Directly on their native ports for authoritative health checks

Run: pytest tests/integration/test_services_health.py -v

Developer:
    Manish Kumar <manish@omnibioai.org>
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
    """Returns True when the URL answers with a status below 500; a connection error or
    timeout counts as down."""
    try:
        r = _get(url)
        return r.status_code < 500
    except requests.RequestException:
        return False


# ── Nginx router ──────────────────────────────────────────────────────────────

class TestNginxRouter:
    """The nginx router's /_health endpoint responds 200 with status ok and a router
    field."""
    def test_nginx_health_returns_200(self):
        """GET /_health on the nginx router returns HTTP 200."""
        r = _get(f"{BASE_URL}/_health")
        assert r.status_code == 200

    def test_nginx_health_body_has_status_ok(self):
        """The router /_health body reports status ok."""
        r = _get(f"{BASE_URL}/_health")
        assert r.json()["status"] == "ok"

    def test_nginx_health_body_has_router_field(self):
        """The router /_health body includes a router field."""
        r = _get(f"{BASE_URL}/_health")
        assert "router" in r.json()


# ── Auth service ──────────────────────────────────────────────────────────────

class TestAuthServiceHealth:
    """Auth service health, directly on port 8001 and through the router at
    /_svc/auth/health."""
    def test_direct_health_returns_200(self):
        """GET /health directly on the auth service returns 200."""
        r = requests.get("http://localhost:8001/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_direct_health_body(self):
        """The direct auth /health body reports status ok."""
        r = requests.get("http://localhost:8001/health", timeout=TIMEOUT)
        assert r.json().get("status") == "ok"

    def test_via_nginx_health(self):
        """GET /_svc/auth/health through the router returns 200."""
        r = _get(f"{BASE_URL}/_svc/auth/health")
        assert r.status_code == 200


# ── Workbench (Django) ────────────────────────────────────────────────────────

class TestWorkbenchHealth:
    """The Workbench root path is reachable, meaning a status below 500, directly on
    port 8000 and through the router."""
    def test_direct_root_reachable(self):
        """GET http://localhost:8000/ returns a status below 500."""
        r = requests.get("http://localhost:8000/", timeout=TIMEOUT)
        assert r.status_code < 500

    def test_via_nginx_root_reachable(self):
        """GET / through the router returns a status below 500."""
        r = _get(f"{BASE_URL}/")
        assert r.status_code < 500


# ── LIMS ──────────────────────────────────────────────────────────────────────

class TestLimsHealth:
    """LIMS /healthz and /readyz respond 200 directly on port 7000, and /healthz
    responds 200 through the router at /_svc/lims/."""
    def test_direct_healthz_returns_200(self):
        """GET /healthz directly on LIMS returns 200."""
        r = requests.get("http://localhost:7000/healthz", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_direct_readyz_returns_200(self):
        """GET /readyz directly on LIMS returns 200."""
        r = requests.get("http://localhost:7000/readyz", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_healthz(self):
        """GET /_svc/lims/healthz through the router returns 200."""
        r = requests.get(f"{BASE_URL}/_svc/lims/healthz", timeout=TIMEOUT)
        assert r.status_code == 200


# ── TES ───────────────────────────────────────────────────────────────────────

class TestTesHealth:
    """TES health directly on port 8081: /health returns 200 with ok=true, and the tools
    list endpoint returns 200."""
    def test_direct_health_returns_200(self):
        """GET /health directly on TES returns 200."""
        r = requests.get("http://localhost:8081/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_direct_health_body_ok_true(self):
        """The direct TES /health body has ok set to true."""
        r = requests.get("http://localhost:8081/health", timeout=TIMEOUT)
        assert r.json().get("ok") is True

    def test_direct_tools_list_reachable(self):
        """GET /api/tools directly on TES returns 200."""
        r = requests.get("http://localhost:8081/api/tools", timeout=TIMEOUT)
        assert r.status_code == 200


# ── RAG ───────────────────────────────────────────────────────────────────────

class TestRagHealth:
    """RAG /health directly on port 8090 and through the router at /_svc/rag/health."""
    def test_direct_health_returns_200(self):
        """GET /health directly on RAG returns 200."""
        r = requests.get("http://localhost:8090/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_direct_health_body(self):
        """The direct RAG /health body reports status ok."""
        r = requests.get("http://localhost:8090/health", timeout=TIMEOUT)
        data = r.json()
        assert data.get("status") == "ok"

    def test_via_nginx_health(self):
        """GET /_svc/rag/health through the router returns 200."""
        r = _get(f"{BASE_URL}/_svc/rag/health")
        assert r.status_code == 200


# ── API Gateway ───────────────────────────────────────────────────────────────

class TestApiGatewayHealth:
    """API Gateway /health directly on port 8080 and through the router at
    /_svc/gateway/health."""
    def test_direct_health_returns_200(self):
        """GET /health directly on the API Gateway returns 200."""
        r = requests.get("http://localhost:8080/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_health(self):
        """GET /_svc/gateway/health through the router returns 200."""
        r = _get(f"{BASE_URL}/_svc/gateway/health")
        assert r.status_code == 200


# ── Policy Engine ─────────────────────────────────────────────────────────────
# The policy engine exposes no /health route; /openapi.json is only a liveness check.

class TestPolicyEngineHealth:
    """Policy engine liveness through /openapi.json, since it exposes no /health route:
    directly on port 8002 and through /_svc/policy/."""
    def test_direct_openapi_returns_200(self):
        """GET /openapi.json directly on the policy engine returns 200."""
        r = requests.get("http://localhost:8002/openapi.json", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_health(self):
        """GET /_svc/policy/openapi.json through the router returns 200."""
        r = _get(f"{BASE_URL}/_svc/policy/openapi.json")
        assert r.status_code == 200


# ── HPC Policy Engine ─────────────────────────────────────────────────────────
# Same as policy engine: no /health route, use /openapi.json.

class TestHpcPolicyEngineHealth:
    """HPC policy engine liveness through /openapi.json, since it exposes no /health
    route: directly on port 8003 and through /_svc/hpc/."""
    def test_direct_openapi_returns_200(self):
        """GET /openapi.json directly on the HPC policy engine returns 200."""
        r = requests.get("http://localhost:8003/openapi.json", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_health(self):
        """GET /_svc/hpc/openapi.json through the router returns 200."""
        r = _get(f"{BASE_URL}/_svc/hpc/openapi.json")
        assert r.status_code == 200


# ── Security Audit ────────────────────────────────────────────────────────────

class TestSecurityAuditHealth:
    """Security-audit /health directly on port 8004 and through the router at
    /_svc/audit/health."""
    def test_direct_health_returns_200(self):
        """GET /health directly on the security-audit service returns 200."""
        r = requests.get("http://localhost:8004/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_health(self):
        """GET /_svc/audit/health through the router returns 200."""
        r = _get(f"{BASE_URL}/_svc/audit/health")
        assert r.status_code == 200


# ── Control Center ────────────────────────────────────────────────────────────

class TestControlCenterHealth:
    """Control Center /health is reachable, meaning a status below 500, directly on port
    7070 and through /_svc/control/health."""
    def test_direct_reachable(self):
        """GET /health directly on Control Center returns a status below 500."""
        r = requests.get("http://localhost:7070/health", timeout=TIMEOUT)
        assert r.status_code < 500

    def test_via_nginx_reachable(self):
        """GET /_svc/control/health through the router returns a status below 500."""
        r = _get(f"{BASE_URL}/_svc/control/health")
        assert r.status_code < 500


# ── Toolserver ────────────────────────────────────────────────────────────────

class TestToolserverHealth:
    """Toolserver /health returns 200 directly on port 9090; through the router it is
    auth_request-gated end to end and needs a real bearer token."""
    def test_direct_health_returns_200(self):
        """GET /health directly on the toolserver returns 200."""
        r = requests.get("http://localhost:9090/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_health(self):
        """GET /_svc/toolserver/health through the router with a bearer token from the
        central auth service returns 200; a throwaway user is registered to obtain the
        token."""
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
    """Model Registry /health is reachable, meaning a status below 500, directly on port
    8095 and through /_svc/modelregistry/health."""
    def test_direct_reachable(self):
        """GET /health directly on the model registry returns a status below 500."""
        r = requests.get("http://localhost:8095/health", timeout=TIMEOUT)
        assert r.status_code < 500

    def test_via_nginx_reachable(self):
        """GET /_svc/modelregistry/health through the router returns a status below 500."""
        r = _get(f"{BASE_URL}/_svc/modelregistry/health")
        assert r.status_code < 500


# ── Workflow Bundles ──────────────────────────────────────────────────────────

class TestWorkflowBundlesHealth:
    """Workflow Bundles /health on port 8098 is reachable, meaning a status below 500."""
    def test_direct_reachable(self):
        """GET /health directly on workflow-bundles returns a status below 500."""
        r = requests.get("http://localhost:8098/health", timeout=TIMEOUT)
        assert r.status_code < 500


# ── OPA ───────────────────────────────────────────────────────────────────────
# OPA is part of the primary 40-service Compose profile and is required here.

class TestOpaHealth:
    """OPA /health returns 200 directly on port 8181 and through the router at
    /_svc/opa/health."""
    def test_direct_health_returns_200(self):
        """GET /health directly on OPA returns 200."""
        r = requests.get("http://localhost:8181/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_health(self):
        """GET /_svc/opa/health through the router returns 200."""
        r = _get(f"{BASE_URL}/_svc/opa/health")
        assert r.status_code == 200


# ── Grafana ───────────────────────────────────────────────────────────────────

class TestGrafanaHealth:
    """Grafana /api/health returns 200 directly on port 3000 and through the router at
    /_svc/monitor/api/health."""
    def test_direct_reachable(self):
        """GET /api/health directly on Grafana returns 200."""
        r = requests.get("http://localhost:3000/api/health", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_via_nginx_reachable(self):
        """GET /_svc/monitor/api/health through the router returns 200."""
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
    """Parametrized over the SERVICES list: each service's health or openapi URL is
    reachable, meaning the request completes with a status below 500."""
    assert _is_up(url), f"Service '{name}' is not reachable at {url}"


def test_is_up_returns_false_for_unreachable_url():
    """_is_up returns False, rather than raising, for a URL nothing listens on
    (localhost port 1)."""
    # Port 1 is reserved and nothing listens there, so this should raise a
    # RequestException that _is_up() swallows and turns into False.
    assert _is_up("http://localhost:1/health") is False
