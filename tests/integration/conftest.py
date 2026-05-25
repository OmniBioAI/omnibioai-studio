"""
Shared fixtures for OmniBioAI integration tests.

Services are accessed through the nginx router at http://localhost (port 80)
and also directly via their native ports where noted.
"""

import os
import pytest
import requests

# ── Base URLs ────────────────────────────────────────────────────────────────
# All traffic can go through the nginx router at port 80.
# Direct-port URLs are available for services that need them.

BASE_URL = os.getenv("OMNIBIOAI_BASE_URL", "http://localhost")

# Direct service ports (bypasses nginx; useful when nginx is down)
AUTH_DIRECT_URL = os.getenv("OMNIBIOAI_AUTH_URL", "http://localhost:8001")
LIMS_DIRECT_URL = os.getenv("OMNIBIOAI_LIMS_URL", "http://localhost:7000")
TES_DIRECT_URL = os.getenv("OMNIBIOAI_TES_URL", "http://localhost:8081")
RAG_DIRECT_URL = os.getenv("OMNIBIOAI_RAG_URL", "http://localhost:8090")

# ── Credentials ──────────────────────────────────────────────────────────────
AUTH_ADMIN_EMAIL = os.getenv("OMNIBIOAI_AUTH_EMAIL", "admin@omnibioai")
AUTH_ADMIN_PASSWORD = os.getenv("OMNIBIOAI_AUTH_PASSWORD", "admin")

LIMS_USERNAME = os.getenv("OMNIBIOAI_LIMS_USER", "man4ish")
LIMS_PASSWORD = os.getenv("OMNIBIOAI_LIMS_PASSWORD", "root")

RAGBIO_API_KEY = os.getenv(
    "RAGBIO_API_KEY",
    "151b795d8e506b524c507e19212a663a09a44982684d93816803d13f042455cc",
)

# ── Request timeout (seconds) ────────────────────────────────────────────────
TIMEOUT = int(os.getenv("OMNIBIOAI_TEST_TIMEOUT", "10"))


# ── Fixtures: base URLs ───────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def auth_url():
    return AUTH_DIRECT_URL


@pytest.fixture(scope="session")
def lims_url():
    return LIMS_DIRECT_URL


@pytest.fixture(scope="session")
def tes_url():
    return TES_DIRECT_URL


@pytest.fixture(scope="session")
def rag_url():
    return RAG_DIRECT_URL


# ── Fixtures: shared HTTP session ────────────────────────────────────────────

@pytest.fixture(scope="session")
def http():
    """Bare requests.Session with a default timeout adapter."""
    session = requests.Session()
    session.request = lambda method, url, **kwargs: requests.Session.request(
        session, method, url, timeout=TIMEOUT, **kwargs
    )
    return session


# ── Fixtures: auth tokens ─────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def auth_tokens():
    """
    Log in to the auth service and return {"access_token": ..., "refresh_token": ...}.
    Skips if the auth service is not reachable.
    """
    try:
        resp = requests.post(
            f"{AUTH_DIRECT_URL}/auth/login",
            json={"email": AUTH_ADMIN_EMAIL, "password": AUTH_ADMIN_PASSWORD},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        pytest.skip(f"Auth service unavailable, skipping: {exc}")


@pytest.fixture(scope="session")
def access_token(auth_tokens):
    return auth_tokens["access_token"]


@pytest.fixture(scope="session")
def refresh_token(auth_tokens):
    return auth_tokens["refresh_token"]


@pytest.fixture(scope="session")
def auth_headers(access_token):
    return {"Authorization": f"Bearer {access_token}"}


# ── Fixtures: LIMS cookie session ────────────────────────────────────────────

@pytest.fixture(scope="session")
def lims_session():
    """
    Authenticate against LIMS and return a requests.Session with the JWT
    cookie already set.  Skips if LIMS is not reachable.
    """
    session = requests.Session()
    try:
        resp = session.post(
            f"{LIMS_DIRECT_URL}/api/token/",
            json={"username": LIMS_USERNAME, "password": LIMS_PASSWORD},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        # LIMS uses HttpOnly cookies; also accept plain JSON tokens
        token = data.get("access") or data.get("access_token", "")
        if token:
            session.headers["Authorization"] = f"Bearer {token}"
    except Exception as exc:
        pytest.skip(f"LIMS service unavailable, skipping: {exc}")
    return session


# ── Fixtures: RAG headers ─────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def rag_headers():
    return {"Authorization": f"Bearer {RAGBIO_API_KEY}"}
