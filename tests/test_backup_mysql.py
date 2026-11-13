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

Developer:
    Manish Kumar <manish@omnibioai.org>
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


def _make_age_keypair(tmp_path: Path, name: str = "age") -> tuple[Path, Path]:
    """Generates a throwaway age identity under tmp_path; returns (identity, recipient)."""
    keys = tmp_path / f"{name}-keys"
    keys.mkdir(mode=0o700)
    identity, recipient = keys / "backup-age.key", keys / "backup-age.pub"
    subprocess.run(["age-keygen", "-o", str(identity)], check=True, capture_output=True, timeout=10)
    pub = subprocess.run(["age-keygen", "-y", str(identity)], check=True, capture_output=True,
                         text=True, timeout=10).stdout
    recipient.write_text(pub, encoding="utf-8")
    return identity, recipient


def _age_decrypt(artifact: Path, identity: Path) -> subprocess.CompletedProcess:
    return subprocess.run(["age", "-d", "-i", str(identity), str(artifact)],
                          capture_output=True, timeout=20, check=False)


class Sandbox:
    """Isolated synthetic sandbox for running backup-mysql.sh: a throwaway backup dir,
    health file and .env under tmp_path plus a fake docker shim on PATH (never the real
    daemon), with configurable container state, mysqldump exit code and mysqldump
    output."""
    def __init__(self, tmp_path: Path, *, container_running=True, mysqldump_exit=0,
                 mysqldump_output="-- fake sql dump\\nSELECT 1;\\n", env_content="MYSQL_ROOT_PASSWORD=test-password-not-real\\n",
                 stat_mode="gnu"):
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

        stat_behaviors = {
            "gnu": '[[ "$1" == "-c%s" ]] || exit 1; shift; [[ "$1" == "--" ]] && shift; wc -c < "$1" | tr -d " "',
            "bsd": '[[ "$1" == "-f%z" ]] || exit 1; wc -c < "$2" | tr -d " "',
            "unsupported": 'exit 1',
            "invalid": 'echo not-a-size; exit 0',
            "missing": 'file="${@: -1}"; rm -f -- "$file"; exit 1',
            "empty": 'file="${@: -1}"; : > "$file"; [[ "$1" == "-c%s" ]] && echo 0 || exit 1',
        }
        fake_stat = self.bin_dir / "stat"
        fake_stat.write_text(f'#!/usr/bin/env bash\n{stat_behaviors[stat_mode]}\n', encoding="utf-8")
        fake_stat.chmod(fake_stat.stat().st_mode | stat.S_IEXEC)

        # Throwaway age key pair (real age, never a real key): the script only
        # ever sees the public half, the tests decrypt with the identity.
        self.age_identity, self.age_recipient = _make_age_keypair(tmp_path)

    def run(self, extra_env: dict | None = None) -> subprocess.CompletedProcess:
        """Runs backup-mysql.sh as a subprocess with PATH, OMNIBIOAI_ENV_FILE,
        BACKUP_DIR and the health file redirected into the sandbox."""
        env = os.environ.copy()
        env["PATH"] = f"{self.bin_dir}:{env['PATH']}"
        env["OMNIBIOAI_ENV_FILE"] = str(self.env_file)
        env["BACKUP_DIR"] = str(self.backup_dir)
        env["BACKUP_HEALTH_FILE"] = str(self.health_file)
        env["MYSQL_CONTAINER"] = "fake-mysql-1"
        env["MYSQL_BACKUP_AGE_RECIPIENT_FILE"] = str(self.age_recipient)
        env.pop("MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE", None)
        env.setdefault("RETAIN_DAYS", "7")
        if extra_env:
            env.update(extra_env)
        return subprocess.run(
            ["bash", str(SCRIPT)], capture_output=True, text=True, timeout=20, env=env,
        )

    def artifacts(self):
        """Published dumps that are not GPG: age (the default) or plaintext."""
        return self.age_artifacts() + self.plaintext_artifacts()

    def age_artifacts(self):
        return sorted(self.backup_dir.glob("omnibioai_*.sql.gz.age"))

    def plaintext_artifacts(self):
        return sorted(self.backup_dir.glob("omnibioai_*.sql.gz"))

    def encrypted_artifacts(self):
        return sorted(self.backup_dir.glob("omnibioai_*.sql.gz.gpg"))

    def partials(self):
        return sorted(self.backup_dir.glob("*.partial*"))

    def health(self) -> dict:
        """Parses the KEY=VALUE health file into a dict, or returns an empty dict when
        the file does not exist."""
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
    """Default sandbox: MySQL container running, mysqldump succeeding and a synthetic
    .env with a placeholder password."""
    return Sandbox(tmp_path)


# 1. secret retrieval failure -> backup fails
def test_missing_mysql_root_password_fails_closed(tmp_path):
    """A .env with no MYSQL_ROOT_PASSWORD makes the backup exit non-zero, name the
    missing variable on stderr and publish no artifact."""
    sb = Sandbox(tmp_path, env_content="# no password set at all\n")
    result = sb.run()
    assert result.returncode != 0
    assert "MYSQL_ROOT_PASSWORD" in result.stderr
    assert not sb.artifacts()


# 13. malformed secret/config fails closed (not a crash with a stray artifact)
def test_env_file_with_shell_metacharacter_secret_does_not_crash_and_loads(tmp_path):
    """A password value containing parentheses (the shape of the original incident)
    loads without a shell syntax error, and the backup succeeds with exactly one
    artifact."""
    # The exact incident shape: a password-shaped value containing parens.
    sb = Sandbox(tmp_path, env_content="MYSQL_ROOT_PASSWORD=abc(def)ghi\n")
    result = sb.run()
    assert "syntax error" not in result.stderr
    assert result.returncode == 0, result.stderr
    assert len(sb.artifacts()) == 1


# 2. database connection failure -> backup fails
def test_container_not_running_fails_closed(tmp_path):
    """When the MySQL container is not running, the backup fails with 'not running' on
    stderr, publishes no artifact and records LAST_RESULT=failure at the preflight
    stage."""
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
    """A failing mysqldump leaves no artifact and no leftover .partial file, and the
    health file records a failure at the dump stage."""
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
    """After a failed dump, no file in the backup directory carries the final .sql.gz
    name."""
    sb = Sandbox(tmp_path, mysqldump_exit=1)
    sb.run()
    for f in sb.backup_dir.iterdir():
        assert not f.name.endswith((".sql.gz", ".sql.gz.age")), f"partial dump published as final artifact: {f}"


# 7. success produces a completed artifact (with checksum sidecar)
def test_successful_run_produces_completed_checksummed_artifact(tmp_path):
    """A successful run publishes exactly one non-empty .sql.gz.age artifact together with a
    .sha256 sidecar, and no plaintext."""
    sb = Sandbox(tmp_path)
    result = sb.run()
    assert result.returncode == 0, result.stderr
    artifacts = sb.artifacts()
    assert len(artifacts) == 1
    assert artifacts[0].name.endswith(".sql.gz.age")
    assert not sb.plaintext_artifacts()
    sidecar = artifacts[0].with_suffix(artifacts[0].suffix + ".sha256")
    assert sidecar.exists()
    assert artifacts[0].stat().st_size > 0


@pytest.mark.parametrize("stat_mode", ["gnu", "bsd"])
def test_portable_stat_syntax_records_exact_artifact_size(tmp_path, stat_mode):
    """Both supported stat dialects publish the same validated byte metadata."""
    sb = Sandbox(tmp_path, stat_mode=stat_mode)
    result = sb.run()
    assert result.returncode == 0, result.stderr
    artifact = sb.artifacts()[0]
    health = sb.health()
    assert health["LAST_RESULT"] == "success"
    assert health["LAST_ARTIFACT_SIZE_BYTES"] == str(artifact.stat().st_size)


@pytest.mark.parametrize("stat_mode, diagnostic", [
    ("unsupported", "no supported stat"),
    ("invalid", "invalid file size"),
    ("missing", "size verification failed"),
    ("empty", "became empty"),
])
def test_size_verification_failure_does_not_publish_artifact(tmp_path, stat_mode, diagnostic):
    """Unsupported, invalid, missing, or emptied artifacts fail the publish stage closed."""
    sb = Sandbox(tmp_path, stat_mode=stat_mode)
    result = sb.run()
    assert result.returncode != 0
    assert diagnostic in result.stderr
    assert not sb.artifacts()
    assert not sb.encrypted_artifacts()
    assert not list(sb.backup_dir.glob("*.sha256"))
    health = sb.health()
    assert health["LAST_RESULT"] == "failure"
    assert health["LAST_STAGE"] == "publish"


def test_backup_metadata_contains_checksum_size_and_published_path(tmp_path):
    """Successful publication retains the established health metadata contract."""
    sb = Sandbox(tmp_path, stat_mode="gnu")
    result = sb.run()
    assert result.returncode == 0, result.stderr
    artifact = sb.artifacts()[0]
    health = sb.health()
    assert health["LAST_ARTIFACT"] == str(artifact)
    assert health["LAST_ARTIFACT_SIZE_BYTES"].isdigit()
    assert int(health["LAST_ARTIFACT_SIZE_BYTES"]) > 0
    assert len(health["LAST_ARTIFACT_SHA256"]) == 64
    assert health["LAST_ARTIFACT_ENCRYPTED"] == "true"


# 12. last-success state updates only after actual successful backup
def test_last_success_timestamp_unchanged_by_a_failed_run(tmp_path):
    """A later failed run records LAST_RESULT=failure but leaves LAST_SUCCESS_TS and
    LAST_ARTIFACT from the earlier success untouched."""
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
    """A run that fails before the dump (password removed) never reaches retention, so a
    backdated existing artifact is not rotated away."""
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
    """Even with RETAIN_DAYS=0, the backup just created survives retention."""
    sb = Sandbox(tmp_path)
    ok = sb.run(extra_env={"RETAIN_DAYS": "0"})
    assert ok.returncode == 0, ok.stderr
    artifacts = sb.artifacts()
    assert len(artifacts) == 1, "even with RETAIN_DAYS=0, the just-created backup must survive"


def test_retention_keeps_at_least_one_when_multiple_are_old(tmp_path):
    """With two seeded old artifacts and RETAIN_DAYS=7, at least one artifact remains
    and the freshly created one survives."""
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
    """The MYSQL_ROOT_PASSWORD marker value appears in neither stdout, stderr, the
    health file nor any .sha256 sidecar."""
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
    """Each failure mode (container down, mysqldump failure, missing password) makes the
    script exit non-zero, so a scheduler sees the failure."""
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
    """Writes a throwaway 0600 passphrase file with a synthetic, non-real value and
    returns its path."""
    f = tmp_path / "passphrase"
    f.write_text(content, encoding="utf-8")
    f.chmod(0o600)
    return f


@pytest.mark.parametrize("setup", ["missing", "empty"])
def test_missing_age_recipient_fails_closed_with_no_plaintext(tmp_path, setup):
    """No passphrase file and no usable recipient file: there is no plaintext mode any
    more, so the run fails before the dump and leaves no artifact of any kind."""
    sb, argv_file, _ = _recording_sandbox(tmp_path)
    if setup == "missing":
        sb.age_recipient.unlink()
    else:
        sb.age_recipient.write_text("", encoding="utf-8")
    result = sb.run()
    assert result.returncode != 0
    assert "MYSQL_BACKUP_AGE_RECIPIENT_FILE" in result.stderr
    assert not argv_file.exists(), "mysqldump must not run"
    assert list(sb.backup_dir.iterdir()) == []
    assert sb.health()["LAST_STAGE"] == "encrypt"


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
    """With a passphrase file configured, the published artifact does not begin with the
    gzip magic bytes, i.e. it is gpg output rather than plain gzip."""
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
    """Decrypting an encrypted backup with a different passphrase exits non-zero and
    leaves no non-empty output file."""
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
    """Decrypting ciphertext whose mid-stream bytes were flipped exits non-zero instead
    of producing output."""
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


def test_require_encryption_flag_is_ignored_age_is_always_on(tmp_path):
    """MYSQL_BACKUP_REQUIRE_ENCRYPTION=false cannot turn encryption off."""
    sb = Sandbox(tmp_path)
    result = sb.run(extra_env={"MYSQL_BACKUP_REQUIRE_ENCRYPTION": "false"})
    assert result.returncode == 0, result.stderr
    assert len(sb.age_artifacts()) == 1
    assert not sb.plaintext_artifacts()


def test_missing_passphrase_file_fails_closed_no_plaintext_fallback(tmp_path):
    """A configured but nonexistent passphrase file fails with 'passphrase file missing
    or empty' and never falls back to a plaintext artifact."""
    sb = Sandbox(tmp_path)
    nonexistent = tmp_path / "does-not-exist-passphrase"
    result = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(nonexistent)})
    assert result.returncode != 0
    assert "passphrase file missing or empty" in result.stderr
    assert not sb.artifacts(), "must never fall back to a plaintext artifact"
    assert not sb.encrypted_artifacts()
    assert not sb.partials()


def test_empty_passphrase_file_fails_closed(tmp_path):
    """An empty passphrase file fails the run and publishes neither a plaintext nor an
    encrypted artifact."""
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
    """The passphrase file's contents appear in neither stdout, stderr nor the health
    file."""
    secret_marker = "SUPER-SECRET-PASSPHRASE-MARKER-a1b2c3"
    sb = Sandbox(tmp_path)
    passphrase_file = _make_passphrase_file(tmp_path, content=secret_marker)
    result = sb.run(extra_env={"MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(passphrase_file)})
    assert result.returncode == 0, result.stderr
    assert secret_marker not in result.stdout
    assert secret_marker not in result.stderr
    assert secret_marker not in sb.health_file.read_text(encoding="utf-8")


def test_encryption_status_recorded_in_health_file_and_preserved_on_later_failure(tmp_path):
    """LAST_ARTIFACT_ENCRYPTED=true is recorded after an encrypted success and is
    preserved when a later run fails."""
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
    """A failed backup prints a [SECURITY-ALERT] JSON line with condition backup_failed,
    severity critical and component mysql-backup."""
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
    """A gpg failure emits a security alert with condition backup_encryption_failed,
    distinguishable from the generic backup_failed."""
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
    """A second identical failure within the dedup window emits no further
    [SECURITY-ALERT] line."""
    sb = Sandbox(tmp_path, container_running=False)
    r1 = sb.run()
    r2 = sb.run()
    assert "[SECURITY-ALERT]" in r1.stdout
    assert "[SECURITY-ALERT]" not in r2.stdout, "a repeated identical failure within the dedup window must not storm"


def test_successful_backup_emits_no_alert(tmp_path):
    """A successful backup emits no [SECURITY-ALERT] line."""
    sb = Sandbox(tmp_path)
    result = sb.run()
    assert result.returncode == 0, result.stderr
    assert "[SECURITY-ALERT]" not in result.stdout


def test_retention_rotates_both_plaintext_and_encrypted_artifacts(tmp_path):
    """Retention removes old artifacts of both kinds (.sql.gz and .sql.gz.gpg), leaving
    only the newly created encrypted artifact."""
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


# ---------------------------------------------------------------------------
# Credential source and dump scope (live-DB backup, 2026-11-10)
# ---------------------------------------------------------------------------

RECORDING_DOCKER = """#!/usr/bin/env bash
# Fake docker that records `docker exec` argv and stdin, never the real daemon.
if [[ "$1" == "ps" ]]; then echo "fake-mysql-1"; exit 0; fi
if [[ "$1" == "exec" ]]; then
  printf '%s\\n' "$@" > "{argv_file}"
  cat > "{stdin_file}"
  printf -- "-- fake sql dump\\nSELECT 1;\\n"; exit 0
fi
exit 1
"""


def _recording_sandbox(tmp_path):
    sb = Sandbox(tmp_path)
    sb.env_file.write_text("MYSQL_ROOT_PASSWORD=test-password-not-real\n", encoding="utf-8")   # a real newline, unlike the template default
    argv_file, stdin_file = tmp_path / "exec-argv.txt", tmp_path / "exec-stdin.txt"
    (sb.bin_dir / "docker").write_text(RECORDING_DOCKER.format(argv_file=argv_file, stdin_file=stdin_file), encoding="utf-8")
    return sb, argv_file, stdin_file


def test_default_credentials_reach_mysqldump_only_through_a_defaults_file(tmp_path):
    sb, argv_file, stdin_file = _recording_sandbox(tmp_path)
    result = sb.run()
    assert result.returncode == 0, result.stderr
    argv = argv_file.read_text(encoding="utf-8")
    assert "MYSQL_PWD" not in argv and "-uroot" not in argv
    assert "test-password-not-real" not in argv
    assert "--defaults-extra-file=" in argv
    assert "--all-databases" in argv
    assert stdin_file.read_text(encoding="utf-8") == "[client]\nuser=root\npassword=test-password-not-real\n"
    assert "test-password-not-real" not in result.stdout + result.stderr


def test_password_file_user_and_databases_are_honoured(tmp_path):
    sb, argv_file, stdin_file = _recording_sandbox(tmp_path)
    pw = tmp_path / "obai_backup.pass"
    pw.write_text("file-password-not-real", encoding="utf-8")
    pw.chmod(0o600)
    result = sb.run({"MYSQL_BACKUP_PASSWORD_FILE": str(pw), "MYSQL_BACKUP_USER": "obai_backup",
                     "MYSQL_BACKUP_DATABASES": "omnibioai,limsdb model_registry"})
    assert result.returncode == 0, result.stderr
    argv = argv_file.read_text(encoding="utf-8").splitlines()
    assert "--all-databases" not in argv
    assert argv[argv.index("--databases") + 1:argv.index("--databases") + 4] == ["omnibioai", "limsdb", "model_registry"]
    assert stdin_file.read_text(encoding="utf-8") == "[client]\nuser=obai_backup\npassword=file-password-not-real\n"
    assert "file-password-not-real" not in "\n".join(argv) + result.stdout + result.stderr
    assert sb.health()["LAST_RESULT"] == "success"


def test_password_file_takes_precedence_and_root_password_is_not_required(tmp_path):
    sb, _, stdin_file = _recording_sandbox(tmp_path)
    sb.env_file.write_text("", encoding="utf-8")   # no MYSQL_ROOT_PASSWORD at all
    pw = tmp_path / "obai_backup.pass"
    pw.write_text("only-source", encoding="utf-8")
    pw.chmod(0o600)
    result = sb.run({"MYSQL_BACKUP_PASSWORD_FILE": str(pw), "MYSQL_ROOT_PASSWORD": ""})
    assert result.returncode == 0, result.stderr
    assert stdin_file.read_text(encoding="utf-8").endswith("password=only-source\n")


@pytest.mark.parametrize("setup", ["missing", "empty", "world-readable"])
def test_bad_password_file_fails_closed_before_any_dump(tmp_path, setup):
    sb, argv_file, _ = _recording_sandbox(tmp_path)
    pw = tmp_path / "obai_backup.pass"
    if setup != "missing":
        pw.write_text("" if setup == "empty" else "leaky", encoding="utf-8")
        pw.chmod(0o644 if setup == "world-readable" else 0o600)
    result = sb.run({"MYSQL_BACKUP_PASSWORD_FILE": str(pw)})
    assert result.returncode != 0
    assert not argv_file.exists(), "mysqldump must not run"
    assert sb.artifacts() == []
    assert sb.health()["LAST_RESULT"] == "failure"
    assert sb.health()["LAST_STAGE"] == "credentials"


# ---------------------------------------------------------------------------
# Per-job extra mysqldump flags (MYSQL_BACKUP_DUMP_EXTRA_ARGS, audit ledger job)
# ---------------------------------------------------------------------------

FIXED_DUMP_FLAGS = ["--single-transaction", "--quick", "--lock-tables=false", "--no-tablespaces"]


def _dump_flags(argv_file):
    """mysqldump flags from the recorded docker exec argv: everything after the
    `sh -c <script> sh` wrapper."""
    argv = argv_file.read_text(encoding="utf-8").splitlines()
    return argv[argv.index("sh", argv.index("-c") + 2) + 1:]


@pytest.mark.parametrize("value", [None, "", "   "])
def test_unset_or_empty_extra_args_leave_the_dump_flags_unchanged(tmp_path, value):
    sb, argv_file, _ = _recording_sandbox(tmp_path)
    result = sb.run(None if value is None else {"MYSQL_BACKUP_DUMP_EXTRA_ARGS": value})
    assert result.returncode == 0, result.stderr
    assert _dump_flags(argv_file) == FIXED_DUMP_FLAGS + ["--all-databases"]


def test_skip_triggers_is_passed_through_before_the_dump_scope(tmp_path):
    sb, argv_file, _ = _recording_sandbox(tmp_path)
    result = sb.run({"MYSQL_BACKUP_DUMP_EXTRA_ARGS": "--skip-triggers",
                     "MYSQL_BACKUP_DATABASES": "omnibioai_audit"})
    assert result.returncode == 0, result.stderr
    assert _dump_flags(argv_file) == FIXED_DUMP_FLAGS + ["--skip-triggers", "--databases", "omnibioai_audit"]
    assert sb.health()["LAST_RESULT"] == "success"


def test_every_allow_listed_flag_is_accepted(tmp_path):
    sb, argv_file, _ = _recording_sandbox(tmp_path)
    flags = ["--skip-triggers", "--single-transaction", "--routines", "--events", "--no-tablespaces"]
    result = sb.run({"MYSQL_BACKUP_DUMP_EXTRA_ARGS": "  ".join(flags)})
    assert result.returncode == 0, result.stderr
    assert _dump_flags(argv_file) == FIXED_DUMP_FLAGS + flags + ["--all-databases"]


@pytest.mark.parametrize("value", [
    "--where=1=1",
    "--skip-triggers --result-file=/tmp/x",
    "--password=leaked-not-real",
    "--skip-triggers=1",
    "-x",
    "--routines;rm",
    "*",
])
def test_disallowed_extra_arg_fails_closed_before_any_dump(tmp_path, value):
    sb, argv_file, _ = _recording_sandbox(tmp_path)
    result = sb.run({"MYSQL_BACKUP_DUMP_EXTRA_ARGS": value})
    assert result.returncode != 0
    assert not argv_file.exists(), "mysqldump must not run"
    assert sb.artifacts() == [] and sb.partials() == []
    assert sb.health()["LAST_RESULT"] == "failure"
    assert sb.health()["LAST_STAGE"] == "config"
    assert "MYSQL_BACKUP_DUMP_EXTRA_ARGS" in result.stderr
    assert "leaked-not-real" not in result.stdout + result.stderr


# ---------------------------------------------------------------------------
# age encryption (2026-11-12): real age with throwaway keys, never a real key
# ---------------------------------------------------------------------------

def _shim(sb, name, body):
    f = sb.bin_dir / name
    f.write_text(f"#!/usr/bin/env bash\n{body}\n", encoding="utf-8")
    f.chmod(0o755)


def test_age_round_trip_recovers_the_dump_with_the_identity_only(tmp_path):
    """The published .age decrypts with the matching identity to exactly what mysqldump
    emitted; the artifact is age ciphertext (age header), not gzip."""
    dump_body = "-- fake sql dump\\nCREATE TABLE t (id INT);\\nINSERT INTO t VALUES (1);\\n"
    sb = Sandbox(tmp_path, mysqldump_output=dump_body)
    result = sb.run()
    assert result.returncode == 0, result.stderr
    artifact = sb.age_artifacts()[0]
    raw = artifact.read_bytes()
    assert raw.startswith(b"age-encryption.org/v1\n")
    assert raw[:2] != b"\x1f\x8b"
    dec = _age_decrypt(artifact, sb.age_identity)
    assert dec.returncode == 0, dec.stderr
    import gzip as gzip_module
    assert gzip_module.decompress(dec.stdout).decode() == dump_body.replace("\\n", "\n")
    assert sb.health()["LAST_ARTIFACT"] == str(artifact)


def test_age_artifact_does_not_decrypt_with_another_identity(tmp_path):
    sb = Sandbox(tmp_path)
    assert sb.run().returncode == 0
    other_identity, _ = _make_age_keypair(tmp_path, "other")
    assert _age_decrypt(sb.age_artifacts()[0], other_identity).returncode != 0


def test_age_checksum_covers_the_ciphertext(tmp_path):
    sb = Sandbox(tmp_path)
    assert sb.run().returncode == 0
    artifact = sb.age_artifacts()[0]
    check = subprocess.run(["sha256sum", "-c", artifact.name + ".sha256"], cwd=artifact.parent,
                           capture_output=True, text=True, timeout=10, check=False)
    assert check.returncode == 0, check.stdout + check.stderr


def test_private_key_in_recipient_file_is_refused_and_never_printed(tmp_path):
    """Installing the identity instead of the public key must fail closed before the
    dump, and the key material must not reach any output."""
    sb, argv_file, _ = _recording_sandbox(tmp_path)
    secret = sb.age_identity.read_text(encoding="utf-8")
    sb.age_recipient.write_text(secret, encoding="utf-8")
    result = sb.run()
    assert result.returncode != 0
    assert "private key" in result.stderr
    assert not argv_file.exists(), "mysqldump must not run"
    assert list(sb.backup_dir.iterdir()) == []
    key_line = next(line for line in secret.splitlines() if line.startswith("AGE-SECRET-KEY-"))
    assert key_line not in result.stdout + result.stderr
    assert key_line not in sb.health_file.read_text(encoding="utf-8")


def test_recipient_file_without_age1_key_fails_closed(tmp_path):
    sb = Sandbox(tmp_path)
    sb.age_recipient.write_text("# no key here\nnot-a-recipient\n", encoding="utf-8")
    result = sb.run()
    assert result.returncode != 0
    assert "no age1" in result.stderr
    assert list(sb.backup_dir.iterdir()) == []


def test_age_failure_fails_closed_with_no_artifact_and_a_distinct_alert(tmp_path):
    """age exiting non-zero: no plaintext, no ciphertext, no .partial, stage encrypt,
    alert backup_encryption_failed."""
    sb = Sandbox(tmp_path)
    _shim(sb, "age", "cat > /dev/null; echo 'fake age failure' >&2; exit 3")
    result = sb.run()
    assert result.returncode != 0
    assert "age encryption failed" in result.stderr
    assert list(sb.backup_dir.iterdir()) == []
    h = sb.health()
    assert h["LAST_RESULT"] == "failure" and h["LAST_STAGE"] == "encrypt"
    line = next(line for line in result.stdout.splitlines() if line.startswith("[SECURITY-ALERT] "))
    assert json.loads(line[len("[SECURITY-ALERT] "):])["condition"] == "backup_encryption_failed"


def test_age_that_dies_immediately_does_not_hang_or_publish(tmp_path):
    """age exiting before reading anything (SIGPIPE upstream) still fails closed."""
    sb = Sandbox(tmp_path, mysqldump_output="-- x\\n" * 2000)
    _shim(sb, "age", "exit 1")
    result = sb.run()
    assert result.returncode != 0
    assert sb.health()["LAST_STAGE"] == "encrypt"
    assert list(sb.backup_dir.iterdir()) == []


def test_output_without_age_header_is_not_published(tmp_path):
    sb = Sandbox(tmp_path)
    _shim(sb, "age", "cat")   # "succeeds" but writes the gzip stream unencrypted
    result = sb.run()
    assert result.returncode != 0
    assert "no age header" in result.stderr
    assert list(sb.backup_dir.iterdir()) == []


def test_corrupt_compressed_stream_fails_the_integrity_check(tmp_path):
    """gzip -t runs on the same bytes age encrypts; a corrupt stream is not published."""
    sb = Sandbox(tmp_path)
    real_gzip = subprocess.run(["bash", "-c", "command -v gzip"], capture_output=True,
                               text=True, check=True).stdout.strip()
    _shim(sb, "gzip", f'if [[ "${{1:-}}" == -t ]]; then exec {real_gzip} "$@"; fi\n'
                      f'{real_gzip} | head -c 20; cat > /dev/null')
    result = sb.run()
    assert result.returncode != 0
    assert "integrity check" in result.stderr
    assert sb.health()["LAST_STAGE"] == "verify"
    assert list(sb.backup_dir.iterdir()) == []


def test_mysqldump_failure_in_age_mode_reports_the_dump_stage(tmp_path):
    sb = Sandbox(tmp_path, mysqldump_exit=2)
    result = sb.run()
    assert result.returncode != 0
    assert sb.health()["LAST_STAGE"] == "dump"
    assert list(sb.backup_dir.iterdir()) == []


def test_retention_rotates_age_artifacts_too(tmp_path):
    sb = Sandbox(tmp_path)
    old = sb.backup_dir / "omnibioai_20200103_000000.sql.gz.age"
    old.write_bytes(b"age-encryption.org/v1\n" + b"0" * 50)
    old.with_suffix(old.suffix + ".sha256").write_text("deadbeef  fake\n")
    os.utime(old, (1_000_000, 1_000_000))
    result = sb.run(extra_env={"RETAIN_DAYS": "7"})
    assert result.returncode == 0, result.stderr
    assert not old.exists()
    assert len(sb.age_artifacts()) == 1


# ---------------------------------------------------------------------------
# Accounts and grants dump (2026-11-12, opt-in MYSQL_BACKUP_ACCOUNTS=1)
# ---------------------------------------------------------------------------

ACCOUNTS_DOCKER = """#!/usr/bin/env bash
# Fake docker: tells the mysqldump exec from the accounts exec by the script,
# records each exec's argv and stdin; never the real daemon.
if [[ "$1" == "ps" ]]; then echo "fake-mysql-1"; exit 0; fi
if [[ "$1" == "exec" ]]; then
  if [[ "$*" == *print_identified_with_as_hex* ]]; then
    printf '%s\\n' "$@" > "{dir}/accounts-argv.txt"; cat > "{dir}/accounts-stdin.txt"
    [[ -n "${{FAKE_ACCOUNTS_EXIT:-}}" ]] && {{ echo "ERROR 1044 fake" >&2; exit "$FAKE_ACCOUNTS_EXIT"; }}
    printf -- "-- accounts: 1\\nCREATE USER IF NOT EXISTS \\x60svc\\x60@\\x60%%\\x60 IDENTIFIED WITH 'caching_sha2_password' AS 0xFAKEHASH;\\nGRANT USAGE ON *.* TO \\x60svc\\x60@\\x60%%\\x60;\\n"
    exit 0
  fi
  cat > /dev/null
  printf -- "-- fake sql dump\\nSELECT 1;\\n"; exit 0
fi
exit 1
"""


def _accounts_sandbox(tmp_path):
    sb = Sandbox(tmp_path)
    sb.env_file.write_text("MYSQL_ROOT_PASSWORD=test-password-not-real\n", encoding="utf-8")
    (sb.bin_dir / "docker").write_text(ACCOUNTS_DOCKER.format(dir=tmp_path), encoding="utf-8")
    return sb


def _accounts_artifacts(sb):
    return sorted(sb.backup_dir.glob("omnibioai_accounts_*.sql.gz.age"))


def _data_artifacts(sb):
    return [p for p in sb.age_artifacts() if not p.name.startswith("omnibioai_accounts_")]


def test_accounts_dump_is_off_by_default(tmp_path):
    sb = _accounts_sandbox(tmp_path)
    assert sb.run().returncode == 0
    assert _accounts_artifacts(sb) == []
    assert not (tmp_path / "accounts-argv.txt").exists()


def test_accounts_dump_is_age_encrypted_next_to_the_data_dump(tmp_path):
    sb = _accounts_sandbox(tmp_path)
    result = sb.run({"MYSQL_BACKUP_ACCOUNTS": "1"})
    assert result.returncode == 0, result.stderr
    [data] = _data_artifacts(sb)
    [acct] = _accounts_artifacts(sb)
    # Same timestamp as the data dump it belongs to.
    assert acct.name == data.name.replace("omnibioai_", "omnibioai_accounts_", 1)
    raw = acct.read_bytes()
    assert raw.startswith(b"age-encryption.org/v1\n") and b"FAKEHASH" not in raw
    dec = _age_decrypt(acct, sb.age_identity)
    assert dec.returncode == 0, dec.stderr
    import gzip as gzip_module
    sql = gzip_module.decompress(dec.stdout).decode()
    assert "CREATE USER IF NOT EXISTS `svc`@`%`" in sql and "GRANT USAGE" in sql
    check = subprocess.run(["sha256sum", "-c", acct.name + ".sha256"], cwd=acct.parent,
                           capture_output=True, text=True, timeout=10, check=False)
    assert check.returncode == 0, check.stdout + check.stderr
    # Never plaintext on disk: every file in the backup dir is ciphertext or a checksum.
    for f in sb.backup_dir.iterdir():
        assert f.name.endswith((".age", ".sha256")), f.name
        assert b"FAKEHASH" not in f.read_bytes()
    assert sb.partials() == []


def test_accounts_credentials_reach_the_container_only_on_stdin(tmp_path):
    sb = _accounts_sandbox(tmp_path)
    pw = tmp_path / "obai_backup.pass"
    pw.write_text("file-password-not-real", encoding="utf-8")
    pw.chmod(0o600)
    result = sb.run({"MYSQL_BACKUP_ACCOUNTS": "1", "MYSQL_BACKUP_PASSWORD_FILE": str(pw),
                     "MYSQL_BACKUP_USER": "obai_backup"})
    assert result.returncode == 0, result.stderr
    argv = (tmp_path / "accounts-argv.txt").read_text(encoding="utf-8")
    assert "file-password-not-real" not in argv + result.stdout + result.stderr
    assert "--defaults-extra-file" in argv and "NOT LIKE 'mysql.%'" in argv
    assert (tmp_path / "accounts-stdin.txt").read_text(encoding="utf-8") == \
        "[client]\nuser=obai_backup\npassword=file-password-not-real\n"


def test_accounts_failure_keeps_the_data_dump_and_fails_the_run(tmp_path):
    sb = _accounts_sandbox(tmp_path)
    result = sb.run({"MYSQL_BACKUP_ACCOUNTS": "1", "FAKE_ACCOUNTS_EXIT": "1"})
    assert result.returncode != 0
    assert "SELECT on mysql.*" in result.stderr
    [data] = _data_artifacts(sb)
    assert (sb.backup_dir / (data.name + ".sha256")).exists()
    assert _accounts_artifacts(sb) == [] and sb.partials() == []
    health = sb.health()
    assert health["LAST_RESULT"] == "failure" and health["LAST_STAGE"] == "accounts"
    assert health["LAST_ARTIFACT"] == str(data) and health["LAST_SUCCESS_TS"]


def test_accounts_dump_is_refused_in_gpg_mode(tmp_path):
    sb = _accounts_sandbox(tmp_path)
    passphrase_file = _make_passphrase_file(tmp_path)
    result = sb.run({"MYSQL_BACKUP_ACCOUNTS": "1",
                     "MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE": str(passphrase_file)})
    assert result.returncode != 0
    assert "needs age encryption" in result.stderr
    assert list(sb.backup_dir.iterdir()) == []


def test_retention_rotates_accounts_with_their_data_dump(tmp_path):
    sb = _accounts_sandbox(tmp_path)
    old_data = sb.backup_dir / "omnibioai_20200103_000000.sql.gz.age"
    old_acct = sb.backup_dir / "omnibioai_accounts_20200103_000000.sql.gz.age"
    for f in (old_data, old_acct):
        f.write_bytes(b"age-encryption.org/v1\n" + b"0" * 50)
        f.with_suffix(f.suffix + ".sha256").write_text("deadbeef  fake\n")
        os.utime(f, (1_000_000, 1_000_000))
    result = sb.run({"MYSQL_BACKUP_ACCOUNTS": "1", "RETAIN_DAYS": "7"})
    assert result.returncode == 0, result.stderr
    assert not old_data.exists() and not old_acct.exists()
    assert not old_acct.with_suffix(old_acct.suffix + ".sha256").exists()
    assert len(_data_artifacts(sb)) == 1 and len(_accounts_artifacts(sb)) == 1


def test_accounts_files_are_not_rotated_as_data_dumps(tmp_path):
    """Retention selects data dumps only; old accounts files go only with the data
    dump of the same timestamp, so orphans are left alone."""
    sb = _accounts_sandbox(tmp_path)
    for ts in ("20200101_000000", "20200102_000000"):
        f = sb.backup_dir / f"omnibioai_accounts_{ts}.sql.gz.age"
        f.write_bytes(b"age-encryption.org/v1\n" + b"0" * 50)
        os.utime(f, (1_000_000, 1_000_000))
    result = sb.run({"MYSQL_BACKUP_ACCOUNTS": "1", "RETAIN_DAYS": "7"})
    assert result.returncode == 0, result.stderr
    assert len(_data_artifacts(sb)) == 1
    # Orphan accounts files (no data dump of that timestamp) are left alone.
    assert (sb.backup_dir / "omnibioai_accounts_20200101_000000.sql.gz.age").exists()
