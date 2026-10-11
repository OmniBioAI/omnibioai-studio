"""Regression coverage for deploy-verify's portable report output."""
from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path


def load_verifier():
    # The report writer itself has no third-party requirements, but the module
    # imports Docker/PyYAML for the checks. Keep these tests credential-free and
    # runnable in a minimal host Python environment.
    for name in ("docker", "requests", "yaml"):
        sys.modules.setdefault(name, types.ModuleType(name))
    docker = sys.modules["docker"]
    docker.errors = types.SimpleNamespace(ImageNotFound=Exception)
    docker.from_env = lambda: None
    spec = importlib.util.spec_from_file_location("deploy_verify_under_test", "scripts/deploy_verify.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def test_report_writer_creates_missing_parent_and_preserves_format(tmp_path, monkeypatch):
    module = load_verifier()
    report_dir = tmp_path / "nested" / "reports"
    monkeypatch.setattr(module, "REPORT_DIR", report_dir)
    monkeypatch.setattr(module, "OUT_FILE", report_dir / "STALE_SERVICES.txt")

    assert module.write_report("header\n[OK] service") is True
    assert module.OUT_FILE.read_text() == "header\n[OK] service\n"


def test_report_writer_overwrites_valid_report(tmp_path, monkeypatch):
    module = load_verifier()
    report_dir = tmp_path / "reports"
    report_dir.mkdir()
    output = report_dir / "STALE_SERVICES.txt"
    output.write_text("old")
    monkeypatch.setattr(module, "REPORT_DIR", report_dir)
    monkeypatch.setattr(module, "OUT_FILE", output)

    assert module.write_report("new") is True
    assert output.read_text() == "new\n"


def test_report_writer_rejects_accidental_directory(tmp_path, monkeypatch):
    module = load_verifier()
    report_dir = tmp_path / "reports"
    report_dir.mkdir()
    output = report_dir / "STALE_SERVICES.txt"
    output.mkdir()
    monkeypatch.setattr(module, "REPORT_DIR", report_dir)
    monkeypatch.setattr(module, "OUT_FILE", output)

    assert module.write_report("new") is False


def test_report_writer_returns_failure_for_unwritable_parent(tmp_path, monkeypatch):
    module = load_verifier()
    report_dir = tmp_path / "reports"
    report_dir.mkdir()
    monkeypatch.setattr(module, "REPORT_DIR", report_dir)
    monkeypatch.setattr(module, "OUT_FILE", report_dir / "STALE_SERVICES.txt")
    monkeypatch.setattr(Path, "write_text", lambda *args, **kwargs: (_ for _ in ()).throw(PermissionError("read-only")))

    assert module.write_report("new") is False
