"""Safety and state tests for the local encrypted Redis backup workflow."""
import subprocess
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / "scripts" / "backup-redis.sh"
VERIFY = ROOT / "scripts" / "verify-redis-backup.sh"
HEALTH = ROOT / "scripts" / "redis-backup-health-check.sh"
ACL_SYNC = ROOT / "scripts" / "check-redis-acl-sync.sh"
RESTORE_RECORD = ROOT / "scripts" / "record-redis-restore-verification.py"
HEALTH_STATE = ROOT / "scripts" / "update-redis-backup-health.py"
RETAIN = ROOT / "scripts" / "retain-redis-backups.py"
SCHEDULE = ROOT / "scripts" / "redis-backup.cron"


def run(script, *args, env=None):
    merged = {"PATH": "/usr/bin:/bin"}
    merged.update(env or {})
    return subprocess.run(["bash", str(script), *args], capture_output=True, text=True, env=merged, timeout=10)


def test_scripts_have_valid_shell_syntax():
    for script in (BACKUP, VERIFY, HEALTH, ACL_SYNC):
        assert subprocess.run(["bash", "-n", str(script)]).returncode == 0


def restore_fixture(tmp_path, *, state="VERIFIED", include_backup=True, checksum=None):
    tmp_path.mkdir(parents=True, exist_ok=True)
    artifact = tmp_path / "redis-backup-test.tar.gz.gpg"
    artifact.write_bytes(b"immutable-encrypted-artifact")
    digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    manifest = {
        "state": state, "restore_verified": False, "sha256": checksum or digest,
        "artifact_size_bytes": artifact.stat().st_size, "default_user": "off",
        "contains": ["dump.rdb", "users.acl"], "acl_user_count": 2,
        "contains_redis_backup": include_backup,
    }
    manifest_path = tmp_path / "redis-backup-test.manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    evidence = {
        "artifact": artifact.name, "artifact_sha256": digest, "restore_result": "PASS",
        "restore_verification_timestamp_utc": "2026-09-26T17:00:00Z",
        "rto_result": "PASS", "structural_recovery_result": "PASS",
        "acl_verification_result": "PASS", "default_off_verification_result": "PASS",
        "unauthenticated_noauth_result": "PASS", "redis_admin_recovery_result": "PASS",
        "redis_backup_recovery_result": "PASS", "acl_identity_count": 2,
        "default_user": "off", "measured_rto_seconds": 7.793,
        "rto_target_seconds": 1800, "verification_implementation": "test-v1",
    }
    evidence_path = tmp_path / "evidence.json"
    evidence_path.write_text(json.dumps(evidence), encoding="utf-8")
    return artifact, manifest_path, evidence_path, evidence


def record_restore(artifact, evidence):
    return subprocess.run(["python3", str(RESTORE_RECORD), str(artifact), str(evidence)], capture_output=True, text=True)


def test_restore_verified_transition_is_atomic_checksum_bound_and_idempotent(tmp_path):
    artifact, _, evidence_path, _ = restore_fixture(tmp_path)
    before = hashlib.sha256(artifact.read_bytes()).hexdigest()
    first = record_restore(artifact, evidence_path)
    assert first.returncode == 0
    sidecar = tmp_path / "redis-backup-test.restore-verified.json"
    record = json.loads(sidecar.read_text())
    assert record["state"] == "RESTORE-VERIFIED"
    assert record["artifact_sha256"] == before
    assert hashlib.sha256(artifact.read_bytes()).hexdigest() == before
    second = record_restore(artifact, evidence_path)
    assert second.returncode == 0
    assert sidecar.read_text() == json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n"


def test_restore_verified_rejects_invalid_states_checksum_unknown_and_incomplete(tmp_path):
    for state in ("CREATED", "ENCRYPTED", "COPIED"):
        artifact, _, evidence, _ = restore_fixture(tmp_path / state, state=state)
        assert record_restore(artifact, evidence).returncode != 0
    artifact, _, evidence, _ = restore_fixture(tmp_path / "checksum", checksum="0" * 64)
    assert record_restore(artifact, evidence).returncode != 0
    artifact, _, evidence, _ = restore_fixture(tmp_path / "old", include_backup=False)
    assert record_restore(artifact, evidence).returncode != 0
    artifact, _, evidence, _ = restore_fixture(tmp_path / "bad")
    data = json.loads(evidence.read_text()); data["restore_result"] = "FAIL"; evidence.write_text(json.dumps(data))
    assert record_restore(artifact, evidence).returncode != 0


def test_restore_verified_rejects_malformed_and_atomic_write_failure(tmp_path):
    artifact, _, evidence, _ = restore_fixture(tmp_path / "malformed")
    evidence.write_text("not-json")
    assert record_restore(artifact, evidence).returncode != 0
    artifact, _, evidence, _ = restore_fixture(tmp_path / "readonly")
    artifact.parent.chmod(0o500)
    try:
        assert record_restore(artifact, evidence).returncode != 0
    finally:
        artifact.parent.chmod(0o700)


def test_restore_record_contains_no_secret_fields(tmp_path):
    artifact, _, evidence, _ = restore_fixture(tmp_path)
    assert record_restore(artifact, evidence).returncode == 0
    text = (tmp_path / "redis-backup-test.restore-verified.json").read_text().lower()
    assert "password" not in text and "payload" not in text and "token" not in text


def test_lock_contention_preserves_last_good_health_and_records_attempt(tmp_path):
    health = tmp_path / "health.env"
    health.write_text("LAST_RESULT=success\nLAST_ARTIFACT_STATE=VERIFIED\nLAST_ARTIFACT=good\n", encoding="utf-8")
    result = subprocess.run(["python3", str(HEALTH_STATE), str(health), "--attempt-result", "lock_contention", "--stage", "lock"], capture_output=True, text=True)
    assert result.returncode == 0
    text = health.read_text()
    assert "LAST_RESULT=success" in text
    assert "LAST_ATTEMPT_RESULT=lock_contention" in text
    assert "LAST_LOCK_CONTENTION_COUNT=1" in text


def test_real_failure_records_attempt_without_erasing_last_good(tmp_path):
    health = tmp_path / "health.env"
    health.write_text("LAST_RESULT=success\nLAST_ARTIFACT_STATE=VERIFIED\n", encoding="utf-8")
    subprocess.run(["python3", str(HEALTH_STATE), str(health), "--attempt-result", "failure", "--stage", "verification"], check=True)
    text = health.read_text()
    assert "LAST_RESULT=success" in text
    assert "LAST_ATTEMPT_RESULT=failure" in text


def test_retention_keeps_recent_points_and_daily_points(tmp_path):
    import datetime
    now = datetime.datetime.fromisoformat("2026-09-26T12:00:00+00:00")
    for index in range(288):
        timestamp = now - datetime.timedelta(minutes=5 * index)
        stamp = timestamp.strftime("%Y%m%dT%H%M%SZ")
        artifact = tmp_path / f"redis-backup-{stamp}.tar.gz.gpg"
        artifact.write_bytes(f"artifact-{index}".encode())
        digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
        (tmp_path / f"redis-backup-{stamp}.manifest.json").write_text(json.dumps({
            "state": "VERIFIED", "sha256": digest, "artifact_size_bytes": artifact.stat().st_size,
            "snapshot_timestamp_utc": timestamp.isoformat().replace("+00:00", "Z")
        }), encoding="utf-8")
    for index in range(1, 16):
        timestamp = now - datetime.timedelta(days=index, hours=1)
        stamp = timestamp.strftime("%Y%m%dT%H%M%SZ")
        artifact = tmp_path / f"redis-backup-{stamp}.tar.gz.gpg"
        artifact.write_bytes(f"daily-{index}".encode())
        digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
        (tmp_path / f"redis-backup-{stamp}.manifest.json").write_text(json.dumps({
            "state": "VERIFIED", "sha256": digest, "artifact_size_bytes": artifact.stat().st_size,
            "snapshot_timestamp_utc": timestamp.isoformat().replace("+00:00", "Z")
        }), encoding="utf-8")
    result = subprocess.run(["python3", str(RETAIN), str(tmp_path), "--now", "2026-09-26T12:00:00Z"], capture_output=True, text=True)
    assert result.returncode == 0
    remaining = list(tmp_path.glob("*.tar.gz.gpg"))
    assert len(remaining) == 302
    assert (tmp_path / "redis-backup-20260926T120000Z.tar.gz.gpg").exists()


def test_retention_preserves_malformed_and_restore_verified_units(tmp_path):
    import datetime
    malformed = tmp_path / "redis-backup-20200101T000000Z.tar.gz.gpg"
    malformed.write_bytes(b"unknown")
    restore = tmp_path / "redis-backup-20200102T000000Z.tar.gz.gpg"
    restore.write_bytes(b"restore")
    digest = hashlib.sha256(restore.read_bytes()).hexdigest()
    (tmp_path / "redis-backup-20200102T000000Z.manifest.json").write_text(json.dumps({"state":"VERIFIED","sha256":digest,"artifact_size_bytes":restore.stat().st_size,"snapshot_timestamp_utc":"2020-01-02T00:00:00Z"}), encoding="utf-8")
    (tmp_path / "redis-backup-20200102T000000Z.restore-verified.json").write_text(json.dumps({"state":"RESTORE-VERIFIED","artifact":restore.name,"artifact_sha256":digest}), encoding="utf-8")
    result = subprocess.run(["python3", str(RETAIN), str(tmp_path), "--now", "2026-09-26T12:00:00Z"])
    assert result.returncode == 0
    assert malformed.exists()
    assert restore.exists() and (tmp_path / "redis-backup-20200102T000000Z.restore-verified.json").exists()


def test_retention_failure_preserves_candidates(tmp_path):
    import datetime
    now = datetime.datetime.fromisoformat("2026-09-26T12:00:00+00:00")
    fixtures = [(now - datetime.timedelta(minutes=5 * index), f"recent-{index}".encode()) for index in range(288)]
    fixtures += [(now - datetime.timedelta(days=day, hours=1), f"daily-{day}".encode()) for day in range(1, 17)]
    for timestamp, payload in fixtures:
        stamp = timestamp.strftime("%Y%m%dT%H%M%SZ")
        artifact = tmp_path / f"redis-backup-{stamp}.tar.gz.gpg"
        artifact.write_bytes(payload)
        digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
        (tmp_path / f"redis-backup-{stamp}.manifest.json").write_text(json.dumps({
            "state": "VERIFIED", "sha256": digest, "artifact_size_bytes": artifact.stat().st_size,
            "snapshot_timestamp_utc": timestamp.isoformat().replace("+00:00", "Z")
        }), encoding="utf-8")
    tmp_path.chmod(0o500)
    try:
        result = subprocess.run(["python3", str(RETAIN), str(tmp_path), "--now", "2026-09-26T12:00:00Z"], capture_output=True, text=True)
        assert result.returncode != 0
        assert (tmp_path / "redis-backup-20260910T110000Z.tar.gz.gpg").exists()
    finally:
        tmp_path.chmod(0o700)


def test_scheduler_is_five_minute_named_workflow_without_credentials():
    text = SCHEDULE.read_text()
    assert "*/5 * * * *" in text
    assert "backup-redis.sh" in text
    assert "REDISCLI_AUTH" not in text
    assert ".pass" not in text


def test_retention_capacity_guard_is_conservative():
    text = BACKUP.read_text()
    assert 'MIN_FREE_BYTES="${REDIS_BACKUP_MIN_FREE_BYTES:-1073741824}"' in text
    assert 'DESTINATION_DEVICE="${REDIS_BACKUP_DESTINATION_DEVICE:-/dev/sda1}"' in text


def test_acl_sync_accepts_matching_metadata_without_hashes(tmp_path):
    runtime = tmp_path / "runtime.acl"
    persisted = tmp_path / "persisted.acl"
    runtime.write_text("user redis_backup on #" + "a" * 64 + " -@all +ping\n", encoding="utf-8")
    persisted.write_text("user redis_backup on #" + "b" * 64 + " -@all +ping\n", encoding="utf-8")
    assert subprocess.run(["bash", str(ACL_SYNC), str(runtime), str(persisted)]).returncode == 0


def test_acl_sync_rejects_identity_and_authorization_drift(tmp_path):
    runtime = tmp_path / "runtime.acl"
    persisted = tmp_path / "persisted.acl"
    runtime.write_text("user redis_backup on -@all +ping\n", encoding="utf-8")
    persisted.write_text("user redis_backup on -@all +ping\nuser redis_monitoring on -@all +ping\n", encoding="utf-8")
    assert subprocess.run(["bash", str(ACL_SYNC), str(runtime), str(persisted)]).returncode != 0
    persisted.write_text("user redis_backup on -@all +ping +info\n", encoding="utf-8")
    assert subprocess.run(["bash", str(ACL_SYNC), str(runtime), str(persisted)]).returncode != 0


def test_acl_sync_rejects_persisted_only_identity(tmp_path):
    runtime = tmp_path / "runtime.acl"
    persisted = tmp_path / "persisted.acl"
    runtime.write_text("user redis_backup on -@all +ping\n", encoding="utf-8")
    persisted.write_text("user redis_backup on -@all +ping\nuser redis_monitoring on -@all +ping\n", encoding="utf-8")
    assert subprocess.run(["bash", str(ACL_SYNC), str(persisted), str(runtime)]).returncode != 0


def test_backup_uses_named_auth_and_no_password_argument():
    text = BACKUP.read_text()
    assert "REDISCLI_AUTH" in text
    assert "--user redis_backup" in text
    assert "redis-cli --pass" not in text
    assert "+@all" not in text


def test_verify_rejects_missing_artifact(tmp_path):
    result = run(VERIFY, str(tmp_path / "missing.tar.gz.gpg"), env={"REDIS_BACKUP_ENCRYPTION_KEY_FILE": str(tmp_path / "key")})
    assert result.returncode != 0


def test_health_rejects_missing_state(tmp_path):
    result = run(HEALTH, env={"REDIS_BACKUP_DESTINATION": str(tmp_path), "REDIS_BACKUP_HEALTH_FILE": str(tmp_path / "missing")})
    assert result.returncode == 1
    assert "missing" in result.stdout.lower()


def test_health_rejects_unverified_state(tmp_path):
    health = tmp_path / "health.env"
    health.write_text("LAST_RESULT=success\nLAST_ARTIFACT_STATE=ENCRYPTED\n", encoding="utf-8")
    result = run(HEALTH, env={"REDIS_BACKUP_DESTINATION": str(tmp_path), "REDIS_BACKUP_HEALTH_FILE": str(health)})
    assert result.returncode == 1


def test_health_rejects_wrong_mount(tmp_path):
    health = tmp_path / "health.env"
    health.write_text("LAST_RESULT=success\nLAST_ARTIFACT_STATE=VERIFIED\n", encoding="utf-8")
    result = run(HEALTH, env={"REDIS_BACKUP_DESTINATION": str(tmp_path), "REDIS_BACKUP_HEALTH_FILE": str(health), "REDIS_BACKUP_DESTINATION_DEVICE": "/dev/sda1"})
    assert result.returncode == 1


def test_manifest_contract_is_nonsecret():
    text = VERIFY.read_text().lower()
    assert "password" not in text
    assert "acl_hash" not in text


def test_restore_verified_is_reserved():
    text = BACKUP.read_text()
    assert "RESTORE-VERIFIED" in text
    assert "no RESTORE-VERIFIED artifact exists" in text
