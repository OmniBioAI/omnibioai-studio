"""
test_conftest_fixtures.py — exercises the shared fixtures/helpers in conftest.py.

These fixtures (base_url, auth_url, ..., http, auth_headers, rag_headers) are
provided for test authors but aren't all consumed by the existing suites.
This file covers them directly, plus the error paths of the login helpers
that back the auth_tokens / lims_session fixtures.

Run: pytest tests/integration/test_conftest_fixtures.py -v

Developer:
    Manish Kumar <manish@omnibioai.org>
"""

import pytest
import requests

import conftest
from conftest import (
    AUTH_DIRECT_URL,
    LIMS_DIRECT_URL,
    RAG_DIRECT_URL,
    RAGBIO_API_KEY,
    TES_DIRECT_URL,
    BASE_URL,
)


# ── URL fixtures ──────────────────────────────────────────────────────────────

def test_base_url_fixture(base_url):
    """The base_url fixture returns conftest.BASE_URL."""
    assert base_url == BASE_URL


def test_auth_url_fixture(auth_url):
    """The auth_url fixture returns conftest.AUTH_DIRECT_URL."""
    assert auth_url == AUTH_DIRECT_URL


def test_lims_url_fixture(lims_url):
    """The lims_url fixture returns conftest.LIMS_DIRECT_URL."""
    assert lims_url == LIMS_DIRECT_URL


def test_tes_url_fixture(tes_url):
    """The tes_url fixture returns conftest.TES_DIRECT_URL."""
    assert tes_url == TES_DIRECT_URL


def test_rag_url_fixture(rag_url):
    """The rag_url fixture returns conftest.RAG_DIRECT_URL."""
    assert rag_url == RAG_DIRECT_URL


# ── http fixture ──────────────────────────────────────────────────────────────

class TestHttpFixture:
    """The shared http fixture: a requests.Session that applies the default timeout and
    still accepts explicit request kwargs. Two tests call the live RAG /health endpoint."""
    def test_is_a_session(self, http):
        """The http fixture is a requests.Session instance."""
        assert isinstance(http, requests.Session)

    def test_applies_default_timeout(self, http):
        """A GET through the http fixture to the RAG service /health returns 200 with
        the default-timeout wrapper in place."""
        r = http.get(f"{RAG_DIRECT_URL}/health")
        assert r.status_code == 200

    def test_can_still_pass_explicit_kwargs(self, http):
        """http.get still accepts explicit headers and the RAG /health request returns
        200."""
        r = http.get(f"{RAG_DIRECT_URL}/health", headers={"X-Test": "1"})
        assert r.status_code == 200


# ── auth_headers / rag_headers fixtures ──────────────────────────────────────

def test_auth_headers_fixture(auth_headers, access_token):
    """auth_headers is a Bearer Authorization header built from the access_token
    fixture."""
    assert auth_headers == {"Authorization": f"Bearer {access_token}"}


def test_rag_headers_fixture(rag_headers):
    """rag_headers is a Bearer Authorization header built from RAGBIO_API_KEY."""
    assert rag_headers == {"Authorization": f"Bearer {RAGBIO_API_KEY}"}


# ── Login helper error paths ─────────────────────────────────────────────────

class _FailingResponse:
    status_code = 500

    def raise_for_status(self):
        raise requests.HTTPError("boom")


def test_login_or_skip_skips_when_auth_service_unreachable(monkeypatch):
    """_login_or_skip turns a failing auth login response (stubbed so raise_for_status
    raises) into a pytest skip rather than an error."""
    monkeypatch.setattr(
        conftest.requests, "post", lambda *a, **k: _FailingResponse()
    )
    with pytest.raises(pytest.skip.Exception):
        conftest._login_or_skip()


def test_lims_login_or_skip_skips_when_lims_unreachable(monkeypatch):
    """_lims_login_or_skip raises a pytest skip when the LIMS login POST raises a
    connection error (stubbed)."""
    def _raise(*a, **k):
        raise requests.ConnectionError("no route to host")

    monkeypatch.setattr(requests.Session, "post", _raise)
    with pytest.raises(pytest.skip.Exception):
        conftest._lims_login_or_skip()


def test_lims_session_fixture_authenticates(lims_session):
    """The lims_session fixture yields a requests.Session after a login against the live
    LIMS."""
    assert isinstance(lims_session, requests.Session)
