"""
test_auth_registration.py — tests POST /auth/register against the live
auth service (port 8001).

Auth service endpoint (FastAPI):
  POST /auth/register  — create user, body {"email": ..., "password": ...}
                          (same LoginRequest schema /auth/login uses)

Known service behaviour
-----------------------
register() sets status="active" immediately (app/api/routes_auth.py) --
there is no email-verification step, so a freshly registered account can
log in right away. Each test generates a unique email via uuid4 so repeat
runs never collide with a previous run's leftover user row.

Developer:
    Manish Kumar <manish@omnibioai.org>
"""

import uuid

import requests

from conftest import AUTH_DIRECT_URL, TIMEOUT

BASE = AUTH_DIRECT_URL


def _unique_email() -> str:
    return f"itest-register-{uuid.uuid4().hex}@example.com"


def _post(path: str, body: dict) -> requests.Response:
    return requests.post(f"{BASE}{path}", json=body, timeout=TIMEOUT)


class TestRegisterNewUser:
    """Successful POST /auth/register calls with unique emails, and the resulting
    account's login behavior."""
    def test_register_returns_200(self):
        """Registering a new unique email with a valid password returns HTTP 200."""
        r = _post("/auth/register", {"email": _unique_email(), "password": "S3curePass!1"})
        assert r.status_code == 200

    def test_register_returns_message(self):
        """The register response body includes a message field."""
        r = _post("/auth/register", {"email": _unique_email(), "password": "S3curePass!1"})
        assert "message" in r.json()

    def test_registered_user_can_log_in_immediately(self):
        """A freshly registered user can log in at once and receives both an access and
        a refresh token."""
        email = _unique_email()
        password = "S3curePass!1"

        reg = _post("/auth/register", {"email": email, "password": password})
        assert reg.status_code == 200

        login = _post("/auth/login", {"email": email, "password": password})
        assert login.status_code == 200
        assert "access_token" in login.json()
        assert "refresh_token" in login.json()

    def test_registered_user_wrong_password_rejected(self):
        """A registered user logging in with a wrong password gets 401."""
        email = _unique_email()
        _post("/auth/register", {"email": email, "password": "S3curePass!1"})

        login = _post("/auth/login", {"email": email, "password": "wrong-password"})
        assert login.status_code == 401


class TestRegisterDuplicate:
    """Registering an email that already exists is rejected."""
    def test_duplicate_email_returns_400(self):
        """Registering the same email a second time returns 400."""
        email = _unique_email()
        first = _post("/auth/register", {"email": email, "password": "S3curePass!1"})
        assert first.status_code == 200

        second = _post("/auth/register", {"email": email, "password": "AnotherPass!23"})
        assert second.status_code == 400


class TestRegisterValidation:
    """Request-schema validation on POST /auth/register."""
    def test_missing_fields_returns_422(self):
        """An empty register body returns 422."""
        r = _post("/auth/register", {})
        assert r.status_code == 422

    def test_missing_password_returns_422(self):
        """A register body with an email but no password returns 422."""
        r = _post("/auth/register", {"email": _unique_email()})
        assert r.status_code == 422
