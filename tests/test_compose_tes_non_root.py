"""TES runs as the unprivileged tes-submit user (2001:2001), never as root, with its
state on the host's local NVMe instead of /tmp.

Companion to omnibioai-tes PR #85 (Dockerfile USER, scripts/tes-entrypoint.sh,
docs/security/tes-container-non-root.md). The image's entrypoint refuses uid 0 and
replaces `service nginx start && omnibioai-tes serve ...`, which needs root.
"""
from __future__ import annotations

from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILES = ["docker-compose.yml", "docker-compose-release.yml", "docker-compose.release.yml"]


def _tes(name: str) -> dict:
    return yaml.safe_load((ROOT / name).read_text())["services"]["tes"]


def _binds(tes: dict) -> list[tuple[str, str, dict]]:
    out = []
    for v in tes.get("volumes") or []:
        if isinstance(v, str):
            src, _, rest = v.partition(":")
            out.append((src, rest.split(":")[0], {}))
        else:
            out.append((v.get("source"), v.get("target"), v.get("bind") or {}))
    return out


def test_base_compose_runs_tes_as_tes_submit():
    assert _tes("docker-compose.yml")["user"] == "${TES_UID:-2001}:${TES_GID:-2001}"


@pytest.mark.parametrize("path", ["/var/lib/omnibioai/tes-runs", "/var/lib/omnibioai/tes-cloud"])
def test_state_dirs_are_bound_at_the_same_path_and_fail_closed(path):
    binds = {(s, t): b for s, t, b in _binds(_tes("docker-compose.yml"))}
    assert binds[(path, path)] == {"create_host_path": False}


@pytest.mark.parametrize("name", COMPOSE_FILES)
def test_no_tmp_work_root_and_no_root_only_start(name):
    tes = _tes(name)
    assert not any("omnibioai_tes_runs" in f"{s}:{t}" for s, t, _ in _binds(tes))
    assert tes["environment"]["TMPDIR"] == "/tmp"
    command = tes["command"]
    assert isinstance(command, list) and command[0] == "/app/scripts/tes-entrypoint.sh"
    assert "service nginx" not in " ".join(map(str, command)) and "bash" not in command
    assert command[1:5] == ["--host", "0.0.0.0", "--port", "8081"]


@pytest.mark.parametrize("name", COMPOSE_FILES)
def test_tes_is_never_set_to_root(name):
    user = str(_tes(name).get("user", ""))
    assert user.split(":")[0] not in ("0", "root")
