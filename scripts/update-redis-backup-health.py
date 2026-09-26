#!/usr/bin/env python3
"""Atomically update non-secret Redis backup health state."""

from __future__ import annotations

import argparse
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line:
                key, value = line.split("=", 1)
                values[key] = value
    return values


def save(path: Path, values: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            for key in sorted(values):
                handle.write(f"{key}={values[key]}\n")
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
    parser = argparse.ArgumentParser()
    parser.add_argument("health_file", type=Path)
    parser.add_argument("--attempt-result", choices=("success", "failure", "lock_contention"), required=True)
    parser.add_argument("--stage", required=True)
    parser.add_argument("--artifact", default="")
    parser.add_argument("--sha", default="")
    parser.add_argument("--state", default="")
    parser.add_argument("--retention-result", choices=("success", "failure"))
    args = parser.parse_args()
    values = load(args.health_file)
    timestamp = now()
    values["LAST_ATTEMPT_TS"] = timestamp
    values["LAST_ATTEMPT_RESULT"] = args.attempt_result
    values["LAST_ATTEMPT_STAGE"] = args.stage
    # A retention-only success has no new artifact.  It must not erase the
    # last known-good backup while recording the attempt/retention outcome.
    if args.attempt_result == "success" and args.artifact:
        values.update({
            "LAST_RESULT": "success",
            "LAST_ARTIFACT": args.artifact,
            "LAST_ARTIFACT_SHA256": args.sha,
            "LAST_ARTIFACT_STATE": args.state,
            "LAST_SUCCESS_TS": timestamp,
        })
    elif "LAST_RESULT" not in values:
        values["LAST_RESULT"] = "failure"
    if args.attempt_result == "lock_contention":
        values["LAST_LOCK_CONTENTION_TS"] = timestamp
        values["LAST_LOCK_CONTENTION_COUNT"] = str(int(values.get("LAST_LOCK_CONTENTION_COUNT", "0")) + 1)
    if args.retention_result:
        values["LAST_RETENTION_TS"] = timestamp
        values["LAST_RETENTION_RESULT"] = args.retention_result
    save(args.health_file, values)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
