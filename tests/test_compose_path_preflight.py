"""Focused tests for fail-closed DGX bind-source validation."""
from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "compose_path_preflight", ROOT / "scripts" / "compose_path_preflight.py"
)
assert SPEC and SPEC.loader
preflight = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preflight)


def _compose(tmp_path: Path, source: Path, target: str) -> Path:
    path = tmp_path / "compose.yml"
    path.write_text(
        "services:\n"
        "  service:\n"
        "    image: example.invalid/test\n"
        "    volumes:\n"
        "      - type: bind\n"
        f"        source: {source}\n"
        f"        target: {target}\n"
        "        bind:\n"
        "          create_host_path: false\n",
        encoding="utf-8",
    )
    return path


def test_recursive_expansion_is_independent_of_pwd():
    env = {"MACHINE_DIR": "/srv/omni", "WORK_DIR": "${MACHINE_DIR}/work"}
    assert preflight.expand("${WORK_DIR}/runs", env) == "/srv/omni/work/runs"


def test_valid_long_bind_passes(tmp_path):
    source = tmp_path / "data"
    source.mkdir()
    compose = _compose(tmp_path, source, "/app/data")
    assert preflight.validate([compose], {}, (tmp_path / "forbidden",)) == []


def test_missing_source_fails_without_creating_it(tmp_path):
    source = tmp_path / "missing"
    compose = _compose(tmp_path, source, "/app/data")
    errors = preflight.validate([compose], {}, (tmp_path / "forbidden",))
    assert any("missing source" in error for error in errors)
    assert not source.exists()


def test_wrong_executable_type_is_rejected(tmp_path):
    source = tmp_path / "singularity"
    source.mkdir()
    compose = _compose(tmp_path, source, "/usr/bin/singularity")
    errors = preflight.validate([compose], {}, (tmp_path / "forbidden",))
    assert any("expected executable file" in error for error in errors)


def test_dot_d_destination_is_treated_as_a_directory(tmp_path):
    source = tmp_path / "db-init"
    source.mkdir()
    compose = _compose(tmp_path, source, "/docker-entrypoint-initdb.d")
    assert preflight.validate([compose], {}, (tmp_path / "forbidden",)) == []


def test_required_variable_in_short_bind_is_expanded_before_splitting(tmp_path):
    source = tmp_path / "policy.json"
    source.write_text("{}", encoding="utf-8")
    compose = tmp_path / "compose.yml"
    compose.write_text(
        "services:\n"
        "  service:\n"
        "    image: example.invalid/test\n"
        "    volumes:\n"
        "      - ${POLICY_FILE:?POLICY_FILE must be set}:/run/secrets/policy.json:ro\n",
        encoding="utf-8",
    )
    assert preflight.validate([compose], {"POLICY_FILE": str(source)}, (tmp_path / "forbidden",)) == []


def test_symlink_into_prohibited_root_is_rejected_before_target_access(tmp_path):
    prohibited = tmp_path / "prohibited"
    source = tmp_path / "sif"
    source.symlink_to(prohibited / "not-mounted")
    compose = _compose(tmp_path, source, "/sif")
    errors = preflight.validate([compose], {}, (prohibited,))
    assert any("prohibited path target" in error for error in errors)
    assert not prohibited.exists()


def test_dgx_wrapper_pins_absolute_project_and_all_overlays():
    text = (ROOT / "scripts" / "compose-dgx.sh").read_text(encoding="utf-8")
    assert "--project-directory" in text
    assert "docker-compose.yml" in text
    assert "docker-compose.override.yml" in text
    assert "docker-compose.arm64.yml" in text
