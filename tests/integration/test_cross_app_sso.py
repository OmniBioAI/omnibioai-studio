"""
test_cross_app_sso.py — proves an omnibioai-auth-issued access token works
directly against LIMS (port 7000) without ever calling LIMS's own login
endpoint. This is the actual cross-application SSO contract: one login
against the central auth service, reused as-is against a different app.

Background
----------
conftest.py's existing `lims_session` fixture authenticates against LIMS's
OWN /api/token/ endpoint -- that proves LIMS's local login works, but never
proves SSO, since it never uses a central auth token at all.

LIMS's DRF API accepts a central token via OmniAuthJWTAuthentication
(omnibioai-lims/core/authentication.py), which decodes the Authorization
header with the SAME shared HS256 secret omnibioai-auth signs with
(JWT_SECRET / AUTH_SECRET_KEY, wired identically into both services'
environments) and get_or_create()s a matching Django user by email.

GET /api/auth/me/ (core/api/auth_views.py::me_view, IsAuthenticated) is a
clean target: it returns the resolved user's email with no side effects,
unlike the sample/library CRUD endpoints.

`X-Forwarded-Proto: https` on every request here
--------------------------------------------------
LIMS's container-internal nginx (omnibioai-lims' nginx.conf) only ever
expects to be reached via cloudflared or the ecosystem's nginx-router --
both of which set X-Forwarded-Proto themselves and are trusted to do so
(the config's own comment: "Preserve whatever XFP they set; only fall back
to $scheme ... if the header is absent"). Django's SECURE_PROXY_SSL_HEADER
then treats a request with no such header (or "http") as insecure and
redirects to https, which is unreachable directly from the host in this
dev environment. Setting this header ourselves reproduces exactly what the
real router already does for every request LIMS ever actually receives --
it is not bypassing a security check, it's supplying the one piece of
context a direct-to-container test client has to fake since it isn't
actually the trusted router.

Each test registers its own throwaway user against the central auth
service (unique email per run) rather than relying on conftest's
session-scoped admin login, since that fixture's fixed admin/admin
credentials are shared (and sometimes already consumed) across every other
test file in this suite.
"""

import uuid

import requests

from conftest import AUTH_DIRECT_URL, LIMS_DIRECT_URL, TIMEOUT

LIMS_ME_URL = f"{LIMS_DIRECT_URL}/api/auth/me/"
_TRUSTED_PROXY_HEADERS = {"X-Forwarded-Proto": "https"}


def _register_and_login() -> dict:
    email = f"itest-crosssso-{uuid.uuid4().hex}@example.com"
    password = "S3curePass!"

    reg = requests.post(
        f"{AUTH_DIRECT_URL}/auth/register", json={"email": email, "password": password}, timeout=TIMEOUT
    )
    assert reg.status_code == 200, f"setup: register failed: {reg.text}"

    login = requests.post(
        f"{AUTH_DIRECT_URL}/auth/login", json={"email": email, "password": password}, timeout=TIMEOUT
    )
    assert login.status_code == 200, f"setup: login failed: {login.text}"

    tokens = login.json()
    tokens["email"] = email
    return tokens


class TestCentralAuthTokenWorksAgainstLims:
    def test_central_access_token_authenticates_to_lims(self):
        tokens = _register_and_login()
        r = requests.get(
            LIMS_ME_URL,
            headers={**_TRUSTED_PROXY_HEADERS, "Authorization": f"Bearer {tokens['access_token']}"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200

    def test_lims_resolves_the_same_email_from_the_central_token(self):
        tokens = _register_and_login()
        r = requests.get(
            LIMS_ME_URL,
            headers={**_TRUSTED_PROXY_HEADERS, "Authorization": f"Bearer {tokens['access_token']}"},
            timeout=TIMEOUT,
        )
        assert r.json()["email"] == tokens["email"]

    def test_no_separate_lims_login_was_needed(self):
        """_register_and_login() only ever calls the central auth service's
        own /auth/register + /auth/login -- LIMS's own /api/token/ is never
        touched in this test file at all. A 200 above is only possible
        because LIMS accepted that token directly."""
        tokens = _register_and_login()
        r = requests.get(
            LIMS_ME_URL,
            headers={**_TRUSTED_PROXY_HEADERS, "Authorization": f"Bearer {tokens['access_token']}"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200


class TestLimsRejectsWithoutAToken:
    def test_me_endpoint_requires_authentication(self):
        r = requests.get(LIMS_ME_URL, headers=_TRUSTED_PROXY_HEADERS, timeout=TIMEOUT)
        assert r.status_code == 401

    def test_me_endpoint_rejects_garbage_bearer_token(self):
        r = requests.get(
            LIMS_ME_URL,
            headers={**_TRUSTED_PROXY_HEADERS, "Authorization": "Bearer not.a.real.jwt"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 401
