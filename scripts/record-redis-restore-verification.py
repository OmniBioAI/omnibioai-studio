#!/usr/bin/env python3
"""Atomically record non-secret Redis restore-verification metadata."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path


VERSION = "redis-restore-verifier-v1"
REQUIRED_PASS_FIELDS = (
    "restore_result",
    "rto_result",
    "structural_recovery_result",
    "acl_verification_result",
    "default_off_verification_result",
    "unauthenticated_noauth_result",
    "redis_admin_recovery_result",
    "redis_backup_recovery_result",
)


def fail(message: str) -> None:
    raise SystemExit(f"restore verification rejected: {message}")


def sidecar_path(artifact: Path) -> Path:
    name = artifact.name
    suffix = ".tar.gz.gpg"
    if not name.endswith(suffix):
        fail("artifact must use the .tar.gz.gpg format")
    return artifact.with_name(name[: -len(suffix)] + ".restore-verified.json")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path, label: str) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"{label} is not valid JSON: {exc.__class__.__name__}")
    if not isinstance(value, dict):
        fail(f"{label} must be a JSON object")
    return value


def validate_evidence(artifact: Path, manifest: dict, evidence: dict, digest: str) -> dict:
    if manifest.get("state") != "VERIFIED" or manifest.get("restore_verified") is not False:
        fail("source manifest is not exactly VERIFIED")
    if manifest.get("sha256") != digest:
        fail("artifact checksum does not match its manifest")
    if manifest.get("contains_redis_backup") is not True or not isinstance(manifest.get("acl_user_count"), int):
        fail("artifact manifest lacks complete ACL evidence")
    if evidence.get("artifact") != artifact.name:
        fail("evidence is bound to a different artifact")
    if evidence.get("artifact_sha256") != digest:
        fail("evidence checksum does not match the artifact")
    if evidence.get("restore_result") != "PASS":
        fail("restore evidence is not successful")
    for field in REQUIRED_PASS_FIELDS[1:]:
        if evidence.get(field) != "PASS":
            fail(f"{field} is not PASS")
    if evidence.get("acl_identity_count") != manifest["acl_user_count"]:
        fail("ACL identity count does not match the artifact manifest")
    if evidence.get("default_user") != "off":
        fail("restore evidence does not prove default off")
    if not isinstance(evidence.get("measured_rto_seconds"), (int, float)) or evidence["measured_rto_seconds"] < 0:
        fail("measured RTO is invalid")
    if not isinstance(evidence.get("rto_target_seconds"), (int, float)) or evidence["rto_target_seconds"] <= 0:
        fail("RTO target is invalid")
    if evidence.get("rto_result") != "PASS" or evidence["measured_rto_seconds"] > evidence["rto_target_seconds"]:
        fail("RTO evidence does not pass its target")
    if not isinstance(evidence.get("verification_implementation"), str) or not evidence["verification_implementation"]:
        fail("verification implementation is missing")
    verification_timestamp = evidence.get("restore_verification_timestamp_utc")
    if not isinstance(verification_timestamp, str) or not verification_timestamp.endswith("Z"):
        fail("restore verification timestamp is missing or malformed")
    record = {
        "schema_version": 1,
        "state": "RESTORE-VERIFIED",
        "artifact": artifact.name,
        "artifact_sha256": digest,
        "restore_verification_timestamp_utc": verification_timestamp,
        "restore_result": "PASS",
        "measured_rto_seconds": evidence["measured_rto_seconds"],
        "rto_target_seconds": evidence["rto_target_seconds"],
        "rto_result": "PASS",
        "structural_recovery_result": "PASS",
        "acl_verification_result": "PASS",
        "acl_identity_count": evidence["acl_identity_count"],
        "default_user": "off",
        "default_off_verification_result": "PASS",
        "unauthenticated_noauth_result": "PASS",
        "redis_admin_recovery_result": "PASS",
        "redis_backup_recovery_result": "PASS",
        "verification_implementation": evidence["verification_implementation"],
    }
    rpo = evidence.get("rpo")
    if rpo is not None:
        if not isinstance(rpo, dict) or any(not isinstance(rpo.get(k), str) for k in ("cutoff_timestamp_utc", "snapshot_timestamp_utc", "local_verified_timestamp_utc")):
            fail("RPO timing evidence is malformed")
        record["rpo"] = {k: rpo[k] for k in ("cutoff_timestamp_utc", "snapshot_timestamp_utc", "local_verified_timestamp_utc")}
    return record


def atomic_write(path: Path, record: dict) -> None:
    payload = (json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except OSError:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    parser.add_argument("evidence", type=Path)
    args = parser.parse_args()
    artifact = args.artifact
    if not artifact.is_file() or artifact.stat().st_size == 0:
        fail("unknown or empty artifact")
    manifest_path = artifact.with_name(artifact.name.removesuffix(".tar.gz.gpg") + ".manifest.json")
    if not manifest_path.is_file():
        fail("artifact manifest is missing")
    manifest = load_json(manifest_path, "artifact manifest")
    evidence = load_json(args.evidence, "restore evidence")
    digest_before = sha256(artifact)
    record = validate_evidence(artifact, manifest, evidence, digest_before)
    destination = sidecar_path(artifact)
    if destination.exists():
        existing = load_json(destination, "existing restore-verification record")
        if existing == record:
            print(f"RESTORE-VERIFIED idempotent artifact={artifact.name}")
            return 0
        fail("a conflicting restore-verification record already exists")
    try:
        atomic_write(destination, record)
    except OSError as exc:
        fail(f"atomic metadata write failed: {exc.__class__.__name__}")
    if sha256(artifact) != digest_before:
        destination.unlink(missing_ok=True)
        fail("artifact changed during metadata transition")
    print(f"RESTORE-VERIFIED artifact={artifact.name} metadata={destination.name}")
    return 0


if __name__ == "__main__":
    main()
