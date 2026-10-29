from __future__ import annotations

import pytest

from scripts import storage_v1_mount_contract as contract

PRIMARY_B_UUID = "12345678-1234-5678-1234-567812345678"


def validate(records):
    return contract.validate_storage_v1(records, expected_primary_b_uuid=PRIMARY_B_UUID)


def topology():
    return [
        {"target": "/", "source": "/dev/nvme0n1p2", "fstype": "ext4",
         "uuid": "root-uuid", "options": "rw,relatime"},
        {"target": contract.PRIMARY_A_MOUNT, "source": "/dev/sdh1",
         "fstype": "ext4", "uuid": contract.PRIMARY_A_UUID,
         "options": "rw,relatime"},
        {"target": contract.PRIMARY_B_MOUNT, "source": "/dev/sdd1",
         "fstype": "ext4", "uuid": PRIMARY_B_UUID,
         "options": "rw,relatime"},
        {"target": contract.PRIMARY_POOL_MOUNT,
         "source": f"{contract.PRIMARY_A_MOUNT}:{contract.PRIMARY_B_MOUNT}",
         "fstype": "fuse.mergerfs", "uuid": "", "options": "rw,allow_other"},
        {"target": contract.ARCHIVE_MOUNT, "source": "/dev/sdg1",
         "fstype": "ext4", "uuid": contract.ARCHIVE_UUID,
         "options": "rw,relatime"},
        {"target": contract.BACKUP_MOUNT, "source": "/dev/sdf1",
         "fstype": "ext4", "uuid": contract.BACKUP_UUID,
         "options": "ro,relatime,norecovery"},
    ]


def test_accepts_complete_distinct_topology_with_readonly_backup():
    result = validate(topology())
    assert result["status"] == "ok"
    assert result["backup_read_only"] == contract.BACKUP_MOUNT


@pytest.mark.parametrize("target", [
    contract.PRIMARY_A_MOUNT,
    contract.PRIMARY_B_MOUNT,
    contract.PRIMARY_POOL_MOUNT,
    contract.ARCHIVE_MOUNT,
    contract.BACKUP_MOUNT,
])
def test_missing_required_mount_fails_closed(target):
    records = [item for item in topology() if item["target"] != target]
    with pytest.raises(contract.MountContractError, match="mount_missing"):
        validate(records)


def test_primary_a_root_fallback_is_rejected():
    records = topology()
    records[1]["target"] = "/mnt/primary-a/child"
    with pytest.raises(contract.MountContractError, match="mount_missing"):
        validate(records)


def test_wrong_primary_a_uuid_is_rejected():
    records = topology()
    records[1]["uuid"] = "wrong"
    with pytest.raises(contract.MountContractError, match="filesystem_uuid_mismatch"):
        validate(records)


def test_backup_read_write_is_rejected():
    records = topology()
    records[-1]["options"] = "rw,relatime"
    with pytest.raises(contract.MountContractError, match="mount_not_read_only"):
        validate(records)


def test_primary_branch_read_only_is_rejected():
    records = topology()
    records[2]["options"] = "ro,relatime"
    with pytest.raises(contract.MountContractError, match="mount_not_writable"):
        validate(records)


def test_primary_b_uuid_aliasing_root_filesystem_is_rejected():
    records = topology()
    records[0]["uuid"] = PRIMARY_B_UUID
    with pytest.raises(contract.MountContractError, match="primary_b_uuid_aliases_mounted_filesystem"):
        validate(records)


def test_archive_cannot_be_a_mergerfs_member():
    records = topology()
    records[3]["source"] = (
        f"{contract.PRIMARY_A_MOUNT}:{contract.PRIMARY_B_MOUNT}:"
        f"{contract.ARCHIVE_MOUNT}"
    )
    with pytest.raises(contract.MountContractError, match="mergerfs_branch_membership_mismatch"):
        validate(records)


def test_backup_cannot_be_a_mergerfs_member():
    records = topology()
    records[3]["source"] = (
        f"{contract.PRIMARY_A_MOUNT}:{contract.PRIMARY_B_MOUNT}:"
        f"{contract.BACKUP_MOUNT}"
    )
    with pytest.raises(contract.MountContractError, match="mergerfs_branch_membership_mismatch"):
        validate(records)


def test_duplicate_target_is_rejected():
    records = topology()
    records.append(dict(records[1]))
    with pytest.raises(contract.MountContractError, match="duplicate_mount_target"):
        validate(records)


def test_non_absolute_or_traversal_target_is_rejected():
    records = topology()
    records[1]["target"] = "/mnt/../etc"
    with pytest.raises(contract.MountContractError, match="invalid_mount_path"):
        validate(records)


def test_wrong_backup_uuid_is_rejected():
    records = topology()
    records[-1]["uuid"] = "wrong"
    with pytest.raises(contract.MountContractError, match="filesystem_uuid_mismatch"):
        validate(records)


def test_wrong_primary_b_uuid_is_rejected():
    records = topology()
    records[2]["uuid"] = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    with pytest.raises(contract.MountContractError, match="primary_b_uuid_mismatch"):
        validate(records)
