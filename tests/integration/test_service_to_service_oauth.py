"""
test_service_to_service_oauth.py — tests the OAuth2 client-credentials
grant (service-to-service auth) against the live auth service (port 8001).

Auth service endpoints (FastAPI):
  POST /orgs/{org_id}/oauth-clients  — register a client, returns
                                        client_id + client_secret (once)
  POST /oauth/token                  — client_credentials grant, form-encoded

Known service behaviour
-----------------------
A client_credentials token has no sub/email claim at all -- it identifies a
service, not a user (app/rbac.py's require_service_scope docstring). Nothing
in the ecosystem outside omnibioai-auth's own unit tests currently calls
/oauth/token or depends on require_service_scope in a live route (verified
by grepping every omnibioai-* repo), so there is no real protected endpoint
to drive with a minted service token yet. These tests therefore cover the
full mint contract directly -- client registration, successful token issue,
and every documented rejection path (RFC 6749 SS5.2/SS2.3.1) -- and decode
the returned JWT WITHOUT verifying its signature (no shared secret is
exposed to a black-box test) purely to assert the claims a real consumer
would need are actually present.
"""

import uuid

import jwt as pyjwt
import requests

from conftest import AUTH_DIRECT_URL, TIMEOUT

BASE = AUTH_DIRECT_URL


def _register_and_login() -> dict:
    email = f"itest-svc2svc-{uuid.uuid4().hex}@example.com"
    password = "S3curePass!"

    reg = requests.post(f"{BASE}/auth/register", json={"email": email, "password": password}, timeout=TIMEOUT)
    assert reg.status_code == 200, f"setup: register failed: {reg.text}"

    login = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=TIMEOUT)
    assert login.status_code == 200, f"setup: login failed: {login.text}"
    return login.json()


def _create_org(access_token: str) -> dict:
    slug = f"itest-org-{uuid.uuid4().hex[:12]}"
    r = requests.post(
        f"{BASE}/orgs",
        json={"name": slug, "slug": slug},
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 201, f"setup: create_org failed: {r.text}"
    return r.json()


def _register_oauth_client(access_token: str, org_id: int, scopes: list) -> dict:
    r = requests.post(
        f"{BASE}/orgs/{org_id}/oauth-clients",
        json={"name": "itest-service-client", "scopes": scopes},
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 201, f"setup: create_oauth_client failed: {r.text}"
    return r.json()


def _setup_client(scopes: list) -> dict:
    """Register a fresh org + admin user + OAuth client with the given
    scopes. Returns the OAuthClientCreated body (id, client_id,
    client_secret, scopes)."""
    tokens = _register_and_login()
    org = _create_org(tokens["access_token"])
    return _register_oauth_client(tokens["access_token"], org["id"], scopes)


def _mint_token(client_id: str, client_secret: str, scope: str | None = None) -> requests.Response:
    data = {"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret}
    if scope is not None:
        data["scope"] = scope
    return requests.post(f"{BASE}/oauth/token", data=data, timeout=TIMEOUT)


class TestClientCredentialsHappyPath:
    def test_mint_token_returns_200(self):
        client = _setup_client(["read:reports", "write:reports"])
        r = _mint_token(client["client_id"], client["client_secret"])
        assert r.status_code == 200

    def test_mint_token_returns_access_token_and_bearer_type(self):
        client = _setup_client(["read:reports"])
        r = _mint_token(client["client_id"], client["client_secret"])
        body = r.json()
        assert body["access_token"]
        assert body["token_type"] == "bearer"
        assert body["expires_in"] > 0

    def test_token_defaults_to_all_granted_scopes_when_scope_omitted(self):
        client = _setup_client(["read:reports", "write:reports"])
        r = _mint_token(client["client_id"], client["client_secret"])
        assert set(r.json()["scope"].split()) == {"read:reports", "write:reports"}

    def test_token_can_request_a_subset_of_granted_scopes(self):
        client = _setup_client(["read:reports", "write:reports"])
        r = _mint_token(client["client_id"], client["client_secret"], scope="read:reports")
        assert r.status_code == 200
        assert r.json()["scope"] == "read:reports"

    def test_minted_token_claims_identify_a_service_not_a_user(self):
        client = _setup_client(["read:reports"])
        r = _mint_token(client["client_id"], client["client_secret"])
        payload = pyjwt.decode(r.json()["access_token"], options={"verify_signature": False})

        assert payload["auth_method"] == "client_credentials"
        assert payload["client_id"] == client["client_id"]
        assert payload["scopes"] == ["read:reports"]
        assert "sub" not in payload
        assert "email" not in payload


class TestClientCredentialsRejections:
    def test_wrong_client_secret_returns_401(self):
        client = _setup_client(["read:reports"])
        r = _mint_token(client["client_id"], "not-the-real-secret")
        assert r.status_code == 401

    def test_unknown_client_id_returns_401(self):
        r = _mint_token(f"nonexistent-{uuid.uuid4().hex}", "whatever")
        assert r.status_code == 401

    def test_requesting_ungranted_scope_returns_400(self):
        client = _setup_client(["read:reports"])
        r = _mint_token(client["client_id"], client["client_secret"], scope="delete:everything")
        assert r.status_code == 400

    def test_unsupported_grant_type_returns_400(self):
        client = _setup_client(["read:reports"])
        r = requests.post(
            f"{BASE}/oauth/token",
            data={
                "grant_type": "password",
                "client_id": client["client_id"],
                "client_secret": client["client_secret"],
            },
            timeout=TIMEOUT,
        )
        assert r.status_code == 400

    def test_missing_credentials_returns_400(self):
        r = requests.post(f"{BASE}/oauth/token", data={"grant_type": "client_credentials"}, timeout=TIMEOUT)
        assert r.status_code == 400


class TestClientCredentialsViaHttpBasic:
    def test_basic_auth_credentials_are_accepted(self):
        client = _setup_client(["read:reports"])
        r = requests.post(
            f"{BASE}/oauth/token",
            data={"grant_type": "client_credentials"},
            auth=(client["client_id"], client["client_secret"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        assert r.json()["access_token"]
