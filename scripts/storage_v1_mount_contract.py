#!/usr/bin/env python3
"""Fail-closed validation for the OmniBioAI Storage V1 mount topology.

This module validates a supplied findmnt-style snapshot. It does not mount,
remount, create paths, or write data. A caller must obtain the snapshot from a
trusted local source and should treat validation failure as a hard admission
failure, never as permission to fall back to the root filesystem.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Iterable, Mapping
import uuid


PRIMARY_A_UUID = "7c17cfc0-2582-4984-9724-7c5a02d8ee7a"
BACKUP_UUID = "2b177ba8-e653-47b4-ae7a-244440a1615e"
ARCHIVE_UUID = "6a805bb7-2513-435f-9cd4-b9970a0e4fc4"

PRIMARY_A_MOUNT = "/mnt/primary-a"
PRIMARY_B_MOUNT = "/mnt/primary-b"
PRIMARY_POOL_MOUNT = "/mnt/primary"
ARCHIVE_MOUNT = "/mnt/omnibioai-archive"
BACKUP_MOUNT = "/mnt/omnibioai-backup24tb"


@dataclass(frozen=True)
class Mount:
    target: str
    source: str
    fstype: str
    uuid: str
    options: frozenset[str]


class MountContractError(ValueError):
    """The snapshot does not satisfy the required storage safety contract."""


def _clean_path(value: str) -> str:
    path = PurePosixPath(value)
    if not path.is_absolute() or ".." in path.parts:
        raise MountContractError(f"invalid_mount_path:{value!r}")
    return str(path)


def normalize_mounts(records: Iterable[Mapping[str, object]]) -> dict[str, Mount]:
    """Normalize findmnt JSON records and reject duplicate/ambiguous targets."""
    mounts: dict[str, Mount] = {}
    for record in records:
        try:
            target = _clean_path(str(record["target"]))
            source = str(record["source"])
            fstype = str(record["fstype"])
            fs_uuid = str(record.get("uuid") or "").lower()
            options = frozenset(
                item.strip().lower()
                for item in str(record.get("options") or "").split(",")
                if item.strip()
            )
        except KeyError as exc:
            raise MountContractError(f"mount_record_missing:{exc.args[0]}") from exc
        if target in mounts:
            raise MountContractError(f"duplicate_mount_target:{target}")
        mounts[target] = Mount(target, source, fstype, fs_uuid, options)
    return mounts


def _require(mounts: Mapping[str, Mount], target: str, *, fstype: str,
             fs_uuid: str | None = None, writable: bool = False,
             readonly: bool = False) -> Mount:
    mount = mounts.get(target)
    if mount is None:
        raise MountContractError(f"mount_missing:{target}")
    if mount.fstype != fstype:
        raise MountContractError(
            f"filesystem_type_mismatch:{target}:{mount.fstype}!={fstype}"
        )
    if fs_uuid is not None and mount.uuid != fs_uuid:
        raise MountContractError(f"filesystem_uuid_mismatch:{target}")
    if writable and "rw" not in mount.options:
        raise MountContractError(f"mount_not_writable:{target}")
    if readonly and "ro" not in mount.options:
        raise MountContractError(f"mount_not_read_only:{target}")
    return mount


def validate_storage_v1(
    records: Iterable[Mapping[str, object]], *, expected_primary_b_uuid: str,
) -> dict[str, object]:
    """Validate the complete five-mount topology or fail closed.

    The Primary B UUID is deliberately not hard-coded because it does not
    exist until a separately authorized initialization. It must be supplied
    by the caller after validating the current physical serial/WWN. The value
    must differ from Primary A, Backup, and Archive.
    """
    try:
        expected_b_uuid = str(uuid.UUID(expected_primary_b_uuid)).lower()
    except (ValueError, AttributeError, TypeError) as exc:
        raise MountContractError("primary_b_expected_uuid_invalid") from exc
    mounts = normalize_mounts(records)
    primary_a = _require(
        mounts, PRIMARY_A_MOUNT, fstype="ext4", fs_uuid=PRIMARY_A_UUID,
        writable=True,
    )
    primary_b = _require(
        mounts, PRIMARY_B_MOUNT, fstype="ext4", writable=True,
    )
    if not primary_b.uuid:
        raise MountContractError("primary_b_uuid_missing")
    if primary_b.uuid != expected_b_uuid:
        raise MountContractError("primary_b_uuid_mismatch")
    if primary_b.uuid in {PRIMARY_A_UUID, BACKUP_UUID, ARCHIVE_UUID}:
        raise MountContractError("primary_b_uuid_not_distinct")
    if any(
        mount.target != PRIMARY_B_MOUNT and mount.uuid == primary_b.uuid
        for mount in mounts.values()
    ):
        raise MountContractError("primary_b_uuid_aliases_mounted_filesystem")
    if primary_a.source == primary_b.source or primary_a.uuid == primary_b.uuid:
        raise MountContractError("primary_branches_not_distinct")

    pool = _require(
        mounts, PRIMARY_POOL_MOUNT, fstype="fuse.mergerfs", writable=True,
    )
    branches = {part for part in pool.source.split(":") if part}
    if branches != {PRIMARY_A_MOUNT, PRIMARY_B_MOUNT}:
        raise MountContractError("mergerfs_branch_membership_mismatch")
    if BACKUP_MOUNT in branches or ARCHIVE_MOUNT in branches:
        raise MountContractError("non_primary_branch_in_mergerfs")

    archive = _require(
        mounts, ARCHIVE_MOUNT, fstype="ext4", fs_uuid=ARCHIVE_UUID,
        writable=True,
    )
    backup = _require(
        mounts, BACKUP_MOUNT, fstype="ext4", fs_uuid=BACKUP_UUID,
        readonly=True,
    )
    if backup.source in {primary_a.source, primary_b.source, archive.source}:
        raise MountContractError("backup_source_aliases_data_mount")
    if backup.source in branches:
        raise MountContractError("backup_in_mergerfs")

    return {
        "status": "ok",
        "primary_branches": [PRIMARY_A_MOUNT, PRIMARY_B_MOUNT],
        "primary_pool": PRIMARY_POOL_MOUNT,
        "archive": ARCHIVE_MOUNT,
        "backup_read_only": BACKUP_MOUNT,
    }
