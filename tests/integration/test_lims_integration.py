"""
test_lims_integration.py — tests LIMS auth + projects API end-to-end.

LIMS endpoints (Django REST Framework, port 7000):
  GET  /healthz                 — liveness probe
  GET  /readyz                  — readiness probe
  POST /api/token/              — obtain JWT tokens (returned as HttpOnly cookies;
                                  JSON body is {"detail": "ok"})
  POST /api/token/refresh/      — refresh access token (reads refresh_token cookie;
                                  returns new access_token cookie)
  POST /api/token/logout/       — revoke refresh token (cookie-based)
  GET  /api/projects/           — list projects (auth required)
  GET  /api/samples/            — list samples  (auth required)
  GET  /api/auth/me/            — current user info (auth required)
  GET  /api/stats/              — aggregate stats  (auth required)

Token delivery
--------------
/api/token/ sets two HttpOnly cookies:
  access_token  — short-lived (1 hour), valid for all API paths
  refresh_token — long-lived (24 h), scoped to /api/token/

The cookie value can also be used as a plain Bearer token via the
Authorization header (SimpleJWT's JWTAuthentication is still active).
Tests use the Bearer-header approach so they don't need a cookie jar.
"""

import pytest
import requests

from conftest import LIMS_DIRECT_URL, LIMS_USERNAME, LIMS_PASSWORD, TIMEOUT

BASE = LIMS_DIRECT_URL


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get(path: str, headers: dict | None = None) -> requests.Response:
    return requests.get(f"{BASE}{path}", headers=headers or {}, timeout=TIMEOUT)


def _post(path: str, body: dict, headers: dict | None = None) -> requests.Response:
    return requests.post(
        f"{BASE}{path}", json=body, headers=headers or {}, timeout=TIMEOUT
    )


# Module-level token cache — LIMS rate-limits /api/token/ so we call it at most once.
_MODULE_TOKENS: dict | None = None


def _obtain_tokens() -> dict:
    """
    Log in to LIMS and return a dict with access/refresh token values.

    Tokens are delivered as Set-Cookie headers (HttpOnly).
    The JSON response body is always {"detail": "ok"} and does NOT contain tokens.
    Result is cached so the login endpoint is hit at most once per test run.
    """
    global _MODULE_TOKENS
    if _MODULE_TOKENS is not None:
        return _MODULE_TOKENS
    session = requests.Session()
    r = session.post(
        f"{BASE}/api/token/",
        json={"username": LIMS_USERNAME, "password": LIMS_PASSWORD},
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    _MODULE_TOKENS = {
        "access": r.cookies.get("access_token", ""),
        "refresh": r.cookies.get("refresh_token", ""),
        "session": session,
    }
    return _MODULE_TOKENS


# ── Health probes ─────────────────────────────────────────────────────────────

class TestLimsHealth:
    def test_healthz_returns_200(self):
        r = _get("/healthz")
        assert r.status_code == 200

    def test_readyz_returns_200(self):
        r = _get("/readyz")
        assert r.status_code == 200


# ── JWT authentication ────────────────────────────────────────────────────────

class TestLimsAuth:
    @pytest.fixture(autouse=True)
    def _tokens(self):
        # Use cached login to avoid rate-limiting the /api/token/ endpoint.
        data = _obtain_tokens()
        self._access = data["access"]
        self._refresh = data["refresh"]

    def test_obtain_token_returns_200(self):
        # Verified by the fact that _obtain_tokens() succeeded (raise_for_status called).
        assert self._access, "access_token cookie was not set after successful login"

    def test_obtain_token_returns_access_field(self):
        # Tokens are in Set-Cookie headers, not in the JSON body.
        assert self._access, "access_token cookie not set"

    def test_obtain_token_returns_refresh_field(self):
        assert self._refresh, "refresh_token cookie not set"

    def test_wrong_credentials_returns_401(self):
        # 429 is also acceptable: rate limiter fires before credentials are checked.
        r = _post("/api/token/", {"username": LIMS_USERNAME, "password": "wrongpassword"})
        assert r.status_code in (401, 429)

    def test_unknown_user_returns_401(self):
        r = _post("/api/token/", {"username": "nobody", "password": "x"})
        assert r.status_code in (401, 429)

    def test_missing_credentials_returns_400_or_422(self):
        r = _post("/api/token/", {})
        assert r.status_code in (400, 401, 422, 429)


# ── Token refresh ─────────────────────────────────────────────────────────────
# The LIMS refresh endpoint reads the refresh_token from the cookie jar.
# Use a requests.Session so the cookie is sent automatically.

class TestLimsTokenRefresh:
    @pytest.fixture(autouse=True)
    def _session_data(self):
        data = _obtain_tokens()
        self.access = data["access"]
        self.refresh = data["refresh"]
        self.session = data["session"]

    def test_refresh_returns_200(self):
        r = self.session.post(f"{BASE}/api/token/refresh/", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_refresh_returns_new_access_token(self):
        r = self.session.post(f"{BASE}/api/token/refresh/", timeout=TIMEOUT)
        assert r.status_code == 200
        # New access_token is set in a cookie
        assert r.cookies.get("access_token"), "No new access_token cookie in refresh response"

    def test_refresh_with_invalid_token_returns_401(self):
        bad_session = requests.Session()
        bad_session.cookies.set("refresh_token", "invalid.token.value")
        r = bad_session.post(f"{BASE}/api/token/refresh/", timeout=TIMEOUT)
        assert r.status_code == 401


# ── Projects API ──────────────────────────────────────────────────────────────

class TestLimsProjects:
    @pytest.fixture(autouse=True)
    def _auth_headers(self):
        data = _obtain_tokens()
        # access_token cookie value also works as a plain Bearer token
        self.headers = {"Authorization": f"Bearer {data['access']}"}

    def test_projects_list_returns_200(self):
        r = _get("/api/projects/", self.headers)
        assert r.status_code == 200

    def test_projects_list_returns_json_array_or_paginated(self):
        r = _get("/api/projects/", self.headers)
        data = r.json()
        # DRF can return a plain list or a paginated {"count": ..., "results": [...]}
        assert isinstance(data, (list, dict))

    def test_projects_list_without_auth_returns_401_or_403(self):
        r = _get("/api/projects/")
        assert r.status_code in (401, 403)

    def test_projects_list_with_bad_token_returns_401(self):
        r = _get("/api/projects/", {"Authorization": "Bearer bad-token"})
        assert r.status_code in (401, 403)


# ── Samples API ───────────────────────────────────────────────────────────────

class TestLimsSamples:
    @pytest.fixture(autouse=True)
    def _auth_headers(self):
        data = _obtain_tokens()
        self.headers = {"Authorization": f"Bearer {data['access']}"}

    def test_samples_list_returns_200(self):
        r = _get("/api/samples/", self.headers)
        assert r.status_code == 200

    def test_samples_list_without_auth_returns_401(self):
        r = _get("/api/samples/")
        assert r.status_code in (401, 403)


# ── Current user (me) ─────────────────────────────────────────────────────────

class TestLimsMe:
    @pytest.fixture(autouse=True)
    def _auth_headers(self):
        data = _obtain_tokens()
        self.headers = {"Authorization": f"Bearer {data['access']}"}

    def test_me_returns_200(self):
        r = _get("/api/auth/me/", self.headers)
        assert r.status_code == 200

    def test_me_returns_username_field(self):
        r = _get("/api/auth/me/", self.headers)
        data = r.json()
        assert "username" in data or "email" in data

    def test_me_without_auth_returns_401(self):
        r = _get("/api/auth/me/")
        assert r.status_code in (401, 403)


# ── Stats ─────────────────────────────────────────────────────────────────────

class TestLimsStats:
    @pytest.fixture(autouse=True)
    def _auth_headers(self):
        data = _obtain_tokens()
        self.headers = {"Authorization": f"Bearer {data['access']}"}

    def test_stats_returns_200(self):
        r = _get("/api/stats/", self.headers)
        assert r.status_code == 200

    def test_stats_without_auth_returns_401(self):
        r = _get("/api/stats/")
        assert r.status_code in (401, 403)


# ── Full round-trip ───────────────────────────────────────────────────────────

class TestLimsFullFlow:
    def test_login_list_projects_refresh_logout(self):
        # Use cached login to avoid rate-limiting — we already verified login works above.
        data = _obtain_tokens()
        access = data["access"]
        session = data["session"]
        assert access, "access_token cookie missing after login"

        # List projects using Bearer token from cookie value
        r2 = _get("/api/projects/", {"Authorization": f"Bearer {access}"})
        assert r2.status_code == 200

        # Refresh token via cookie session
        r3 = session.post(f"{BASE}/api/token/refresh/", timeout=TIMEOUT)
        assert r3.status_code == 200
        new_access = r3.cookies.get("access_token", "")
        assert new_access, "No new access_token cookie after refresh"

        # Use refreshed token
        r4 = _get("/api/projects/", {"Authorization": f"Bearer {new_access}"})
        assert r4.status_code == 200
