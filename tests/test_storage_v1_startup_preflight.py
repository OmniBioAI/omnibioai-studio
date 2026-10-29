"""Read-only integration tests for the opt-in host Storage V1 preflight."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_B = "12345678-1234-5678-1234-567812345678"
preflight_spec = importlib.util.spec_from_file_location(
    "managed_storage_preflight_under_test", ROOT / "scripts" / "managed_storage_preflight.py"
)
preflight = importlib.util.module_from_spec(preflight_spec)
preflight_spec.loader.exec_module(preflight)


def healthy_snapshot():
    return [
        {"target": "/", "source": "/dev/nvme0n1p2", "fstype": "ext4",
         "uuid": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "options": "rw,relatime"},
        {"target": "/mnt/primary-a", "source": "/dev/disk/by-uuid/7c17cfc0-2582-4984-9724-7c5a02d8ee7a",
         "fstype": "ext4", "uuid": "7c17cfc0-2582-4984-9724-7c5a02d8ee7a", "options": "rw,relatime"},
        {"target": "/mnt/primary-b", "source": "/dev/disk/by-uuid/" + EXPECTED_B,
         "fstype": "ext4", "uuid": EXPECTED_B, "options": "rw,relatime"},
        {"target": "/mnt/primary", "source": "/mnt/primary-a:/mnt/primary-b",
         "fstype": "fuse.mergerfs", "uuid": "", "options": "rw,allow_other"},
        {"target": "/mnt/omnibioai-archive", "source": "/dev/disk/by-uuid/6a805bb7-2513-435f-9cd4-b9970a0e4fc4",
         "fstype": "ext4", "uuid": "6a805bb7-2513-435f-9cd4-b9970a0e4fc4", "options": "rw,relatime"},
        {"target": "/mnt/omnibioai-backup24tb", "source": "/dev/disk/by-uuid/2b177ba8-e653-47b4-ae7a-244440a1615e",
         "fstype": "ext4", "uuid": "2b177ba8-e653-47b4-ae7a-244440a1615e", "options": "ro,relatime,norecovery"},
    ]


def check(monkeypatch, records):
    monkeypatch.setattr(preflight, "storage_v1_snapshot", lambda: records)
    return preflight.run_storage_v1_check(EXPECTED_B)


def test_opt_in_startup_preflight_accepts_complete_readonly_backup_topology(monkeypatch):
    result = check(monkeypatch, healthy_snapshot())
    assert result["status"] == "ok"
    assert result["mode"] == "read-only-preflight"


@pytest.mark.parametrize("target", ["/mnt/primary-a", "/mnt/primary-b"])
def test_missing_primary_branch_fails_closed(monkeypatch, target):
    records = [row for row in healthy_snapshot() if row["target"] != target]
    with pytest.raises(preflight.PreflightError, match="storage_v1_topology_invalid.*mount_missing"):
        check(monkeypatch, records)


def test_wrong_primary_uuid_fails_closed(monkeypatch):
    records = healthy_snapshot()
    records[1]["uuid"] = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"
    with pytest.raises(preflight.PreflightError, match="storage_v1_topology_invalid.*uuid_mismatch"):
        check(monkeypatch, records)


def test_duplicate_primary_branch_uuid_fails_closed(monkeypatch):
    records = healthy_snapshot()
    records[2]["uuid"] = records[1]["uuid"]
    with pytest.raises(preflight.PreflightError, match="storage_v1_topology_invalid"):
        check(monkeypatch, records)


def test_wrong_mergerfs_membership_fails_closed(monkeypatch):
    records = healthy_snapshot()
    records[3]["source"] = "/mnt/primary-a"
    with pytest.raises(preflight.PreflightError, match="mergerfs_branch_membership_mismatch"):
        check(monkeypatch, records)


def test_missing_archive_fails_closed(monkeypatch):
    records = [row for row in healthy_snapshot() if row["target"] != "/mnt/omnibioai-archive"]
    with pytest.raises(preflight.PreflightError, match="mount_missing"):
        check(monkeypatch, records)


def test_writable_backup_fails_closed(monkeypatch):
    records = healthy_snapshot()
    records[-1]["options"] = "rw,relatime"
    with pytest.raises(preflight.PreflightError, match="mount_not_read_only"):
        check(monkeypatch, records)


def test_backup_in_mergerfs_fails_closed(monkeypatch):
    records = healthy_snapshot()
    records[3]["source"] += ":/mnt/omnibioai-backup24tb"
    with pytest.raises(preflight.PreflightError, match="mergerfs_branch_membership_mismatch"):
        check(monkeypatch, records)


def test_mountpoint_directory_without_mount_record_fails_closed(monkeypatch):
    # A real directory on root/NVMe does not appear as a mount target in this fixture.
    records = [healthy_snapshot()[0]]
    with pytest.raises(preflight.PreflightError, match="mount_missing"):
        check(monkeypatch, records)


def test_malformed_findmnt_json_fails_closed(monkeypatch):
    class Completed:
        stdout = '{"filesystems": {"not": "a list"}}'

    monkeypatch.setattr(preflight.subprocess, "run", lambda *a, **k: Completed())
    with pytest.raises(preflight.PreflightError, match="mount_snapshot_unavailable"):
        preflight.storage_v1_snapshot()


def test_nested_findmnt_output_is_flattened():
    result = preflight._flatten_findmnt([{
        "target": "/", "source": "root", "fstype": "ext4", "uuid": "u", "options": "rw",
        "children": [{"target": "/mnt/data", "source": "disk", "fstype": "ext4", "uuid": "v", "options": "rw"}],
    }])
    assert {row["target"] for row in result} == {"/", "/mnt/data"}


def test_primary_b_expected_uuid_is_required(monkeypatch):
    with pytest.raises(preflight.PreflightError, match="STORAGE_V1_PRIMARY_B_FS_UUID"):
        preflight.run_storage_v1_check("")
