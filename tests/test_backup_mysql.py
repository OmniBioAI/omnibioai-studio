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
import json
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
# Track E4 note: mysqldump_output legitimately starts with "-- " (a SQL
# comment, as real mysqldump output does) -- bash's printf builtin
# otherwise parses a leading "-" as an option flag and errors out. Every
# call site below uses `printf -- "%s"`-style option-termination so the
# format string is never misread as flags, while `\n` escapes inside it
# still expand to real newlines (format-string interpretation, unlike
# `printf '%s' ...` which would leave literal backslash-n). Before this
# fix, the printf failure was silently swallowed by the unconditional
# `exit 0` after it (`printf ...; exit 0`), producing an *empty* fake
# dump on every test in this file -- harmless for tests that only check
# artifact existence, but would have hidden a real content mismatch from
# any test (like the encryption round-trip below) that checks it.


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
            behavior = f'printf -- "{mysqldump_output}"; exit 0'
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

    def encrypted_artifacts(self):
        return sorted(self.backup_dir.glob("omnibioai_*.sql.gz.gpg"))

    def partials(self):
        return sorted(self.backup_dir.glob("*.partial")) + sorted(self.backup_dir.glob("*.partial.gpg"))

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


# ============================================================
# Track E4 — backup encryption at rest (real gpg, never faked)
# ============================================================
def _make_passphrase_file(tmp_path: Path, content: str = "correct-horse-battery-staple-not-real") -> Path:
    f = tmp_path / "passphrase"
    f.write_text(content, encoding="utf-8")
    f.chmod(0o600)
    return f


def test_unconfigured_deployment_still_produces_plaintext_unchanged(tmp_path):
    """No passphrase file, REQUIRE unset -> byte-identical rollout behavior
    to before Track E4 (the live nightly cron job must not break)."""
    sb = Sandbox(tmp_path)
    result = sb.run()
    assert result.returncode == 0, result.stderr
    assert len(sb.artifacts()) == 1
    assert not sb.encrypted_artifacts()
    assert sb.health()["LAST_ARTIFACT_ENCRYPTED"] == "false"


def test_passphrase_file_configured_encrypts_automatically(tmp_path):
    """Providing a key is itself the opt-in signal -- no separate flag needed."""
    sb = Sandbox(tmp_path)
    passphrase_file = _make_passphrase_file(tmp_path)
    result = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(passphrase_file)})
    assert result.returncode == 0, result.stderr
    assert not sb.artifacts(), "no plaintext artifact should be published when encryption is active"
    encrypted = sb.encrypted_artifacts()
    assert len(encrypted) == 1
    assert encrypted[0].with_suffix(encrypted[0].suffix + ".sha256").exists()
    assert sb.health()["LAST_ARTIFACT_ENCRYPTED"] == "true"


def test_encrypted_backup_is_real_ciphertext_not_gzip(tmp_path):
    sb = Sandbox(tmp_path)
    passphrase_file = _make_passphrase_file(tmp_path)
    result = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(passphrase_file)})
    assert result.returncode == 0, result.stderr
    artifact = sb.encrypted_artifacts()[0]
    raw = artifact.read_bytes()
    assert raw[:2] != b"\x1f\x8b", "artifact must not be plain gzip -- it must be gpg ciphertext"


def test_real_encrypt_then_decrypt_round_trip_recovers_original_dump(tmp_path):
    """Real gpg on both ends: encrypt via backup-mysql.sh, decrypt independently,
    confirm the recovered plaintext matches what mysqldump actually emitted."""
    dump_body = "-- fake sql dump\\nCREATE TABLE t (id INT);\\nINSERT INTO t VALUES (1);\\n"
    sb = Sandbox(tmp_path, mysqldump_output=dump_body)
    passphrase_file = _make_passphrase_file(tmp_path)
    result = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(passphrase_file)})
    assert result.returncode == 0, result.stderr
    artifact = sb.encrypted_artifacts()[0]

    decrypted_gz = tmp_path / "decrypted.sql.gz"
    decrypt = subprocess.run(
        ["gpg", "--batch", "--yes", "--pinentry-mode", "loopback",
         "--passphrase-file", str(passphrase_file), "-o", str(decrypted_gz), "-d", str(artifact)],
        capture_output=True, text=True, timeout=20, check=False,
    )
    assert decrypt.returncode == 0, decrypt.stderr

    import gzip as gzip_module
    with gzip_module.open(decrypted_gz, "rt") as f:
        recovered = f.read()
    assert recovered == dump_body.replace("\\n", "\n")


def test_wrong_passphrase_fails_closed_on_decrypt(tmp_path):
    dump_body = "-- fake sql dump\\nSELECT 1;\\n"
    sb = Sandbox(tmp_path, mysqldump_output=dump_body)
    passphrase_file = _make_passphrase_file(tmp_path, content="right-passphrase")
    result = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(passphrase_file)})
    assert result.returncode == 0, result.stderr
    artifact = sb.encrypted_artifacts()[0]

    wrong_passphrase_file = tmp_path / "wrong-passphrase"
    wrong_passphrase_file.write_text("wrong-passphrase", encoding="utf-8")
    wrong_passphrase_file.chmod(0o600)

    decrypt = subprocess.run(
        ["gpg", "--batch", "--yes", "--pinentry-mode", "loopback",
         "--passphrase-file", str(wrong_passphrase_file), "-o", str(tmp_path / "out.sql.gz"), "-d", str(artifact)],
        capture_output=True, text=True, timeout=20, check=False,
    )
    assert decrypt.returncode != 0, "decryption with the wrong passphrase must fail, not silently succeed"
    assert not (tmp_path / "out.sql.gz").exists() or (tmp_path / "out.sql.gz").stat().st_size == 0


def test_corrupted_ciphertext_fails_closed_on_decrypt(tmp_path):
    sb = Sandbox(tmp_path)
    passphrase_file = _make_passphrase_file(tmp_path)
    result = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(passphrase_file)})
    assert result.returncode == 0, result.stderr
    artifact = sb.encrypted_artifacts()[0]

    corrupted = tmp_path / "corrupted.sql.gz.gpg"
    raw = bytearray(artifact.read_bytes())
    # Flip bytes in the middle of the ciphertext -- not just truncate, which
    # gpg may sometimes read partially; a mid-stream bitflip reliably breaks
    # the authenticated/checksummed packet structure.
    mid = len(raw) // 2
    for i in range(mid, min(mid + 8, len(raw))):
        raw[i] ^= 0xFF
    corrupted.write_bytes(bytes(raw))

    decrypt = subprocess.run(
        ["gpg", "--batch", "--yes", "--pinentry-mode", "loopback",
         "--passphrase-file", str(passphrase_file), "-o", str(tmp_path / "out2.sql.gz"), "-d", str(corrupted)],
        capture_output=True, text=True, timeout=20, check=False,
    )
    assert decrypt.returncode != 0, "decryption of corrupted ciphertext must fail, not silently produce garbage"


def test_require_encryption_true_without_passphrase_file_fails_closed(tmp_path):
    sb = Sandbox(tmp_path)
    result = sb.run(extra_env={"MYSQL_BACKUP_REQUIRE_ENCRYPTION": "true"})
    assert result.returncode != 0
    assert "MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE" in result.stderr
    assert not sb.artifacts()
    assert not sb.encrypted_artifacts()
    assert not sb.partials(), "no plaintext .partial may survive an encryption-required failure"


def test_missing_passphrase_file_fails_closed_no_plaintext_fallback(tmp_path):
    sb = Sandbox(tmp_path)
    nonexistent = tmp_path / "does-not-exist-passphrase"
    result = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(nonexistent)})
    assert result.returncode != 0
    assert "passphrase file missing or empty" in result.stderr
    assert not sb.artifacts(), "must never fall back to a plaintext artifact"
    assert not sb.encrypted_artifacts()
    assert not sb.partials()


def test_empty_passphrase_file_fails_closed(tmp_path):
    sb = Sandbox(tmp_path)
    empty = tmp_path / "empty-passphrase"
    empty.write_text("", encoding="utf-8")
    result = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(empty)})
    assert result.returncode != 0
    assert not sb.artifacts()
    assert not sb.encrypted_artifacts()


def test_gpg_encryption_command_failure_fails_closed_no_plaintext_published(tmp_path):
    """Simulate an encryption-tool failure (gpg missing from PATH) --
    the run must fail, and no plaintext artifact may appear in its place."""
    sb = Sandbox(tmp_path)
    passphrase_file = _make_passphrase_file(tmp_path)
    # PATH is set inside sb.run() as f"{bin_dir}:{PATH}" -- putting a shim
    # named 'gpg' that always fails in bin_dir shadows the real one first.
    fake_gpg = sb.bin_dir / "gpg"
    fake_gpg.write_text("#!/usr/bin/env bash\necho 'fake gpg failure' >&2\nexit 2\n", encoding="utf-8")
    fake_gpg.chmod(fake_gpg.stat().st_mode | stat.S_IEXEC)

    result = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(passphrase_file)})
    assert result.returncode != 0
    assert "gpg encryption failed" in result.stderr
    assert not sb.artifacts(), "gpg failure must never leave a plaintext artifact published"
    assert not sb.encrypted_artifacts()
    assert not sb.partials()
    h = sb.health()
    assert h.get("LAST_RESULT") == "failure"
    assert h.get("LAST_STAGE") == "encrypt"


def test_checksum_covers_the_ciphertext_not_the_plaintext(tmp_path):
    """The published .sha256 sidecar must validate against the actual
    published (encrypted) bytes -- not the pre-encryption plaintext, which
    is deleted and never published at all."""
    sb = Sandbox(tmp_path)
    passphrase_file = _make_passphrase_file(tmp_path)
    result = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(passphrase_file)})
    assert result.returncode == 0, result.stderr
    artifact = sb.encrypted_artifacts()[0]
    sidecar = artifact.with_suffix(artifact.suffix + ".sha256")
    check = subprocess.run(
        ["sha256sum", "-c", sidecar.name], cwd=artifact.parent,
        capture_output=True, text=True, timeout=10, check=False,
    )
    assert check.returncode == 0, check.stdout + check.stderr


def test_passphrase_file_path_ok_but_contents_never_appear_in_logs(tmp_path):
    secret_marker = "SUPER-SECRET-PASSPHRASE-MARKER-a1b2c3"
    sb = Sandbox(tmp_path)
    passphrase_file = _make_passphrase_file(tmp_path, content=secret_marker)
    result = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(passphrase_file)})
    assert result.returncode == 0, result.stderr
    assert secret_marker not in result.stdout
    assert secret_marker not in result.stderr
    assert secret_marker not in sb.health_file.read_text(encoding="utf-8")


def test_encryption_status_recorded_in_health_file_and_preserved_on_later_failure(tmp_path):
    sb = Sandbox(tmp_path)
    passphrase_file = _make_passphrase_file(tmp_path)
    ok = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(passphrase_file)})
    assert ok.returncode == 0, ok.stderr
    assert sb.health()["LAST_ARTIFACT_ENCRYPTED"] == "true"

    sb.env_file.write_text("# password removed\n", encoding="utf-8")
    failed = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(passphrase_file)})
    assert failed.returncode != 0
    # A failed run must preserve the prior successful encrypted-artifact record.
    assert sb.health()["LAST_ARTIFACT_ENCRYPTED"] == "true"


def test_backup_failure_emits_a_backup_failed_security_alert(tmp_path):
    sb = Sandbox(tmp_path, container_running=False)
    result = sb.run()
    assert result.returncode != 0
    assert "[SECURITY-ALERT]" in result.stdout
    line = next(line for line in result.stdout.splitlines() if line.startswith("[SECURITY-ALERT] "))
    alert = json.loads(line[len("[SECURITY-ALERT] "):])
    assert alert["condition"] == "backup_failed"
    assert alert["severity"] == "critical"
    assert alert["component"] == "mysql-backup"


def test_encryption_stage_failure_emits_a_distinct_condition(tmp_path):
    sb = Sandbox(tmp_path)
    passphrase_file = _make_passphrase_file(tmp_path)
    fake_gpg = sb.bin_dir / "gpg"
    fake_gpg.write_text("#!/usr/bin/env bash\nexit 2\n", encoding="utf-8")
    fake_gpg.chmod(fake_gpg.stat().st_mode | stat.S_IEXEC)

    result = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(passphrase_file)})
    assert result.returncode != 0
    line = next(line for line in result.stdout.splitlines() if line.startswith("[SECURITY-ALERT] "))
    alert = json.loads(line[len("[SECURITY-ALERT] "):])
    assert alert["condition"] == "backup_encryption_failed", \
        "an encrypt-stage failure must be distinguishable from a generic backup_failed"


def test_repeated_backup_failures_are_deduped_not_stormed(tmp_path):
    sb = Sandbox(tmp_path, container_running=False)
    r1 = sb.run()
    r2 = sb.run()
    assert "[SECURITY-ALERT]" in r1.stdout
    assert "[SECURITY-ALERT]" not in r2.stdout, "a repeated identical failure within the dedup window must not storm"


def test_successful_backup_emits_no_alert(tmp_path):
    sb = Sandbox(tmp_path)
    result = sb.run()
    assert result.returncode == 0, result.stderr
    assert "[SECURITY-ALERT]" not in result.stdout


def test_retention_rotates_both_plaintext_and_encrypted_artifacts(tmp_path):
    sb = Sandbox(tmp_path)
    old_time = 1_000_000
    plain = sb.backup_dir / "omnibioai_20200101_000000.sql.gz"
    plain.write_bytes(b"\x1f\x8b" + b"0" * 50)
    plain.with_suffix(plain.suffix + ".sha256").write_text("deadbeef  fake\n")
    os.utime(plain, (old_time, old_time))

    encrypted_old = sb.backup_dir / "omnibioai_20200102_000000.sql.gz.gpg"
    encrypted_old.write_bytes(b"\x85\x01" + b"0" * 50)  # not real gpg framing, retention doesn't parse contents
    encrypted_old.with_suffix(encrypted_old.suffix + ".sha256").write_text("deadbeef  fake\n")
    os.utime(encrypted_old, (old_time, old_time))

    passphrase_file = _make_passphrase_file(tmp_path)
    result = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(passphrase_file), "RETAIN_DAYS": "7"})
    assert result.returncode == 0, result.stderr
    assert not plain.exists(), "old plaintext artifact must still be rotated"
    assert not encrypted_old.exists(), "old encrypted artifact must also be rotated"
    assert len(sb.encrypted_artifacts()) == 1  # only today's fresh one survives
