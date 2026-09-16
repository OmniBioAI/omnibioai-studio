"""scripts/backup-mysql.sh — behavioral reliability tests.

Companion to test_lib_env.py, covering the script's own logic: secret
enforcement, stage-by-stage failure handling, atomic publication,
failure visibility, and retention safety. Each test invokes the real
script as a subprocess against a fully isolated, synthetic sandbox --
a fake `docker` on PATH (never the real Docker daemon), a throwaway
BACKUP_DIR/HEALTH_FILE, and OMNIBIOAI_ENV_FILE pointed at a synthetic
.env. No real secrets, no real containers, no network.

The real, non-mocked restore proof (an actual backup-mysql.sh artifact
restored into an isolated MySQL container) is exercised manually via
scripts/verify-mysql-backup-restore.sh and recorded in
omnibioai-docs/security/mysql_backup_recovery_evidence.md -- that step
is deliberately not mocked here, per the 2026-09-16 incident's closure
requirements.
"""
import os
import stat
import subprocess
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / "scripts" / "backup-mysql.sh"

FAKE_DOCKER_TEMPLATE = """#!/usr/bin/env bash
# Fake docker for tests -- never touches the real daemon.
if [[ "$1" == "ps" ]]; then
  echo "{container_name}"
  exit 0
fi
if [[ "$1" == "exec" ]]; then
  {mysqldump_behavior}
fi
echo "fake docker: unhandled args: $*" >&2
exit 1
"""


class Sandbox:
    def __init__(self, tmp_path: Path, *, container_running=True, mysqldump_exit=0,
                 mysqldump_output="-- fake sql dump\\nSELECT 1;\\n", env_content="MYSQL_ROOT_PASSWORD=test-password-not-real\\n"):
        self.tmp_path = tmp_path
        self.bin_dir = tmp_path / "bin"
        self.bin_dir.mkdir()
        self.backup_dir = tmp_path / "work" / "backups" / "mysql"
        self.backup_dir.mkdir(parents=True)
        self.health_file = tmp_path / "work" / "backups" / "mysql-backup-health.env"
        self.env_file = tmp_path / ".env"
        self.env_file.write_text(env_content, encoding="utf-8")

        container_name = "fake-mysql-1" if container_running else ""
        if mysqldump_exit == 0:
            behavior = f'printf "{mysqldump_output}"; exit 0'
        else:
            behavior = f'echo "fake mysqldump failure" >&2; exit {mysqldump_exit}'
        docker_script = FAKE_DOCKER_TEMPLATE.format(
            container_name=container_name, mysqldump_behavior=behavior,
        )
        fake_docker = self.bin_dir / "docker"
        fake_docker.write_text(docker_script, encoding="utf-8")
        fake_docker.chmod(fake_docker.stat().st_mode | stat.S_IEXEC)

    def run(self, extra_env: dict | None = None) -> subprocess.CompletedProcess:
        env = os.environ.copy()
        env["PATH"] = f"{self.bin_dir}:{env['PATH']}"
        env["OMNIBIOAI_ENV_FILE"] = str(self.env_file)
        env["BACKUP_DIR"] = str(self.backup_dir)
        env["BACKUP_HEALTH_FILE"] = str(self.health_file)
        env["MYSQL_CONTAINER"] = "fake-mysql-1"
        env.setdefault("RETAIN_DAYS", "7")
        if extra_env:
            env.update(extra_env)
        return subprocess.run(
            ["bash", str(SCRIPT)], capture_output=True, text=True, timeout=20, env=env,
        )

    def artifacts(self):
        return sorted(self.backup_dir.glob("omnibioai_*.sql.gz"))

    def partials(self):
        return sorted(self.backup_dir.glob("*.partial"))

    def health(self) -> dict:
        if not self.health_file.exists():
            return {}
        out = {}
        for line in self.health_file.read_text(encoding="utf-8").splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                out[k] = v
        return out


@pytest.fixture
def sandbox(tmp_path):
    return Sandbox(tmp_path)


# 1. secret retrieval failure -> backup fails
def test_missing_mysql_root_password_fails_closed(tmp_path):
    sb = Sandbox(tmp_path, env_content="# no password set at all\n")
    result = sb.run()
    assert result.returncode != 0
    assert "MYSQL_ROOT_PASSWORD" in result.stderr
    assert not sb.artifacts()


# 13. malformed secret/config fails closed (not a crash with a stray artifact)
def test_env_file_with_shell_metacharacter_secret_does_not_crash_and_loads(tmp_path):
    # The exact incident shape: a password-shaped value containing parens.
    sb = Sandbox(tmp_path, env_content="MYSQL_ROOT_PASSWORD=abc(def)ghi\n")
    result = sb.run()
    assert "syntax error" not in result.stderr
    assert result.returncode == 0, result.stderr
    assert len(sb.artifacts()) == 1


# 2. database connection failure -> backup fails
def test_container_not_running_fails_closed(tmp_path):
    sb = Sandbox(tmp_path, container_running=False)
    result = sb.run()
    assert result.returncode != 0
    assert "not running" in result.stderr
    assert not sb.artifacts()
    h = sb.health()
    assert h.get("LAST_RESULT") == "failure"
    assert h.get("LAST_STAGE") == "preflight"


# 3. dump failure -> no successful artifact
def test_mysqldump_failure_produces_no_artifact(tmp_path):
    sb = Sandbox(tmp_path, mysqldump_exit=1)
    result = sb.run()
    assert result.returncode != 0
    assert not sb.artifacts()
    assert not sb.partials()  # cleaned up, not left behind
    h = sb.health()
    assert h.get("LAST_RESULT") == "failure"
    assert h.get("LAST_STAGE") == "dump"


# 6. partial backup never published as completed
def test_failed_run_never_leaves_a_partial_at_the_final_name(tmp_path):
    sb = Sandbox(tmp_path, mysqldump_exit=1)
    sb.run()
    for f in sb.backup_dir.iterdir():
        assert not f.name.endswith(".sql.gz"), f"partial dump published as final artifact: {f}"


# 7. success produces a completed artifact (with checksum sidecar)
def test_successful_run_produces_completed_checksummed_artifact(tmp_path):
    sb = Sandbox(tmp_path)
    result = sb.run()
    assert result.returncode == 0, result.stderr
    artifacts = sb.artifacts()
    assert len(artifacts) == 1
    sidecar = artifacts[0].with_suffix(artifacts[0].suffix + ".sha256")
    assert sidecar.exists()
    assert artifacts[0].stat().st_size > 0


# 12. last-success state updates only after actual successful backup
def test_last_success_timestamp_unchanged_by_a_failed_run(tmp_path):
    sb = Sandbox(tmp_path)
    ok = sb.run()
    assert ok.returncode == 0, ok.stderr
    first_success_ts = sb.health()["LAST_SUCCESS_TS"]
    first_artifact = sb.health()["LAST_ARTIFACT"]

    # Now break it and run again.
    sb.env_file.write_text("# password removed\n", encoding="utf-8")
    failed = sb.run()
    assert failed.returncode != 0
    h = sb.health()
    assert h["LAST_RESULT"] == "failure"
    assert h["LAST_SUCCESS_TS"] == first_success_ts, "a failed run must not touch last-success state"
    assert h["LAST_ARTIFACT"] == first_artifact


# 8. retention not run destructively after a failed backup
def test_retention_never_runs_after_a_failed_backup(tmp_path):
    sb = Sandbox(tmp_path)
    ok = sb.run()
    assert ok.returncode == 0, ok.stderr
    assert len(sb.artifacts()) == 1
    first = sb.artifacts()[0]
    # Backdate it so it would be eligible for rotation if retention ran.
    old_time = 1_000_000  # epoch, ancient
    os.utime(first, (old_time, old_time))

    sb.env_file.write_text("# password removed to force failure\n", encoding="utf-8")
    failed = sb.run()
    assert failed.returncode != 0
    # The old artifact must still be there -- a failed run's aborted-before-dump
    # path never reaches the retention stage at all.
    assert first.exists()


# 9. retention failure is observable / retention never deletes the last backup
def test_retention_never_deletes_the_last_remaining_backup(tmp_path):
    sb = Sandbox(tmp_path)
    ok = sb.run(extra_env={"RETAIN_DAYS": "0"})
    assert ok.returncode == 0, ok.stderr
    artifacts = sb.artifacts()
    assert len(artifacts) == 1, "even with RETAIN_DAYS=0, the just-created backup must survive"


def test_retention_keeps_at_least_one_when_multiple_are_old(tmp_path):
    sb = Sandbox(tmp_path)
    # Seed two fake old artifacts directly (faster than 3 real runs).
    old_time = 1_000_000
    for i in range(2):
        f = sb.backup_dir / f"omnibioai_2020010{i}_000000.sql.gz"
        f.write_bytes(b"\x1f\x8b" + b"0" * 50)  # gzip magic bytes + padding
        f.with_suffix(f.suffix + ".sha256").write_text("deadbeef  fake\n")
        os.utime(f, (old_time, old_time))
    result = sb.run(extra_env={"RETAIN_DAYS": "7"})
    assert result.returncode == 0, result.stderr
    remaining = sb.artifacts()
    assert len(remaining) >= 1
    # The freshest artifact (the one just created) must always survive.
    assert any(f.stat().st_mtime > old_time + 3600 for f in remaining)


# 10. secret values not emitted to logs
def test_password_value_never_appears_in_script_output(tmp_path):
    secret_marker = "SUPER-SECRET-MARKER-VALUE-9f8e7d"
    sb = Sandbox(tmp_path, env_content=f"MYSQL_ROOT_PASSWORD={secret_marker}\n")
    result = sb.run()
    assert result.returncode == 0, result.stderr
    assert secret_marker not in result.stdout
    assert secret_marker not in result.stderr
    assert secret_marker not in sb.health_file.read_text(encoding="utf-8")
    for f in sb.backup_dir.iterdir():
        if f.suffix == ".sha256":
            assert secret_marker not in f.read_text(encoding="utf-8")


# 11. scheduler receives non-zero status on failure (this is just "does the
# process exit non-zero", which is what every failure test above already
# asserts via result.returncode != 0 -- restated explicitly here since it's
# the thing that actually made the real incident invisible to cron/logs).
def test_exit_code_propagates_on_every_failure_path(tmp_path):
    for i, kwargs in enumerate((
        dict(container_running=False),
        dict(mysqldump_exit=1),
        dict(env_content="# no password\n"),
    )):
        case_dir = tmp_path / f"case{i}"
        case_dir.mkdir()
        sb = Sandbox(case_dir, **kwargs)
        result = sb.run()
        assert result.returncode != 0, f"case {i} ({kwargs}) did not propagate failure"
