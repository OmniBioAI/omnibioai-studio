"""
tests/test_compose_no_secret_frontend_inputs.py

Generic guard against reusable credentials reaching a browser bundle through
Docker Compose.

Frontend build tools inline their public-prefixed variables into the JavaScript
served to anyone: Vite inlines VITE_*, Create React App inlines the ENTIRE set of
REACT_APP_* at every place any of them is read, and any Docker build arg feeding a
frontend build ends up in the bundle the same way. The RAG UI once published RAG's
shared API key, and the Launcher published the live Jupyter token, exactly like
this.

Policy: PUBLIC configuration (URLs, flags, client ids) may be a build arg or a
browser-prefixed variable; a reusable CREDENTIAL never may. This reads the compose
files structurally -- no secret value is involved and none is printed.

Developer:
    Manish Kumar <manish@omnibioai.org>
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILES = sorted(p.name for p in REPO_ROOT.glob("docker-compose*.yml"))

SECRET_LIKE = re.compile(r"(TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|API_?KEY|PRIVATE)", re.IGNORECASE)
BROWSER_PREFIXES = ("REACT_APP_", "VITE_", "NEXT_PUBLIC_", "PUBLIC_", "GATSBY_")

# Deliberate, reviewed exceptions: (compose file, service, name) -> why the value is public.
# Keep this empty unless a value is genuinely public despite its name.
ALLOWED: dict[tuple[str, str, str], str] = {}


def _names(value) -> list[str]:
    if isinstance(value, dict):
        return list(value)
    return [item.split("=", 1)[0] for item in (value or [])]


def _services(compose_file: str) -> dict:
    return (yaml.safe_load((REPO_ROOT / compose_file).read_text()) or {}).get("services") or {}


def test_compose_files_were_found():
    assert "docker-compose.yml" in COMPOSE_FILES


@pytest.mark.parametrize("compose_file", COMPOSE_FILES)
def test_no_secret_like_build_arg(compose_file):
    offenders = []
    for service, spec in _services(compose_file).items():
        build = spec.get("build") if isinstance(spec, dict) else None
        if not isinstance(build, dict):
            continue
        for name in _names(build.get("args")):
            if SECRET_LIKE.search(name) and (compose_file, service, name) not in ALLOWED:
                offenders.append(f"{service}: {name}")
    assert offenders == [], (
        f"{compose_file}: secret-like build args {offenders} would be compiled into a browser bundle. "
        "Pass only public configuration; use BuildKit secrets for build-time credentials."
    )


@pytest.mark.parametrize("compose_file", COMPOSE_FILES)
def test_no_secret_like_browser_prefixed_variable(compose_file):
    offenders = []
    for service, spec in _services(compose_file).items():
        if not isinstance(spec, dict):
            continue
        build = spec.get("build") if isinstance(spec.get("build"), dict) else {}
        for name in _names(spec.get("environment")) + _names(build.get("args")):
            if name.startswith(BROWSER_PREFIXES) and SECRET_LIKE.search(name) and (compose_file, service, name) not in ALLOWED:
                offenders.append(f"{service}: {name}")
    assert offenders == [], (
        f"{compose_file}: secret-like browser-prefixed variables {offenders}: frontend tooling inlines "
        "these into public JavaScript."
    )


def test_launcher_lifecycle_api_is_configured_to_verify_callers():
    """The launcher's API fails closed without IAM, so it must be told where auth lives."""
    env = _services("docker-compose.yml")["launcher"].get("environment") or {}
    assert "IAM_URL" in (env if isinstance(env, dict) else _names(env))
