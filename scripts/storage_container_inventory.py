#!/usr/bin/env python3
"""Read-only inventory of ledger payload storage inside the running Workbench
and Celery containers (P0 managed-storage pre-cutover gate).

Docker is used only through `docker ps`, `docker inspect` and a `docker exec`
that runs a directory walker reporting paths, sizes and sha256 values, never
file contents. Nothing is written, moved, deleted or restarted.

Output is always exactly one JSON document, built with json.dumps. Every
failure becomes a structured error: a stage, a stable code, an exit code,
and (for the inner walker) an exception class name. Docker's stderr is
captured separately and never copied into the report, because it may echo
arbitrary text. Only the allowlisted, non-secret storage keys are read from
a container's environment.

Exit status: 0 complete, 1 partial (report still valid), 2 usage error.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import tempfile

SERVICES = ("workbench", "celery-worker")
SAFE_ENV_KEYS = (
    "FTM_LOCAL_ROOT", "STORAGE_QUOTA_MODE", "STORAGE_QUOTA_BASELINE_VERIFIED",
    "STORAGE_BACKEND_IDENTITY_CHECKS", "STORAGE_PHYSICAL_CAPACITY_CHECKS",
    "STORAGE_EXPECTED_FS_TYPE", "OMNI_OBJECT_STORAGE_DIR",
)
MOUNT_FIELDS = ("Type", "Name", "Source", "Destination", "Mode", "RW", "Propagation")
TIMEOUT_SECONDS = 600

# Runs inside the container (stdin to `python3 -`). Metadata only, never contents.
INNER = r'''
import hashlib, json, os, sys
root = os.environ.get("FTM_LOCAL_ROOT") or "/app/work/file_transfer_manager/local"
out = {"effective_ftm_local_root": root, "ftm_local_root_env_set": bool(os.environ.get("FTM_LOCAL_ROOT")), "trees": []}
for top in sorted({root, "/app/work/file_transfer_manager"}):
    tree = {"path": top, "exists": os.path.isdir(top), "files": [], "file_count": 0, "total_bytes": 0}
    if tree["exists"]:
        tree["statvfs_fsid"] = hex(os.statvfs(top).f_fsid)
        for dirpath, dirnames, filenames in os.walk(top, followlinks=False):
            for name in filenames:
                path = os.path.join(dirpath, name)
                rel = os.path.relpath(path, top)
                try:
                    info = os.lstat(path)
                    link = os.path.islink(path)
                    digest = None
                    if not link and os.path.isfile(path):
                        h = hashlib.sha256()
                        with open(path, "rb") as handle:
                            for chunk in iter(lambda: handle.read(4 << 20), b""):
                                h.update(chunk)
                        digest = h.hexdigest()
                    tree["files"].append({"relative_path": rel, "bytes": info.st_size, "mtime": int(info.st_mtime), "sha256": digest, "symlink": link})
                    tree["file_count"] += 1
                    tree["total_bytes"] += info.st_size
                except OSError as exc:
                    tree["files"].append({"relative_path": rel, "error": exc.__class__.__name__})
    out["trees"].append(tree)
json.dump(out, sys.stdout)
'''


def docker(args, *, stdin=None):
    """Run docker; return (exit_code, stdout). stderr is captured and dropped."""
    binary = os.environ.get("DOCKER", "docker")
    try:
        proc = subprocess.run([binary, *args], input=stdin, capture_output=True, text=True,
                              timeout=TIMEOUT_SECONDS, check=False)
    except FileNotFoundError:
        return 127, ""
    except subprocess.TimeoutExpired:
        return 124, ""
    return proc.returncode, proc.stdout


def error(stage, code, **detail):
    return {"stage": stage, "code": code, **detail}


def safe_env(config_env):
    found = {}
    for item in config_env or []:
        if isinstance(item, str) and "=" in item:
            key, value = item.split("=", 1)
            if key in SAFE_ENV_KEYS:
                found[key] = value
    return found


def payload_inventory(container_id):
    code, out = docker(["exec", "-i", container_id, "python3", "-"], stdin=INNER)
    if code in (126, 127):
        return None, error("exec", "python_unavailable", exit_code=code)
    if code != 0:
        return None, error("exec", "exec_failed", exit_code=code)
    try:
        result = json.loads(out)
    except ValueError:
        return None, error("exec", "invalid_inventory_output")
    if not isinstance(result, dict):
        return None, error("exec", "invalid_inventory_output")
    return result, None


def inspect_container(service, container_id):
    record = {"service": service, "container_id": container_id, "errors": []}
    code, out = docker(["inspect", container_id])
    try:
        data = json.loads(out)[0] if code == 0 else None
    except (ValueError, IndexError, TypeError):
        data = None
    if code != 0:
        record["errors"].append(error("inspect", "inspect_failed", exit_code=code))
    elif not isinstance(data, dict):
        record["errors"].append(error("inspect", "invalid_inspect_output"))
    if isinstance(data, dict):
        config = data.get("Config") or {}
        labels = config.get("Labels") or {}
        record.update({
            "container": str(data.get("Name") or "").lstrip("/"),
            "project": labels.get("com.docker.compose.project"),
            "started_at": (data.get("State") or {}).get("StartedAt"),
            "storage_env": safe_env(config.get("Env")),
            "mounts": [{k: m.get(k) for k in MOUNT_FIELDS if k in m} for m in data.get("Mounts") or [] if isinstance(m, dict)],
        })
    inventory, failure = payload_inventory(container_id)
    record["payload_inventory"] = inventory
    if failure:
        record["errors"].append(failure)
    return record


def build_report(services=SERVICES):
    report = {"generated_at": dt.datetime.now(dt.timezone.utc).isoformat(), "services": {}, "containers": [], "errors": []}
    for service in services:
        code, out = docker(["ps", "-q", "--no-trunc", "--filter", f"label=com.docker.compose.service={service}"])
        if code != 0:
            report["services"][service] = {"containers_found": None}
            report["errors"].append(error("ps", "ps_failed", service=service, exit_code=code))
            continue
        ids = [line.strip() for line in out.splitlines() if line.strip()]
        report["services"][service] = {"containers_found": len(ids)}
        if not ids:
            report["errors"].append(error("ps", "no_matching_container", service=service))
        for container_id in ids:
            report["containers"].append(inspect_container(service, container_id))
    partial = bool(report["errors"]) or any(c["errors"] for c in report["containers"])
    report["status"] = "partial" if partial else "complete"
    return report


def write_atomically(path, text):
    directory = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(prefix=".storage-inventory.", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def main(argv=None):
    ap = argparse.ArgumentParser(description="Read-only container payload inventory (one JSON document).")
    ap.add_argument("--output", help="write the report atomically to this file instead of stdout")
    args = ap.parse_args(argv)
    try:
        report = build_report()
    except Exception as exc:  # never emit a partial or non-JSON document
        report = {"status": "failed", "errors": [error("inventory", "unexpected_error", exception=exc.__class__.__name__)]}
    text = json.dumps(report, indent=2, sort_keys=True, ensure_ascii=True) + "\n"
    if args.output:
        write_atomically(args.output, text)
    else:
        sys.stdout.write(text)
    return 0 if report["status"] == "complete" else 1


if __name__ == "__main__":
    sys.exit(main())
