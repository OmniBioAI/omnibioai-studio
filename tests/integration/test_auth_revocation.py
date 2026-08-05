"""
test_auth_revocation.py — proves that logout revokes the ACCESS token, not
just the refresh token, against the live auth service (port 8001).

Background
----------
test_auth_integration.py's TestAuthLogout already proves that /auth/refresh
rejects a refresh token after logout. It does not prove that a still
unexpired *access* token stops working -- that enforcement lives in
app/rbac.py's get_current_user -> assert_token_usable (app/core/
token_revocation.py), which checks a Redis blacklist keyed by the access
token's jti. routes_auth.py's logout() only blacklists the access token
when the client actually sends one in the request body (LogoutRequest.
access_token is optional) -- these tests always send it, exercising the
real revocation path rather than the no-op case.

Each test registers its own throwaway user (unique email per run) instead
of reusing conftest's session-scoped admin tokens, since this test
deliberately revokes its own token and must not interfere with other test
files sharing that session-scoped login.
"""

import uuid

import requests

from conftest import AUTH_DIRECT_URL, TIMEOUT

BASE = AUTH_DIRECT_URL


def _register_and_login() -> dict:
    email = f"itest-revoke-{uuid.uuid4().hex}@example.com"
    password = "S3curePass!"

    reg = requests.post(f"{BASE}/auth/register", json={"email": email, "password": password}, timeout=TIMEOUT)
    assert reg.status_code == 200, f"setup: register failed: {reg.text}"

    login = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=TIMEOUT)
    assert login.status_code == 200, f"setup: login failed: {login.text}"
    return login.json()


def _list_orgs(access_token: str) -> requests.Response:
    return requests.get(
        f"{BASE}/orgs",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=TIMEOUT,
    )


class TestAccessTokenRevokedAfterLogout:
    def test_access_token_works_before_logout(self):
        tokens = _register_and_login()
        r = _list_orgs(tokens["access_token"])
        assert r.status_code == 200

    def test_access_token_rejected_after_logout(self):
        tokens = _register_and_login()

        # Sanity: token is live before logout.
        assert _list_orgs(tokens["access_token"]).status_code == 200

        logout = requests.post(
            f"{BASE}/auth/logout",
            json={"refresh_token": tokens["refresh_token"], "access_token": tokens["access_token"]},
            timeout=TIMEOUT,
        )
        assert logout.status_code == 200

        r = _list_orgs(tokens["access_token"])
        assert r.status_code == 401

    def test_refresh_token_also_rejected_after_logout(self):
        tokens = _register_and_login()

        requests.post(
            f"{BASE}/auth/logout",
            json={"refresh_token": tokens["refresh_token"], "access_token": tokens["access_token"]},
            timeout=TIMEOUT,
        )

        r = requests.post(
            f"{BASE}/auth/refresh",
            json={"refresh_token": tokens["refresh_token"]},
            timeout=TIMEOUT,
        )
        assert r.status_code == 401

    def test_logout_without_access_token_does_not_revoke_it(self):
        """LogoutRequest.access_token is optional -- if a client omits it,
        _blacklist_access_token() is never called, so that access token
        must remain valid until it naturally expires. This documents that
        behaviour rather than treating it as a bug: revocation-on-logout is
        opt-in per the request body, not automatic for every outstanding
        access token belonging to that session."""
        tokens = _register_and_login()

        logout = requests.post(
            f"{BASE}/auth/logout",
            json={"refresh_token": tokens["refresh_token"]},  # no access_token
            timeout=TIMEOUT,
        )
        assert logout.status_code == 200

        r = _list_orgs(tokens["access_token"])
        assert r.status_code == 200
