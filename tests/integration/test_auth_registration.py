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
    def test_register_returns_200(self):
        r = _post("/auth/register", {"email": _unique_email(), "password": "S3curePass!"})
        assert r.status_code == 200

    def test_register_returns_message(self):
        r = _post("/auth/register", {"email": _unique_email(), "password": "S3curePass!"})
        assert "message" in r.json()

    def test_registered_user_can_log_in_immediately(self):
        email = _unique_email()
        password = "S3curePass!"

        reg = _post("/auth/register", {"email": email, "password": password})
        assert reg.status_code == 200

        login = _post("/auth/login", {"email": email, "password": password})
        assert login.status_code == 200
        assert "access_token" in login.json()
        assert "refresh_token" in login.json()

    def test_registered_user_wrong_password_rejected(self):
        email = _unique_email()
        _post("/auth/register", {"email": email, "password": "S3curePass!"})

        login = _post("/auth/login", {"email": email, "password": "wrong-password"})
        assert login.status_code == 401


class TestRegisterDuplicate:
    def test_duplicate_email_returns_400(self):
        email = _unique_email()
        first = _post("/auth/register", {"email": email, "password": "S3curePass!"})
        assert first.status_code == 200

        second = _post("/auth/register", {"email": email, "password": "AnotherPass!23"})
        assert second.status_code == 400


class TestRegisterValidation:
    def test_missing_fields_returns_422(self):
        r = _post("/auth/register", {})
        assert r.status_code == 422

    def test_missing_password_returns_422(self):
        r = _post("/auth/register", {"email": _unique_email()})
        assert r.status_code == 422
