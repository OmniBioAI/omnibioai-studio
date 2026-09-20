"""
tests/test_compose_rag_key_not_in_frontend_build.py

Guards against RAG's shared API key reaching a browser bundle through Docker
Compose. The RAG UI (ragbio-ui) once received RAGBIO_API_KEY as a build arg and
compiled it into the public JavaScript bundle (Vite inlines every VITE_*
variable), which served the key to anyone who fetched the page's assets.

RAGBIO_API_KEY may still exist as a runtime environment variable for now (see the
retirement plan), but must never be a build argument on any service in any
compose file. This reads the compose files structurally; no secret is involved.

Developer:
    Manish Kumar <manish@omnibioai.org>
"""
from __future__ import annotations

from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILES = sorted(p.name for p in REPO_ROOT.glob("docker-compose*.yml"))


def _build_arg_names(service: dict) -> set[str]:
    build = service.get("build")
    if not isinstance(build, dict):
        return set()
    args = build.get("args") or {}
    if isinstance(args, list):
        return {item.split("=", 1)[0] for item in args}
    return set(args)


def test_compose_files_were_found():
    assert "docker-compose.yml" in COMPOSE_FILES


@pytest.mark.parametrize("compose_file", COMPOSE_FILES)
def test_no_service_receives_the_rag_key_as_a_build_arg(compose_file):
    services = (yaml.safe_load((REPO_ROOT / compose_file).read_text()) or {}).get("services") or {}
    offenders = sorted(
        name for name, svc in services.items()
        if isinstance(svc, dict) and {"RAGBIO_API_KEY", "VITE_RAGBIO_API_KEY"} & _build_arg_names(svc)
    )
    assert offenders == [], (
        f"{compose_file}: {offenders} pass the RAG API key as a build arg -- it would be compiled into "
        "a browser bundle. The RAG UI must authenticate with the signed-in user's own IAM token."
    )
