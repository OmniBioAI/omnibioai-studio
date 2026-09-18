"""scripts/verify-mysql-backup-restore.sh — static regression guards.

Same convention as tests/test_mysql_recovery_drill.py: checks the
script's own text for the isolation/safety properties it must have,
rather than re-running a real docker restore in the test suite (that's
slow and already exercised manually -- see
omnibioai-docs/security/mysql_backup_recovery_evidence.md for the real,
non-mocked restore-proof run against an actual backup artifact).

Developer:
    Manish Kumar <manish@omnibioai.org>
"""
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "verify-mysql-backup-restore.sh"


def test_restore_target_is_network_isolated_and_disposable():
    """The script text starts the restore target with --network none and an
    empty-password throwaway MySQL, installs an EXIT cleanup trap and removes the
    container with docker rm -f."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "--network none" in text
    assert "MYSQL_ALLOW_EMPTY_PASSWORD=yes" in text
    assert "trap cleanup EXIT" in text
    assert "docker rm -f" in text


def test_never_targets_the_real_production_container():
    """The script text never mentions the live omnibioai-studio-mysql-1 container."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "omnibioai-studio-mysql-1" not in text


def test_verifies_integrity_before_restoring():
    """The script text contains both the gzip -t and sha256sum -c integrity checks; only
    their presence is asserted here, not their order."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "gzip -t" in text
    assert "sha256sum -c" in text


def test_compares_declared_vs_restored_structure():
    """The script text creates databases and compares information_schema tables and
    schemata, i.e. declared versus restored structure."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "CREATE DATABASE" in text
    assert "information_schema.tables" in text
    assert "information_schema.schemata" in text


def test_row_content_is_never_selected_only_counts():
    """The script text uses SELECT COUNT(*) row counts and never SELECT *, so row
    contents are not read out."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "SELECT COUNT(*)" in text
    assert "SELECT *" not in text


# ============================================================
# Track E4 — encrypted-artifact decrypt path
# ============================================================
def test_decrypts_gpg_artifacts_and_checks_exit_code_explicitly():
    """The script text branches on .gpg artifacts, runs gpg --batch and checks its exit
    status with an explicit 'if ! gpg' and a 'gpg decryption failed' message instead of
    relying on set -e."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert '"${ARTIFACT}" == *.gpg' in text
    assert "gpg --batch" in text
    # Must be an explicit `if ! gpg ...; then fail` style check, not a bare
    # call relying only on `set -e` (which a `|| true` elsewhere in this
    # script could still shadow) or a swallowed exit code.
    assert "if ! gpg" in text
    assert "gpg decryption failed" in text


def test_decrypt_requires_passphrase_file_env_var_fails_closed_if_unset():
    """The script text references MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE and contains
    an 'is not set' failure message for the unset case."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE" in text
    assert "is not set" in text


def test_checksum_verification_runs_before_decryption():
    """The published artifact (ciphertext, if encrypted) must be checksum-
    verified before any attempt to decrypt it -- corruption must be caught
    as corruption, not surfaced as a confusing decrypt failure."""
    text = SCRIPT.read_text(encoding="utf-8")
    checksum_pos = text.index("sha256sum -c")
    decrypt_pos = text.index("gpg --batch")
    assert checksum_pos < decrypt_pos


# ============================================================
# Track E4 (closure pass) — readiness-race fix + alerting + E3-structure verification
# ============================================================
def test_waits_for_temporary_server_to_stop_before_pinging():
    """Diagnosed root cause of the previously-intermittent restore
    failure: the official mysql:8.0 image runs a throwaway "temporary
    server" first on a fresh (unvolumed) container, which responds to
    `mysqladmin ping` exactly like the real one, then gets replaced.
    Restoring during that window loses the connection mid-stream. Fix:
    wait for the container's own "Temporary server stopped" log line
    before trusting any ping success."""
    text = SCRIPT.read_text(encoding="utf-8")
    # Compare the actual executable lines, not any mention in prose
    # comments above them (which discuss both in explanatory order).
    wait_loop_pos = text.index('grep -q "Temporary server stopped"')
    ping_exec_pos = text.index("docker exec \"${TARGET}\" mysqladmin ping")
    assert wait_loop_pos < ping_exec_pos
    assert "docker logs" in text


def test_readiness_waits_are_bounded_not_infinite():
    """The script text bounds its readiness waits with MYSQL_INIT_WAIT_SECONDS and
    MYSQL_READY_WAIT_SECONDS."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "MYSQL_INIT_WAIT_SECONDS" in text
    assert "MYSQL_READY_WAIT_SECONDS" in text


def test_restore_command_failure_is_explicitly_checked():
    """`docker exec -i ... mysql -uroot < dump` must not be trusted blindly
    under `set -e` alone -- an explicit failure path must exist."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert 'mysql -uroot < "${DECOMPRESSED}" \\' in text or "mysql -uroot < \"${DECOMPRESSED}\"" in text
    restore_pos = text.index('mysql -uroot < "${DECOMPRESSED}"')
    following = text[restore_pos:restore_pos + 200]
    assert "fail" in following


def test_sources_the_shared_alert_library_and_uses_a_fail_helper():
    """The script text sources lib-alert.sh and reports restore_verification_failed
    through emit_security_alert."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "lib-alert.sh" in text
    assert "emit_security_alert" in text
    assert "restore_verification_failed" in text


def test_every_early_failure_path_uses_fail_not_bare_exit():
    """Regression guard: this script used to have several inline
    `{ echo ...; exit 1; }` blocks that bypassed both health-file
    recording and (now) alert emission. All of them must route through
    fail() so no failure path silently skips observability."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "; exit 1; }" not in text, "a bare inline exit bypasses fail()'s health/alert recording"


def test_verifies_e3_audit_hardening_structures_after_restore():
    """The script text checks the restored audit hardening structures:
    record_integrity_hash, audit_legal_holds and information_schema.triggers."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "record_integrity_hash" in text
    assert "audit_legal_holds" in text
    assert "information_schema.triggers" in text


def test_e3_structure_check_targets_the_real_hardened_database_only():
    """Diagnosed during this track: the live host also has an unrelated
    `omnibioai.audit_events` table (a different, older, non-Track-E3
    table). The E3-structure check must target omnibioai_audit
    specifically -- the omnibioai-security-audit service's own
    configured database -- not "whichever same-named table matched
    last" in the unrelated informational row-count loop above it."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "table_schema='omnibioai_audit'" in text


def test_append_only_trigger_is_functionally_probed_not_just_checked_for_existence():
    """The script text functionally probes the append-only trigger with an UPDATE using
    the e4-restore-probe marker, rather than only checking that the trigger exists."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "UPDATE" in text
    assert "e4-restore-probe" in text
