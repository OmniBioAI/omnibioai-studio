"""PR11 (Studio IAM Integration): unit coverage for backend/license_server.py's
IAM-based authorization (replacing the former static admin_key check) and
service-identity self-check. Mocked -- no live omnibioai-auth/MySQL/Redis
required, unlike tests/integration/ (which needs the full docker-compose
stack and is not exercised by this file).

pymysql.connect is patched before importing license_server, since that
module calls init_db() (a real MySQL connection attempt) at import time.

Developer:
    Manish Kumar <manish@omnibioai.org>
"""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

with patch("pymysql.connect", return_value=MagicMock()):
    import license_server  # noqa: E402 -- must follow the pymysql patch


@pytest.fixture
def client():
    """FastAPI TestClient bound to license_server.app; pymysql was already patched when
    the module was imported."""
    return TestClient(license_server.app)


def _mock_response(status_code=200, json_data=None):
    """Builds a MagicMock HTTP response with the given status_code and a json()
    returning json_data, or an empty dict when none is given."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    return resp


# ── _validate_token ──────────────────────────────────────────────────────────


def test_validate_token_returns_user_dict_on_valid_token(monkeypatch):
    """_validate_token returns the user dict (email and permissions included) when the
    mocked auth service reports the token valid."""
    monkeypatch.setattr(
        license_server.requests, "post",
        lambda *a, **kw: _mock_response(200, {
            "valid": True, "user_id": 1, "email": "admin@omnibioai.test",
            "roles": ["admin"], "permissions": ["manage_licenses"],
        }),
    )
    user = license_server._validate_token("sometoken")
    assert user["email"] == "admin@omnibioai.test"
    assert "manage_licenses" in user["permissions"]


def test_validate_token_returns_none_on_invalid_token(monkeypatch):
    """_validate_token returns None when the mocked auth service reports valid=False."""
    monkeypatch.setattr(
        license_server.requests, "post", lambda *a, **kw: _mock_response(200, {"valid": False}),
    )
    assert license_server._validate_token("bad") is None


def test_validate_token_returns_none_on_network_error(monkeypatch):
    """_validate_token returns None instead of raising when the auth service is
    unreachable."""
    def _boom(*a, **kw):
        raise ConnectionError("auth service unreachable")
    monkeypatch.setattr(license_server.requests, "post", _boom)
    assert license_server._validate_token("sometoken") is None


# ── _require_permission ──────────────────────────────────────────────────────


def test_require_permission_missing_header_raises_401():
    """_require_permission raises HTTP 401 when no Authorization header is supplied."""
    with pytest.raises(license_server.HTTPException) as exc_info:
        license_server._require_permission(None, "manage_licenses", action="test")
    assert exc_info.value.status_code == 401


def test_require_permission_non_bearer_header_raises_401():
    """_require_permission raises HTTP 401 for a non-Bearer Authorization scheme
    (Basic)."""
    with pytest.raises(license_server.HTTPException) as exc_info:
        license_server._require_permission("Basic abc123", "manage_licenses", action="test")
    assert exc_info.value.status_code == 401


def test_require_permission_invalid_token_raises_401(monkeypatch):
    """_require_permission raises HTTP 401 when token validation returns None."""
    monkeypatch.setattr(license_server, "_validate_token", lambda token: None)
    with pytest.raises(license_server.HTTPException) as exc_info:
        license_server._require_permission("Bearer badtoken", "manage_licenses", action="test")
    assert exc_info.value.status_code == 401


def test_require_permission_missing_permission_raises_403(monkeypatch):
    """_require_permission raises HTTP 403 when the validated user lacks the required
    manage_licenses permission."""
    monkeypatch.setattr(
        license_server, "_validate_token",
        lambda token: {"user_id": 2, "email": "u@omnibioai.test", "permissions": ["manage_config"]},
    )
    with pytest.raises(license_server.HTTPException) as exc_info:
        license_server._require_permission("Bearer sometoken", "manage_licenses", action="test")
    assert exc_info.value.status_code == 403


def test_require_permission_grants_and_returns_user(monkeypatch):
    """_require_permission returns the user dict when the validated user holds
    manage_licenses."""
    monkeypatch.setattr(
        license_server, "_validate_token",
        lambda token: {"user_id": 1, "email": "admin@omnibioai.test", "permissions": ["manage_licenses"]},
    )
    user = license_server._require_permission("Bearer sometoken", "manage_licenses", action="test")
    assert user["user_id"] == 1


# ── Endpoint-level: /api/license/generate and /api/license/list ────────────


def test_generate_without_token_returns_401(client):
    """POST /api/license/generate without a token returns 401."""
    resp = client.post("/api/license/generate", json={"email": "x@example.com"})
    assert resp.status_code == 401


def test_generate_without_manage_licenses_permission_returns_403(client, monkeypatch):
    """POST /api/license/generate with a valid token whose user has no permissions
    returns 403."""
    monkeypatch.setattr(
        license_server, "_validate_token",
        lambda token: {"user_id": 3, "email": "nope@omnibioai.test", "permissions": []},
    )
    resp = client.post(
        "/api/license/generate", json={"email": "x@example.com"},
        headers={"Authorization": "Bearer sometoken"},
    )
    assert resp.status_code == 403


def test_generate_with_manage_licenses_permission_succeeds(client, monkeypatch):
    """POST /api/license/generate with the manage_licenses permission returns 200 with
    the requested email and a key; the database connection is mocked."""
    monkeypatch.setattr(
        license_server, "_validate_token",
        lambda token: {"user_id": 1, "email": "admin@omnibioai.test", "permissions": ["manage_licenses"]},
    )
    mock_cursor = MagicMock()
    mock_conn = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    monkeypatch.setattr(license_server, "get_conn", lambda: mock_conn)

    resp = client.post(
        "/api/license/generate", json={"email": "x@example.com", "days": 30, "tier": "beta"},
        headers={"Authorization": "Bearer sometoken"},
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "x@example.com"
    assert "key" in resp.json()


def test_generate_request_body_no_longer_accepts_admin_key_field():
    """The static admin_key request-body field is gone -- confirms the
    static mechanism was actually removed, not just bypassed."""
    assert "admin_key" not in license_server.GenerateRequest.model_fields


def test_list_licenses_without_token_returns_401(client):
    """GET /api/license/list without a token returns 401."""
    resp = client.get("/api/license/list")
    assert resp.status_code == 401


def test_list_licenses_no_longer_accepts_admin_key_query_param(client, monkeypatch):
    """A caller supplying the old ?admin_key=... query param must not
    bypass the new IAM check -- it's simply ignored now."""
    monkeypatch.setattr(license_server, "_validate_token", lambda token: None)
    resp = client.get("/api/license/list", params={"admin_key": "admin-secret"})
    assert resp.status_code == 401


def test_list_licenses_with_manage_licenses_permission_succeeds(client, monkeypatch):
    """GET /api/license/list with the manage_licenses permission returns 200 and an
    empty list when the mocked database has no rows."""
    monkeypatch.setattr(
        license_server, "_validate_token",
        lambda token: {"user_id": 1, "email": "admin@omnibioai.test", "permissions": ["manage_licenses"]},
    )
    mock_cursor = MagicMock()
    mock_cursor.fetchall.return_value = []
    mock_conn = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    monkeypatch.setattr(license_server, "get_conn", lambda: mock_conn)

    resp = client.get("/api/license/list", headers={"Authorization": "Bearer sometoken"})
    assert resp.status_code == 200
    assert resp.json() == []


# ── /api/license/validate and /pull-token stay unauthenticated ─────────────
# (unchanged by this PR -- these gate on the license key itself, not IAM)


def test_validate_endpoint_unaffected_by_iam_changes(client, monkeypatch):
    """POST /api/license/validate stays unauthenticated: with no Authorization header it
    returns valid=True for a mocked valid license."""
    monkeypatch.setattr(
        license_server, "_load_valid_license",
        lambda key: {
            "key": key, "email": "user@example.com", "tier": "beta",
            "expiry": "2099-01-01", "machine_id": "m1", "days_remaining": 10,
        },
    )
    resp = client.post("/api/license/validate", json={"key": "OMNI-TEST", "machine_id": "m1"})
    assert resp.status_code == 200
    assert resp.json()["valid"] is True


# ── Service identity self-check ─────────────────────────────────────────────


def test_verify_service_identity_skips_when_not_configured(monkeypatch):
    """verify_service_identity returns False without contacting the auth service when no
    service client id or secret is configured."""
    monkeypatch.setattr(license_server, "STUDIO_SERVICE_CLIENT_ID", "")
    monkeypatch.setattr(license_server, "STUDIO_SERVICE_CLIENT_SECRET", "")
    assert license_server.verify_service_identity() is False


def test_verify_service_identity_succeeds_end_to_end(monkeypatch):
    """verify_service_identity returns True after a client_credentials token request to
    /oauth/token and a bearer-authenticated /service/me call, both mocked."""
    monkeypatch.setattr(license_server, "STUDIO_SERVICE_CLIENT_ID", "omni_client_test")
    monkeypatch.setattr(license_server, "STUDIO_SERVICE_CLIENT_SECRET", "shh")

    def _post(url, **kwargs):
        assert url.endswith("/oauth/token")
        assert kwargs["data"]["grant_type"] == "client_credentials"
        return _mock_response(200, {"access_token": "svc-token", "token_type": "bearer", "expires_in": 900})

    def _get(url, **kwargs):
        assert url.endswith("/service/me")
        assert kwargs["headers"]["Authorization"] == "Bearer svc-token"
        return _mock_response(200, {
            "client_id": "omni_client_test", "permissions": [], "active": True, "organization_id": 1,
        })

    monkeypatch.setattr(license_server.requests, "post", _post)
    monkeypatch.setattr(license_server.requests, "get", _get)

    assert license_server.verify_service_identity() is True


def test_verify_service_identity_fails_gracefully_on_bad_token_response(monkeypatch):
    """verify_service_identity returns False when the mocked token endpoint responds
    401."""
    monkeypatch.setattr(license_server, "STUDIO_SERVICE_CLIENT_ID", "omni_client_test")
    monkeypatch.setattr(license_server, "STUDIO_SERVICE_CLIENT_SECRET", "wrong")
    monkeypatch.setattr(license_server.requests, "post", lambda *a, **kw: _mock_response(401, {}))

    assert license_server.verify_service_identity() is False


def test_verify_service_identity_never_raises_on_network_error(monkeypatch):
    """verify_service_identity returns False rather than raising when the auth service
    is unreachable."""
    monkeypatch.setattr(license_server, "STUDIO_SERVICE_CLIENT_ID", "omni_client_test")
    monkeypatch.setattr(license_server, "STUDIO_SERVICE_CLIENT_SECRET", "shh")

    def _boom(*a, **kw):
        raise ConnectionError("auth service unreachable")
    monkeypatch.setattr(license_server.requests, "post", _boom)

    assert license_server.verify_service_identity() is False


def test_startup_hook_never_crashes_app_when_unconfigured(monkeypatch):
    """The FastAPI app must start successfully even with no service
    identity configured -- verified by round-tripping TestClient's own
    startup lifecycle, not just calling the function directly."""
    monkeypatch.setattr(license_server, "STUDIO_SERVICE_CLIENT_ID", "")
    with TestClient(license_server.app) as c:
        resp = c.get("/health")
        assert resp.status_code == 200
