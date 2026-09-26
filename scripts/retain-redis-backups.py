#!/usr/bin/env python3
"""Conservatively retain Redis backup units (artifact, manifest, optional sidecar)."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path


ARTIFACT_RE = re.compile(r"^redis-backup-(\d{8}T\d{6}Z)\.tar\.gz\.gpg$")
RECOVERY_POINTS = 288
DAILY_POINTS = 14


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def unit_for(artifact: Path) -> dict | None:
    if not ARTIFACT_RE.match(artifact.name):
        return None
    stem = artifact.name.removesuffix(".tar.gz.gpg")
    manifest_path = artifact.with_name(stem + ".manifest.json")
    sidecar_path = artifact.with_name(stem + ".restore-verified.json")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("state") != "VERIFIED" or manifest.get("sha256") != digest(artifact):
            return None
        if manifest.get("artifact_size_bytes") != artifact.stat().st_size:
            return None
        timestamp = parse_time(manifest.get("local_verified_timestamp_utc") or manifest["snapshot_timestamp_utc"])
        sidecar = None
        if sidecar_path.exists():
            sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
            if sidecar.get("state") != "RESTORE-VERIFIED" or sidecar.get("artifact") != artifact.name or sidecar.get("artifact_sha256") != manifest["sha256"]:
                return None
        return {"artifact": artifact, "manifest": manifest_path, "sidecar": sidecar_path if sidecar else None, "timestamp": timestamp, "day": timestamp.date(), "restore_verified": sidecar is not None}
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", type=Path)
    parser.add_argument("--now", help="UTC ISO timestamp for deterministic testing")
    args = parser.parse_args()
    now = parse_time(args.now) if args.now else datetime.now(timezone.utc)
    valid = [unit for path in args.destination.glob("redis-backup-*.tar.gz.gpg") if (unit := unit_for(path)) is not None]
    valid.sort(key=lambda item: item["timestamp"], reverse=True)
    # Keep exactly the approved five-minute recovery-point window by count.
    # The newest valid unit is included even if metadata timestamps are odd.
    protected = {unit["artifact"] for unit in valid[:RECOVERY_POINTS]}
    protected.update(unit["artifact"] for unit in valid if unit["restore_verified"])
    older = [unit for unit in valid if unit["artifact"] not in protected]
    for day in sorted({unit["day"] for unit in older}, reverse=True)[:DAILY_POINTS]:
        candidates = [unit for unit in older if unit["day"] == day]
        protected.add(max(candidates, key=lambda item: item["timestamp"])["artifact"])
    deleted = 0
    for unit in valid:
        if unit["artifact"] in protected:
            continue
        # Refuse the entire cleanup pass before unlinking anything when the
        # destination cannot safely remove a complete retention unit.
        if not (os.access(args.destination, os.W_OK) and os.access(args.destination, os.X_OK)):
            print("retention failure: destination is not safely writable")
            return 1
        paths = [unit["artifact"], unit["manifest"]]
        if unit["sidecar"]:
            paths.append(unit["sidecar"])
        try:
            for path in paths:
                path.unlink()
            deleted += 1
        except OSError as exc:
            print(f"retention failure: {exc.__class__.__name__}")
            return 1
    print(f"RETENTION_RESULT=success valid={len(valid)} protected={len(protected)} deleted={deleted}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
