"""Safety and state tests for the local encrypted Redis backup workflow."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / "scripts" / "backup-redis.sh"
VERIFY = ROOT / "scripts" / "verify-redis-backup.sh"
HEALTH = ROOT / "scripts" / "redis-backup-health-check.sh"
ACL_SYNC = ROOT / "scripts" / "check-redis-acl-sync.sh"


def run(script, *args, env=None):
    merged = {"PATH": "/usr/bin:/bin"}
    merged.update(env or {})
    return subprocess.run(["bash", str(script), *args], capture_output=True, text=True, env=merged, timeout=10)


def test_scripts_have_valid_shell_syntax():
    for script in (BACKUP, VERIFY, HEALTH, ACL_SYNC):
        assert subprocess.run(["bash", "-n", str(script)]).returncode == 0


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
