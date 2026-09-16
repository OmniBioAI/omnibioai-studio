"""scripts/backup-health-check.sh — independent backup-freshness signal.

Deliberately tests this as a standalone consumer of the health file
backup-mysql.sh writes, not by running a real backup -- this script's
whole purpose is to catch staleness/failure even if backup-mysql.sh
itself had a bug, so it must not share test fixtures/assumptions with
it. See tests/test_backup_mysql.py and
omnibioai-docs/security/mysql_backup_recovery_evidence.md.
"""
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "backup-health-check.sh"


def _run(health_content: str | None, tmp_path: Path, max_age_hours: int = 30, require_encryption: bool | None = None) -> subprocess.CompletedProcess:
    env = {"PATH": "/usr/bin:/bin"}
    if health_content is not None:
        health_file = tmp_path / "health.env"
        health_file.write_text(health_content, encoding="utf-8")
        env["BACKUP_HEALTH_FILE"] = str(health_file)
    else:
        env["BACKUP_HEALTH_FILE"] = str(tmp_path / "does-not-exist.env")
    env["BACKUP_MAX_AGE_HOURS"] = str(max_age_hours)
    if require_encryption is not None:
        env["BACKUP_REQUIRE_ENCRYPTION"] = "true" if require_encryption else "false"
    return subprocess.run(["bash", str(SCRIPT)], capture_output=True, text=True, timeout=10, env=env)


def _iso(hours_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()


def test_missing_health_file_is_unhealthy(tmp_path):
    result = _run(None, tmp_path)
    assert result.returncode == 1
    assert "no health file" in result.stdout


def test_recent_success_is_healthy(tmp_path):
    artifact = tmp_path / "fake.sql.gz"
    artifact.write_bytes(b"\x1f\x8b0")
    content = (
        f"LAST_ATTEMPT_TS={_iso(1)}\n"
        "LAST_RESULT=success\n"
        "LAST_STAGE=health\n"
        f"LAST_SUCCESS_TS={_iso(1)}\n"
        f"LAST_ARTIFACT={artifact}\n"
        "LAST_ARTIFACT_SIZE_BYTES=100\n"
        "LAST_ARTIFACT_SHA256=deadbeef\n"
    )
    result = _run(content, tmp_path)
    assert result.returncode == 0, result.stdout
    assert "[OK]" in result.stdout


def test_backup_older_than_max_age_is_unhealthy(tmp_path):
    artifact = tmp_path / "fake.sql.gz"
    artifact.write_bytes(b"\x1f\x8b0")
    content = (
        f"LAST_ATTEMPT_TS={_iso(40)}\n"
        "LAST_RESULT=success\n"
        "LAST_STAGE=health\n"
        f"LAST_SUCCESS_TS={_iso(40)}\n"
        f"LAST_ARTIFACT={artifact}\n"
        "LAST_ARTIFACT_SIZE_BYTES=100\n"
        "LAST_ARTIFACT_SHA256=deadbeef\n"
    )
    result = _run(content, tmp_path, max_age_hours=30)
    assert result.returncode == 1
    assert "old" in result.stdout


def test_most_recent_failure_is_unhealthy_even_with_fresh_prior_success(tmp_path):
    artifact = tmp_path / "fake.sql.gz"
    artifact.write_bytes(b"\x1f\x8b0")
    content = (
        f"LAST_ATTEMPT_TS={_iso(0)}\n"
        "LAST_RESULT=failure\n"
        "LAST_STAGE=dump\n"
        f"LAST_SUCCESS_TS={_iso(1)}\n"
        f"LAST_ARTIFACT={artifact}\n"
        "LAST_ARTIFACT_SIZE_BYTES=100\n"
        "LAST_ARTIFACT_SHA256=deadbeef\n"
    )
    result = _run(content, tmp_path)
    assert result.returncode == 1
    assert "FAILED at stage" in result.stdout


def test_missing_artifact_on_disk_is_unhealthy_even_if_recent(tmp_path):
    content = (
        f"LAST_ATTEMPT_TS={_iso(1)}\n"
        "LAST_RESULT=success\n"
        "LAST_STAGE=health\n"
        f"LAST_SUCCESS_TS={_iso(1)}\n"
        "LAST_ARTIFACT=/nonexistent/fake.sql.gz\n"
        "LAST_ARTIFACT_SIZE_BYTES=100\n"
        "LAST_ARTIFACT_SHA256=deadbeef\n"
    )
    result = _run(content, tmp_path)
    assert result.returncode == 1
    assert "no longer exists" in result.stdout


# ============================================================
# Track E4 — encryption-required assertion
# ============================================================
def _healthy_content(tmp_path: Path, encrypted: str) -> str:
    artifact = tmp_path / "fake.sql.gz.gpg"
    artifact.write_bytes(b"\x85\x01" + b"0" * 20)
    return (
        f"LAST_ATTEMPT_TS={_iso(1)}\n"
        "LAST_RESULT=success\n"
        "LAST_STAGE=health\n"
        f"LAST_SUCCESS_TS={_iso(1)}\n"
        f"LAST_ARTIFACT={artifact}\n"
        "LAST_ARTIFACT_SIZE_BYTES=100\n"
        "LAST_ARTIFACT_SHA256=deadbeef\n"
        f"LAST_ARTIFACT_ENCRYPTED={encrypted}\n"
    )


def test_require_encryption_true_with_encrypted_backup_is_healthy(tmp_path):
    result = _run(_healthy_content(tmp_path, "true"), tmp_path, require_encryption=True)
    assert result.returncode == 0, result.stdout


def test_require_encryption_true_with_unencrypted_backup_is_unhealthy(tmp_path):
    result = _run(_healthy_content(tmp_path, "false"), tmp_path, require_encryption=True)
    assert result.returncode == 1
    assert "encryption is required" in result.stdout


def test_require_encryption_false_with_unencrypted_backup_is_still_healthy(tmp_path):
    """Default/opt-out mode: encryption is not asserted at all."""
    result = _run(_healthy_content(tmp_path, "false"), tmp_path, require_encryption=False)
    assert result.returncode == 0, result.stdout


def test_require_encryption_unset_does_not_assert_encryption(tmp_path):
    result = _run(_healthy_content(tmp_path, "false"), tmp_path)
    assert result.returncode == 0, result.stdout
