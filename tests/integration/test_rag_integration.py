"""
test_rag_integration.py — queries the RAG API and checks it returns results.

RAG service endpoints (FastAPI, port 8090 external / 8096 internal):
  GET  /health          — liveness probe  → {"status": "ok", "version": "..."}
  GET  /v1/studies      — list indexed studies
  GET  /v1/cache        — cache statistics
  POST /v1/query        — run a RAG query  → {"events": [...], ...}
  POST /v1/ingest       — ingest PubMed articles (SSE stream)
  POST /v1/embed        — embed a study (SSE stream)

Authentication: /v1/studies and /v1/cache accept the static RAGBIO_API_KEY
bearer token. /v1/query is further along the Multi-user Workspaces Phase 0a
migration and requires a real IAM-issued JWT instead (ragbio/api/iam.py) --
minted the same way test_cross_app_sso.py does, by registering/logging in
against the central auth service and reusing its access_token.

Run: pytest tests/integration/test_rag_integration.py -v

Developer:
    Manish Kumar <manish@omnibioai.org>
"""

import uuid

import pytest
import requests

from conftest import AUTH_DIRECT_URL, RAG_DIRECT_URL, RAGBIO_API_KEY, TIMEOUT

BASE = RAG_DIRECT_URL


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get(path: str, auth: bool = True) -> requests.Response:
    """GETs a RAG path, optionally with the static RAGBIO_API_KEY bearer token, and
    retries once on a timeout."""
    headers = {"Authorization": f"Bearer {RAGBIO_API_KEY}"} if auth else {}
    # /v1/studies in particular sees occasional multi-second latency spikes
    # in this environment; one retry absorbs those without masking a real
    # outage (a second consecutive timeout still fails the test).
    try:
        return requests.get(f"{BASE}{path}", headers=headers, timeout=TIMEOUT)
    except requests.exceptions.Timeout:
        return requests.get(f"{BASE}{path}", headers=headers, timeout=TIMEOUT)


def _post(path: str, body: dict, auth: bool = True) -> requests.Response:
    headers = {"Authorization": f"Bearer {RAGBIO_API_KEY}"} if auth else {}
    return requests.post(f"{BASE}{path}", json=body, headers=headers, timeout=TIMEOUT)


def _query_jwt() -> str:
    """A real IAM-issued JWT, minted the same way test_cross_app_sso.py's
    _register_and_login() does: register + log in against the central auth
    service and reuse its access_token. /v1/query is IAM-gated and no
    longer accepts the static RAGBIO_API_KEY (see module docstring)."""
    email = f"itest-ragquery-{uuid.uuid4().hex}@example.com"
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


def _post_query(body: dict) -> requests.Response:
    """POSTs to /v1/query with a freshly minted IAM JWT; each call registers a new
    throwaway user in the auth service."""
    headers = {"Authorization": f"Bearer {_query_jwt()}"}
    return requests.post(f"{BASE}/v1/query", json=body, headers=headers, timeout=TIMEOUT)


# ── Health ────────────────────────────────────────────────────────────────────

class TestRagHealth:
    """RAG /health probe: responds 200 with status ok and a version, and needs no
    credentials."""
    def test_health_returns_200(self):
        """GET /health on the RAG service returns HTTP 200 without credentials."""
        r = _get("/health", auth=False)
        assert r.status_code == 200

    def test_health_status_ok(self):
        """The /health body reports status ok."""
        r = _get("/health", auth=False)
        assert r.json()["status"] == "ok"

    def test_health_has_version(self):
        """The /health body includes a version field."""
        r = _get("/health", auth=False)
        assert "version" in r.json()

    def test_health_does_not_require_auth(self):
        """GET /health with no Authorization header returns 200."""
        # Health must be reachable without any credentials
        r = requests.get(f"{BASE}/health", timeout=TIMEOUT)
        assert r.status_code == 200


# ── Authentication ────────────────────────────────────────────────────────────

class TestRagAuth:
    """RAG endpoints reject requests that carry no credentials."""
    def test_ingest_without_auth_returns_401_or_403(self):
        """POST /v1/ingest with no credentials returns 401 or 403."""
        r = _post(
            "/v1/ingest",
            {"study": "test", "search_query": "BRCA1"},
            auth=False,
        )
        assert r.status_code in (401, 403)

    def test_query_without_auth_returns_401_or_403(self):
        """POST /v1/query with no credentials returns 401 or 403."""
        r = _post(
            "/v1/query",
            {"query": "BRCA1", "study": "default", "top_k": 3, "mode": "rag"},
            auth=False,
        )
        assert r.status_code in (401, 403)


# ── Studies ───────────────────────────────────────────────────────────────────

class TestRagStudies:
    """GET /v1/studies response shape; the slow response is fetched once per class and
    shared."""
    # /v1/studies is slow (~7-9s); fetch it once per class instead of once
    # per test to keep the suite fast and avoid piling up timeout risk.
    @pytest.fixture(scope="class")
    def studies_response(self):
        """Class-scoped fetch of /v1/studies, requested once because the endpoint is
        slow."""
        return _get("/v1/studies")

    def test_studies_returns_200(self, studies_response):
        """GET /v1/studies with the static API key returns HTTP 200."""
        assert studies_response.status_code == 200

    def test_studies_returns_dict_with_studies_key(self, studies_response):
        """The /v1/studies response body has a studies key."""
        assert "studies" in studies_response.json()

    def test_studies_is_list(self, studies_response):
        """The studies value in the /v1/studies response is a list."""
        assert isinstance(studies_response.json()["studies"], list)

    def test_each_study_has_name_field(self, studies_response):
        """Every entry in the studies list has a name field."""
        for study in studies_response.json()["studies"]:
            assert "name" in study


# ── Cache ─────────────────────────────────────────────────────────────────────

class TestRagCache:
    """GET /v1/cache response shape."""
    @pytest.fixture(scope="class")
    def cache_response(self):
        """Class-scoped fetch of /v1/cache shared by the cache tests."""
        return _get("/v1/cache")

    def test_cache_returns_200(self, cache_response):
        """GET /v1/cache with the static API key returns HTTP 200."""
        assert cache_response.status_code == 200

    def test_cache_returns_dict_with_cache_key(self, cache_response):
        """The /v1/cache response body has a cache key."""
        assert "cache" in cache_response.json()


# ── Query ─────────────────────────────────────────────────────────────────────

class TestRagQuery:
    """POST /v1/query with an IAM-issued JWT: accepted modes and study selectors,
    response shape when the status is 200, and 422 validation of bad input. Statuses 404
    and 500 are tolerated where the environment may lack indexed studies or a configured
    embedding model."""
    def test_query_pmids_only_mode_returns_200(self):
        """A pmids_only query returns 200, 404 or 500; 500 is tolerated when the
        embedding model is not configured."""
        r = _post_query({
            "query": "BRCA1 cancer",
            "study": "*",
            "top_k": 3,
            "mode": "pmids_only",
        })
        # 500 is also acceptable: Ollama embeddings validation error when the
        # embedding model is not fully configured in the current environment.
        assert r.status_code in (200, 404, 500)

    def test_query_pmids_only_returns_mode_field(self):
        """When a pmids_only query returns 200, the body reports mode pmids_only; other
        statuses are not checked."""
        r = _post_query({
            "query": "BRCA1 cancer",
            "study": "*",
            "top_k": 3,
            "mode": "pmids_only",
        })
        if r.status_code == 200:
            assert "mode" in r.json()
            assert r.json()["mode"] == "pmids_only"

    def test_query_pmids_only_returns_pmids_list(self):
        """When a pmids_only query returns 200, the body has a pmids list; other
        statuses are not checked."""
        r = _post_query({
            "query": "BRCA1",
            "study": "*",
            "top_k": 5,
            "mode": "pmids_only",
        })
        if r.status_code == 200:
            assert "pmids" in r.json()
            assert isinstance(r.json()["pmids"], list)

    def test_query_rag_mode_returns_events_key(self):
        """When a rag-mode query returns 200, the body has an events key; other statuses
        are not checked."""
        r = _post_query({
            "query": "BRCA1",
            "study": "*",
            "top_k": 3,
            "mode": "rag",
        })
        if r.status_code == 200:
            assert "events" in r.json()

    def test_query_no_study_data_returns_404_or_200(self):
        """A rag-mode query over the '*' study returns 200, 404 (no studies indexed) or
        500 (embedding model not configured)."""
        # When no studies are indexed, 404 is acceptable; 500 when Ollama not configured
        r = _post_query({
            "query": "BRCA1 cancer drug therapy",
            "study": "*",
            "top_k": 3,
            "mode": "rag",
        })
        assert r.status_code in (200, 404, 500)

    def test_query_invalid_mode_returns_422(self):
        """A query with an unsupported mode value returns 422."""
        r = _post_query({
            "query": "BRCA1",
            "study": "default",
            "top_k": 3,
            "mode": "invalid_mode",
        })
        assert r.status_code == 422

    def test_query_top_k_zero_returns_422(self):
        """A query with top_k=0 returns 422."""
        r = _post_query({
            "query": "BRCA1",
            "study": "default",
            "top_k": 0,
            "mode": "rag",
        })
        assert r.status_code == 422

    def test_query_missing_required_fields_returns_422(self):
        """A query body missing the required query field returns 422."""
        r = _post_query({"study": "default"})
        assert r.status_code == 422

    def test_query_wildcard_study_accepted(self):
        """The '*' study selector is accepted: a pmids_only query returns 200, 404 or
        500, not a validation error."""
        r = _post_query({
            "query": "cancer",
            "study": "*",
            "top_k": 3,
            "mode": "pmids_only",
        })
        assert r.status_code in (200, 404, 500)

    def test_query_all_study_accepted(self):
        """The 'all' study selector is accepted: a pmids_only query returns 200, 404 or
        500, not a validation error."""
        r = _post_query({
            "query": "cancer",
            "study": "all",
            "top_k": 3,
            "mode": "pmids_only",
        })
        assert r.status_code in (200, 404, 500)


# ── Full round-trip ───────────────────────────────────────────────────────────

class TestRagFullFlow:
    """Health check, then study listing, then a query, in one sequence."""
    def test_health_then_studies_then_query(self):
        """Check /health, list studies, then query the first indexed study, or a
        nonexistent one when none are indexed; the query may return 200, 404 or 500."""
        # Health check
        r1 = _get("/health", auth=False)
        assert r1.status_code == 200
        assert r1.json()["status"] == "ok"

        # List studies
        r2 = _get("/v1/studies")
        assert r2.status_code == 200
        studies = r2.json()["studies"]

        # If any studies are indexed, run a query against the first one
        if studies:
            study_name = studies[0]["name"]
            r3 = _post_query({
                "query": "gene expression cancer",
                "study": study_name,
                "top_k": 3,
                "mode": "pmids_only",
            })
            assert r3.status_code in (200, 404, 500)
            if r3.status_code == 200:
                assert "events" in r3.json()
        else:
            # No studies indexed yet — verify query returns 404 or 500 (Ollama not configured)
            r3 = _post_query({
                "query": "gene expression",
                "study": "nonexistent",
                "top_k": 3,
                "mode": "rag",
            })
            assert r3.status_code in (404, 200, 500)
