#!/usr/bin/env python3
"""Host-side, fail-closed preflight for the ledger-managed storage root.

Run before any `docker compose up` that (re)creates workbench or
celery-worker. Compose itself refuses a missing bind source
(`create_host_path: false`), but a missing directory is only one failure
mode: an unmounted HDD leaves an empty mountpoint directory on the NVMe,
and a copied marker file could make the wrong filesystem look valid. So
identity is taken from the kernel, never from a path or a device name:

* findmnt reports the filesystem UUID and type of the mount holding ROOT;
* statvfs(ROOT).f_fsid must equal the ext4 fsid derived from that UUID
  (the same check Workbench's storage_ledger.backend_guard repeats at
  runtime from inside the container);
* the identity marker inside ROOT must name the same UUID.

`check` (default) is read-only. `init` creates only the final ROOT
directory (never parents, never recursive chmod/chown) and writes the
marker atomically without replacing an existing one.

Exit codes: 0 ok, 1 check failed, 2 usage/configuration error.
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path

MARKER_NAME = ".omnibioai-storage-identity.json"
MARKER_KIND = "omnibioai-managed-storage"
MARKER_SCHEMA_VERSION = 1
SUPPORTED_FS_TYPES = ("ext4",)
MAX_MARKER_BYTES = 4096


class PreflightError(Exception):
    def __init__(self, reason: str, detail: str = ""):
        super().__init__(f"{reason}: {detail}" if detail else reason)
        self.reason = reason


def ext4_fsid(fs_uuid: str) -> int:
    """Linux ext4_statfs: f_fsid = low64(uuid) XOR high64(uuid), little endian."""
    raw = uuid.UUID(fs_uuid).bytes
    return int.from_bytes(raw[:8], "little") ^ int.from_bytes(raw[8:], "little")


def load_env(env_file: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if env_file.is_file():
        for line in env_file.read_text().splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"\'')
    return values


def findmnt(path: Path) -> dict[str, str]:
    try:
        out = subprocess.run(
            ["findmnt", "-J", "-o", "TARGET,FSTYPE,UUID,OPTIONS", "--target", str(path)],
            check=True, capture_output=True, text=True, timeout=10,
        ).stdout
        return json.loads(out)["filesystems"][0]
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, IndexError) as exc:
        raise PreflightError("mount_lookup_failed", str(exc)) from exc


def validate_mount(path: Path, expected_uuid: str, expected_type: str, expected_mount: str | None) -> dict:
    """Validate the filesystem that currently holds `path` (which must exist)."""
    info = findmnt(path)
    if expected_mount and info.get("target") != expected_mount:
        raise PreflightError("mount_missing", f"{path} resolves to mount {info.get('target')!r}, expected {expected_mount!r}")
    if (info.get("fstype") or "") != expected_type:
        raise PreflightError("filesystem_type_mismatch", f"{info.get('fstype')!r} != {expected_type!r}")
    if (info.get("uuid") or "").lower() != expected_uuid:
        raise PreflightError("filesystem_uuid_mismatch", f"{info.get('uuid')!r} != {expected_uuid!r}")
    st = os.statvfs(path)
    if st.f_fsid != ext4_fsid(expected_uuid):
        raise PreflightError("filesystem_identity_mismatch", "statvfs fsid does not match the expected UUID")
    if st.f_flag & os.ST_RDONLY or "ro" in (info.get("options") or "").split(","):
        raise PreflightError("read_only", f"{info.get('target')} is mounted read-only")
    return {"mount": info.get("target"), "fstype": info.get("fstype"), "uuid": info.get("uuid"), "statvfs": st}


def read_marker(root: Path, expected_uuid: str) -> dict:
    marker = root / MARKER_NAME
    try:
        fd = os.open(marker, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError as exc:
        raise PreflightError("marker_missing", str(marker)) from exc
    except OSError as exc:
        raise PreflightError("marker_invalid", str(exc)) from exc
    with os.fdopen(fd, "rb") as handle:
        raw = handle.read(MAX_MARKER_BYTES + 1)
    if len(raw) > MAX_MARKER_BYTES:
        raise PreflightError("marker_invalid", "marker too large")
    try:
        body = json.loads(raw)
    except ValueError as exc:
        raise PreflightError("marker_invalid", "marker is not JSON") from exc
    if not isinstance(body, dict) or body.get("schema_version") != MARKER_SCHEMA_VERSION or body.get("kind") != MARKER_KIND:
        raise PreflightError("marker_invalid", "unsupported marker schema or kind")
    if str(body.get("fs_uuid", "")).lower() != expected_uuid:
        raise PreflightError("marker_invalid", "marker names a different filesystem")
    return body


def capacity(st, reserve_percent: float) -> dict:
    total = st.f_blocks * st.f_frsize
    available = st.f_bavail * st.f_frsize
    reserve = -(-int(total * reserve_percent * 100) // 10000)  # ceil, integer math
    return {"total_bytes": total, "available_bytes": available, "safety_reserve_bytes": reserve,
            "admissible_bytes": max(0, available - reserve)}


def _flatten_findmnt(records: list[dict]) -> list[dict]:
    """Flatten findmnt's nested JSON tree into the validator's record shape."""
    flattened: list[dict] = []
    pending = list(records)
    while pending:
        record = pending.pop()
        if not isinstance(record, dict):
            raise PreflightError("mount_snapshot_invalid", "findmnt entry is not an object")
        flattened.append({key: record.get(key) for key in ("target", "source", "fstype", "uuid", "options")})
        children = record.get("children") or []
        if not isinstance(children, list):
            raise PreflightError("mount_snapshot_invalid", "findmnt children is not a list")
        pending.extend(children)
    return flattened


def storage_v1_snapshot() -> list[dict]:
    """Read the live mount table only; never creates or changes a mount."""
    try:
        completed = subprocess.run(
            ["findmnt", "--json", "--list", "--output", "TARGET,SOURCE,FSTYPE,UUID,OPTIONS"],
            check=True, capture_output=True, text=True, timeout=10,
        )
        payload = json.loads(completed.stdout)
        filesystems = payload["filesystems"]
        if not isinstance(filesystems, list):
            raise ValueError("filesystems is not a list")
        return _flatten_findmnt(filesystems)
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError) as exc:
        raise PreflightError("mount_snapshot_unavailable", str(exc)) from exc


def run_storage_v1_check(expected_primary_b_uuid: str) -> dict:
    """Validate the complete future Storage V1 topology without mutation.

    This is opt-in and is deliberately not wired into current Compose startup.
    Deployment enablement requires a separately approved maintenance plan.
    """
    if not expected_primary_b_uuid:
        raise PreflightError("configuration_missing", "STORAGE_V1_PRIMARY_B_FS_UUID is required")
    script = Path(__file__).resolve().with_name("storage_v1_mount_contract.py")
    spec = importlib.util.spec_from_file_location("_storage_v1_mount_contract", script)
    if spec is None or spec.loader is None:
        raise PreflightError("validator_unavailable", str(script))
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
        result = module.validate_storage_v1(
            storage_v1_snapshot(), expected_primary_b_uuid=expected_primary_b_uuid,
        )
    except module.MountContractError as exc:
        raise PreflightError("storage_v1_topology_invalid", str(exc)) from exc
    finally:
        sys.modules.pop(spec.name, None)
    result["mode"] = "read-only-preflight"
    return result


def write_marker_atomically(root: Path, body: dict) -> None:
    """Create MARKER_NAME without ever replacing an existing marker."""
    tmp = root / f".{MARKER_NAME}.{os.getpid()}.tmp"
    data = (json.dumps(body, indent=2, sort_keys=True) + "\n").encode()
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.link(tmp, root / MARKER_NAME)  # atomic, fails with EEXIST instead of replacing
    finally:
        tmp.unlink(missing_ok=True)
    dir_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(dir_fd)
    finally:
        os.close(dir_fd)


def run(args) -> dict:
    env = load_env(args.env_file)
    root_value = args.root or env.get("MANAGED_STORAGE_ROOT") or os.environ.get("MANAGED_STORAGE_ROOT")
    uuid_value = args.fs_uuid or env.get("MANAGED_STORAGE_FS_UUID") or os.environ.get("MANAGED_STORAGE_FS_UUID")
    if not root_value or not uuid_value:
        raise PreflightError("configuration_missing", "MANAGED_STORAGE_ROOT and MANAGED_STORAGE_FS_UUID are required")
    try:
        expected_uuid = str(uuid.UUID(uuid_value)).lower()
    except ValueError as exc:
        raise PreflightError("configuration_invalid", "MANAGED_STORAGE_FS_UUID is not a UUID") from exc
    if args.fs_type not in SUPPORTED_FS_TYPES:
        raise PreflightError("configuration_invalid", f"only {SUPPORTED_FS_TYPES} identity derivation is supported")
    root = Path(root_value)
    if not root.is_absolute():
        raise PreflightError("configuration_invalid", "MANAGED_STORAGE_ROOT must be absolute")
    reserve_percent = float(args.reserve_percent if args.reserve_percent is not None
                            else env.get("MANAGED_STORAGE_SAFETY_RESERVE_PERCENT", "10"))
    if not 0 <= reserve_percent < 100:
        raise PreflightError("configuration_invalid", "safety reserve percent must be in [0, 100)")

    if args.command == "init":
        parent = root.parent
        if not parent.is_dir():
            raise PreflightError("parent_missing", f"{parent} does not exist; parents are never created")
        validate_mount(parent, expected_uuid, args.fs_type, args.expected_mount)
        if root.is_symlink():
            raise PreflightError("root_invalid", "storage root must not be a symlink")
        created = False
        if not root.exists():
            os.mkdir(root, 0o750)  # final component only; umask may narrow it further
            created = True
        if not (root / MARKER_NAME).exists():
            write_marker_atomically(root, {
                "schema_version": MARKER_SCHEMA_VERSION, "kind": MARKER_KIND,
                "storage_id": args.storage_id, "fs_uuid": expected_uuid, "fs_type": args.fs_type,
                "host_root": str(root), "layout": "storage-ledger/<allocation-uuid>/payload",
                "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            })
        result = {"action": "init", "root_created": created}
    else:
        result = {"action": "check"}

    if root.is_symlink() or not root.is_dir():
        raise PreflightError("root_missing", f"{root} is not an existing directory")
    mount = validate_mount(root, expected_uuid, args.fs_type, args.expected_mount)
    marker = read_marker(root, expected_uuid)
    if not os.access(root, os.W_OK | os.X_OK):
        raise PreflightError("not_writable", f"{root} is not writable by uid {os.getuid()}")
    cap = capacity(mount["statvfs"], reserve_percent)
    if cap["admissible_bytes"] <= 0:
        raise PreflightError("insufficient_capacity", "available space is inside the safety reserve")
    mode = root.stat().st_mode & 0o777
    result.update({"status": "ok", "root": str(root), "mount": mount["mount"], "fstype": mount["fstype"],
                   "fs_uuid": mount["uuid"], "marker_storage_id": marker.get("storage_id"),
                   "root_mode": oct(mode), "safety_reserve_percent": reserve_percent, **cap})
    return result


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("command", nargs="?", choices=("check", "init", "storage-v1-check"), default="check")
    ap.add_argument("--env-file", type=Path, default=Path(__file__).resolve().parents[1] / ".env")
    ap.add_argument("--root", help="host storage root (default: MANAGED_STORAGE_ROOT)")
    ap.add_argument("--fs-uuid", help="expected filesystem UUID (default: MANAGED_STORAGE_FS_UUID)")
    ap.add_argument("--fs-type", default="ext4")
    ap.add_argument("--expected-mount", help="expected mountpoint, e.g. /mnt/wdpro26tb")
    ap.add_argument("--reserve-percent", type=float)
    ap.add_argument("--storage-id", default="omnibioai-managed")
    ap.add_argument("--primary-b-fs-uuid", help="expected initialized Primary B UUID; may also be set with STORAGE_V1_PRIMARY_B_FS_UUID")
    args = ap.parse_args(argv)
    try:
        if args.command == "storage-v1-check":
            env = load_env(args.env_file)
            expected_b_uuid = args.primary_b_fs_uuid or env.get("STORAGE_V1_PRIMARY_B_FS_UUID") or os.environ.get("STORAGE_V1_PRIMARY_B_FS_UUID")
            result = run_storage_v1_check(expected_b_uuid or "")
        else:
            result = run(args)
    except PreflightError as exc:
        print(json.dumps({"status": "failed", "reason": exc.reason, "detail": str(exc)}), file=sys.stderr)
        return 2 if exc.reason.startswith("configuration") else 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
