"""scripts/lib-alert.sh — Track E4 (breadth pass): bash-side vendor-neutral
security alert emission, matching omnibioai-security-audit's
audit/security_alerts.py schema. Tests invoke the real bash function via
a tiny wrapper script, never mocked.

Developer:
    Manish Kumar <manish@omnibioai.org>
"""
import json
import shlex
import subprocess
from pathlib import Path

LIB = Path(__file__).resolve().parent.parent / "scripts" / "lib-alert.sh"


def _run(component, condition, severity, message, *kv_pairs, env_overrides=None, tmp_path=None):
    """Runs emit_security_alert from lib-alert.sh in a real bash subprocess with a
    minimal PATH and a per-test dedup state directory under tmp_path."""
    state_dir = tmp_path / "alert-state" if tmp_path else None
    args = [component, condition, severity, message, *kv_pairs]
    script = f"""
set -euo pipefail
source {shlex.quote(str(LIB))}
emit_security_alert {" ".join(shlex.quote(a) for a in args)}
"""
    env = {"PATH": "/usr/bin:/bin"}
    if state_dir is not None:
        env["BACKUP_ALERT_STATE_DIR"] = str(state_dir)
    if env_overrides:
        env.update(env_overrides)
    return subprocess.run(["bash", "-c", script], capture_output=True, text=True, timeout=10, env=env, check=False)


def _parse_alert_line(stdout: str) -> dict:
    """Extracts and JSON-decodes the first [SECURITY-ALERT] line from the script's
    stdout."""
    line = next(line for line in stdout.splitlines() if line.startswith("[SECURITY-ALERT] "))
    return json.loads(line[len("[SECURITY-ALERT] "):])


def test_emits_a_json_line_with_the_expected_schema(tmp_path):
    """emit_security_alert prints one [SECURITY-ALERT] JSON line carrying condition,
    severity, component, message, metadata and a timestamp."""
    result = _run("mysql-backup", "backup_failed", "critical", "dump failed", "stage=dump", tmp_path=tmp_path)
    assert result.returncode == 0, result.stderr
    alert = _parse_alert_line(result.stdout)
    assert alert["condition"] == "backup_failed"
    assert alert["severity"] == "critical"
    assert alert["component"] == "mysql-backup"
    assert alert["message"] == "dump failed"
    assert alert["metadata"] == {"stage": "dump"}
    assert alert["timestamp"]


def test_no_metadata_args_produces_empty_object(tmp_path):
    """With no key=value arguments, the alert's metadata is an empty object."""
    result = _run("comp", "cond", "warning", "msg", tmp_path=tmp_path)
    alert = _parse_alert_line(result.stdout)
    assert alert["metadata"] == {}


def test_multiple_metadata_pairs(tmp_path):
    """Multiple key=value arguments become string entries in the alert's metadata."""
    result = _run("comp", "cond", "warning", "msg", "a=1", "b=two", tmp_path=tmp_path)
    alert = _parse_alert_line(result.stdout)
    assert alert["metadata"] == {"a": "1", "b": "two"}


def test_repeated_identical_condition_is_deduped_within_window(tmp_path):
    """A repeat of the same condition within the dedup window is suppressed, and the
    dedup state directory is created."""
    state_dir = tmp_path / "alert-state"
    r1 = _run("comp", "cond", "warning", "msg", tmp_path=tmp_path)
    r2 = _run("comp", "cond", "warning", "msg", tmp_path=tmp_path)
    assert "[SECURITY-ALERT]" in r1.stdout
    assert "[SECURITY-ALERT]" not in r2.stdout, "a repeat within the dedup window must be suppressed"
    assert state_dir.exists()


def test_different_conditions_are_not_deduped_against_each_other(tmp_path):
    """Alerts with different conditions do not suppress one another."""
    r1 = _run("comp", "cond-a", "warning", "msg", tmp_path=tmp_path)
    r2 = _run("comp", "cond-b", "warning", "msg", tmp_path=tmp_path)
    assert "[SECURITY-ALERT]" in r1.stdout
    assert "[SECURITY-ALERT]" in r2.stdout


def test_zero_window_allows_immediate_repeat(tmp_path):
    """BACKUP_ALERT_DEDUP_WINDOW_SECONDS=0 lets an identical alert repeat immediately."""
    r1 = _run("comp", "cond", "warning", "msg", tmp_path=tmp_path, env_overrides={"BACKUP_ALERT_DEDUP_WINDOW_SECONDS": "0"})
    r2 = _run("comp", "cond", "warning", "msg", tmp_path=tmp_path, env_overrides={"BACKUP_ALERT_DEDUP_WINDOW_SECONDS": "0"})
    assert "[SECURITY-ALERT]" in r1.stdout
    assert "[SECURITY-ALERT]" in r2.stdout


def test_recovered_condition_bypasses_dedup(tmp_path):
    """After a repeat of restore_verification_failed is deduped, a
    restore_verification_passed_recovered alert is still emitted."""
    _run("comp", "restore_verification_failed", "critical", "msg", tmp_path=tmp_path)
    r2 = _run("comp", "restore_verification_failed", "critical", "msg", tmp_path=tmp_path)  # deduped
    r3 = _run("comp", "restore_verification_passed_recovered", "info", "recovered", tmp_path=tmp_path)
    assert "[SECURITY-ALERT]" not in r2.stdout
    assert "[SECURITY-ALERT]" in r3.stdout


def test_message_with_special_characters_produces_valid_json(tmp_path):
    """A message containing double quotes and a backslash round-trips as valid JSON."""
    result = _run("comp", "cond", "warning", 'a "quoted" message with \\ backslash', tmp_path=tmp_path)
    alert = _parse_alert_line(result.stdout)
    assert alert["message"] == 'a "quoted" message with \\ backslash'


def test_unwritable_state_dir_still_emits_the_alert(tmp_path):
    """Dedup state is best-effort -- a state-dir write failure must never
    suppress or crash alert emission itself (fail toward more alerts)."""
    readonly_parent = tmp_path / "readonly"
    readonly_parent.mkdir(mode=0o500)
    state_dir = readonly_parent / "nested" / "alert-state"
    result = subprocess.run(
        ["bash", "-c", f'source "{LIB}"; emit_security_alert comp cond warning msg'],
        capture_output=True, text=True, timeout=10, check=False,
        env={"PATH": "/usr/bin:/bin", "BACKUP_ALERT_STATE_DIR": str(state_dir)},
    )
    assert result.returncode == 0
    assert "[SECURITY-ALERT]" in result.stdout
    readonly_parent.chmod(0o700)


def test_optional_log_file_receives_the_same_jsonl(tmp_path):
    """With BACKUP_ALERT_LOG_FILE set, the same alert is also written as exactly one
    JSON line to that file."""
    log_file = tmp_path / "alerts.jsonl"
    result = _run("comp", "cond", "warning", "msg", "k=v", tmp_path=tmp_path,
                   env_overrides={"BACKUP_ALERT_LOG_FILE": str(log_file)})
    assert result.returncode == 0, result.stderr
    assert log_file.exists()
    lines = log_file.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    parsed = json.loads(lines[0])
    assert parsed["condition"] == "cond"
    assert parsed["metadata"] == {"k": "v"}
