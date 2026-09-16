"""scripts/verify-mysql-backup-restore.sh — static regression guards.

Same convention as tests/test_mysql_recovery_drill.py: checks the
script's own text for the isolation/safety properties it must have,
rather than re-running a real docker restore in the test suite (that's
slow and already exercised manually -- see
omnibioai-docs/security/mysql_backup_recovery_evidence.md for the real,
non-mocked restore-proof run against an actual backup artifact).
"""
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "verify-mysql-backup-restore.sh"


def test_restore_target_is_network_isolated_and_disposable():
    text = SCRIPT.read_text(encoding="utf-8")
    assert "--network none" in text
    assert "MYSQL_ALLOW_EMPTY_PASSWORD=yes" in text
    assert "trap cleanup EXIT" in text
    assert "docker rm -f" in text


def test_never_targets_the_real_production_container():
    text = SCRIPT.read_text(encoding="utf-8")
    assert "omnibioai-studio-mysql-1" not in text


def test_verifies_integrity_before_restoring():
    text = SCRIPT.read_text(encoding="utf-8")
    assert "gzip -t" in text
    assert "sha256sum -c" in text


def test_compares_declared_vs_restored_structure():
    text = SCRIPT.read_text(encoding="utf-8")
    assert "CREATE DATABASE" in text
    assert "information_schema.tables" in text
    assert "information_schema.schemata" in text


def test_row_content_is_never_selected_only_counts():
    text = SCRIPT.read_text(encoding="utf-8")
    assert "SELECT COUNT(*)" in text
    assert "SELECT *" not in text
