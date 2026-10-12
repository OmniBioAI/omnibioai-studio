"""P0 managed storage: DGX Compose overlay contract, release publish gate, host preflight.

Purely static/local: no Docker daemon, no live disk writes. Preflight tests
model findmnt/statvfs; nothing under /mnt is touched.
"""
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
HDD_UUID = "f9b2ec0f-7e62-4ee0-85fd-ea0c8d5fbbd5"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gate = _load("release_storage_gate")
preflight = _load("managed_storage_preflight")


def _services(filename):
    return yaml.safe_load((ROOT / filename).read_text(encoding="utf-8"))["services"]


# ── DGX managed-storage overlay ─────────────────────────────────────────────

OVERLAY = "docker-compose.managed-storage.yml"


def test_base_compose_has_no_managed_storage_so_it_stays_operable():
    # Ordinary Compose operations must not need MANAGED_STORAGE_* or switch storage.
    text = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    assert "MANAGED_STORAGE_" not in text and "/data/managed" not in text and "FTM_LOCAL_ROOT" not in text


@pytest.mark.parametrize("name", ["workbench", "celery-worker"])
def test_overlay_mounts_managed_root_fail_closed(name):
    service = _services(OVERLAY)[name]
    env = service["environment"]
    assert env["FTM_LOCAL_ROOT"] == "/data/managed"
    assert env["STORAGE_EXPECTED_FS_UUID"].startswith("${MANAGED_STORAGE_FS_UUID:?")
    assert env["STORAGE_EXPECTED_FS_TYPE"] == "ext4"
    assert env["STORAGE_BACKEND_IDENTITY_CHECKS"] == "true"
    assert env["STORAGE_PHYSICAL_CAPACITY_CHECKS"] == "true"
    assert not {"STORAGE_QUOTA_MODE", "STORAGE_QUOTA_BASELINE_VERIFIED"} & set(env)  # base audit default stands
    assert service["volumes"] == [{
        "type": "bind",
        "source": "${MANAGED_STORAGE_ROOT:?MANAGED_STORAGE_ROOT must be set (run scripts/managed_storage_preflight.py)}",
        "target": "/data/managed",
        "bind": {"create_host_path": False},
    }]


def test_overlay_touches_only_workbench_and_worker_identically():
    services = _services(OVERLAY)
    assert set(services) == {"workbench", "celery-worker"}
    assert services["workbench"] == services["celery-worker"]


def test_overlay_does_not_hard_code_host_disk():
    assert "/mnt/wdpro26tb" not in (ROOT / OVERLAY).read_text(encoding="utf-8")


def test_base_quota_mode_stays_audit():
    env = _services("docker-compose.yml")["workbench"]["environment"]
    assert env["STORAGE_QUOTA_MODE"] == "${STORAGE_QUOTA_MODE:-audit}"
    assert env["STORAGE_QUOTA_BASELINE_VERIFIED"] == "${STORAGE_QUOTA_BASELINE_VERIFIED:-false}"


# ── Release files and publish gate ──────────────────────────────────────────

@pytest.mark.parametrize("filename", gate.RELEASE_FILES)
def test_release_files_unchanged_and_never_name_dgx_disk(filename):
    text = (ROOT / filename).read_text(encoding="utf-8")
    assert "/mnt/wdpro26tb" not in text and "MANAGED_STORAGE_" not in text


def _guarded_source(tmp_path):
    (tmp_path / "wb" / "storage_ledger").mkdir(parents=True)
    (tmp_path / "wb" / "storage_ledger" / "backend_guard.py").write_text("# guard\n")
    return tmp_path / "wb"


def test_gate_blocks_guarded_image_against_current_release_files(tmp_path):
    result = gate.check(_guarded_source(tmp_path))
    assert result["status"] == "blocked" and result["release_storage_compatibility"] == "BLOCKED"
    assert any("container-local" in p for p in result["problems"])


def test_gate_allows_images_without_guard(tmp_path):
    assert gate.check(tmp_path)["status"] == "allowed"


def _compliant(root_env="/data/managed", **env_overrides):
    env = {"FTM_LOCAL_ROOT": root_env, "STORAGE_EXPECTED_FS_UUID": "${STORAGE_FS_UUID:?set}",
           "STORAGE_BACKEND_IDENTITY_CHECKS": "true", "STORAGE_PHYSICAL_CAPACITY_CHECKS": "true", **env_overrides}
    service = {"environment": env, "volumes": [{"type": "bind", "source": "${STORAGE_ROOT:?set}", "target": root_env,
                                                "bind": {"create_host_path": False}}]}
    return {"services": {"workbench": service, "celery-worker": service}}


def _release_root(tmp_path, doc):
    root = tmp_path / "studio"
    root.mkdir()
    for filename in gate.RELEASE_FILES:
        (root / filename).write_text(yaml.safe_dump(doc))
    return root


def test_gate_allows_explicit_guarded_backend(tmp_path):
    assert gate.check(_guarded_source(tmp_path), _release_root(tmp_path, _compliant()))["status"] == "allowed"


@pytest.mark.parametrize("mutate, expected", [
    (lambda d: d["services"]["workbench"]["environment"].update(STORAGE_BACKEND_IDENTITY_CHECKS="${X:-false}"), "defaults to disabled"),
    (lambda d: d["services"]["workbench"].update(volumes=["${STORAGE_ROOT}:/data/managed"]), "short bind syntax"),
    (lambda d: d["services"]["workbench"]["volumes"][0]["bind"].update(create_host_path=True), "create_host_path"),
    (lambda d: d["services"]["workbench"]["environment"].pop("STORAGE_EXPECTED_FS_UUID"), "identity"),
    (lambda d: d["services"]["workbench"]["environment"].update(STORAGE_QUOTA_BASELINE_VERIFIED="true"), "BASELINE_VERIFIED"),
])
def test_gate_rejects_unsafe_release_configuration(tmp_path, mutate, expected):
    doc = _compliant()
    doc["services"]["workbench"] = json.loads(json.dumps(doc["services"]["workbench"]))
    mutate(doc)
    result = gate.check(_guarded_source(tmp_path), _release_root(tmp_path, doc))
    assert result["status"] == "blocked" and any(expected in p for p in result["problems"]), result


def test_build_script_gates_app_push():
    script = (ROOT / "scripts" / "build-multiarch.sh").read_text(encoding="utf-8")
    assert 'release_storage_gate.py" --workbench-src "$context"' in script
    assert script.index("release_storage_gate.py") < script.index("buildx build\n")


# ── Host preflight ──────────────────────────────────────────────────────────

def test_preflight_fsid_matches_observed_kernel_value():
    assert preflight.ext4_fsid(HDD_UUID) == 0x35F53DF303064F7C


class _Host:
    def __init__(self, monkeypatch, tmp_path, fs_uuid=HDD_UUID, fstype="ext4", options="rw,relatime"):
        self.prefix = str(tmp_path)
        info = {"target": self.prefix, "fstype": fstype, "uuid": fs_uuid, "options": options}
        real = os.statvfs
        fsid = preflight.ext4_fsid(fs_uuid)
        monkeypatch.setattr(preflight, "findmnt", lambda path: info)
        monkeypatch.setattr(preflight.os, "statvfs", lambda p: SimpleNamespace(
            f_fsid=fsid, f_flag=0, f_frsize=4096, f_blocks=1000, f_bavail=600) if str(p).startswith(self.prefix) else real(p))


def _args(tmp_path, command, **kw):
    return SimpleNamespace(command=command, env_file=tmp_path / "missing.env", root=str(tmp_path / "tenants" / "managed"),
                           fs_uuid=HDD_UUID, fs_type="ext4", expected_mount=str(tmp_path), reserve_percent=10.0,
                           storage_id="test", **kw)


def test_preflight_init_creates_only_final_directory_and_marker(tmp_path, monkeypatch):
    _Host(monkeypatch, tmp_path)
    with pytest.raises(preflight.PreflightError, match="parent_missing"):
        preflight.run(_args(tmp_path, "init"))
    assert not (tmp_path / "tenants").exists()
    (tmp_path / "tenants").mkdir()
    result = preflight.run(_args(tmp_path, "init"))
    assert result["status"] == "ok" and result["root_created"] is True
    marker = json.loads((tmp_path / "tenants" / "managed" / preflight.MARKER_NAME).read_text())
    assert marker["fs_uuid"] == HDD_UUID and marker["schema_version"] == 1
    assert not list((tmp_path / "tenants" / "managed").glob("*.tmp"))
    before = (tmp_path / "tenants" / "managed" / preflight.MARKER_NAME).read_bytes()
    assert preflight.run(_args(tmp_path, "init"))["root_created"] is False
    assert (tmp_path / "tenants" / "managed" / preflight.MARKER_NAME).read_bytes() == before  # never replaced


@pytest.mark.parametrize("host, reason", [
    ({"fs_uuid": "11111111-2222-4333-8444-555555555555"}, "filesystem_uuid_mismatch"),
    ({"fstype": "xfs"}, "filesystem_type_mismatch"),
    ({"options": "ro,relatime"}, "read_only"),
])
def test_preflight_init_refuses_wrong_filesystem(tmp_path, monkeypatch, host, reason):
    (tmp_path / "tenants").mkdir()
    _Host(monkeypatch, tmp_path, **host)
    with pytest.raises(preflight.PreflightError, match=reason):
        preflight.run(_args(tmp_path, "init"))
    assert not (tmp_path / "tenants" / "managed").exists()


def test_preflight_check_rejects_missing_and_invalid_marker(tmp_path, monkeypatch):
    root = tmp_path / "tenants" / "managed"
    root.mkdir(parents=True)
    _Host(monkeypatch, tmp_path)
    with pytest.raises(preflight.PreflightError, match="marker_missing"):
        preflight.run(_args(tmp_path, "check"))
    (root / preflight.MARKER_NAME).write_text(json.dumps({"schema_version": 1, "kind": preflight.MARKER_KIND, "fs_uuid": "other"}))
    with pytest.raises(preflight.PreflightError, match="marker_invalid"):
        preflight.run(_args(tmp_path, "check"))


def test_preflight_check_fails_when_disk_not_mounted(tmp_path, monkeypatch):
    # Unmounted: the root directory does not exist on the bare mountpoint.
    _Host(monkeypatch, tmp_path)
    with pytest.raises(preflight.PreflightError, match="root_missing"):
        preflight.run(_args(tmp_path, "check"))


# ── Read-only container inventory ───────────────────────────────────────────

INVENTORY = ROOT / "scripts" / "storage_container_inventory.sh"


def test_inventory_script_uses_only_read_only_docker_commands():
    import re
    text = INVENTORY.read_text(encoding="utf-8")
    code = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#"))
    verbs = set(re.findall(r"\bdocker\s+(\w+)", code))
    assert verbs <= {"ps", "inspect", "exec"}, verbs
    for forbidden in ("rm ", "restart", "stop", "docker cp", "compose up", "unlink", "os.remove", "shutil"):
        assert forbidden not in text.split("set -euo pipefail", 1)[1], forbidden


def test_inventory_walker_reports_metadata_never_contents(tmp_path):
    import subprocess, sys
    text = INVENTORY.read_text(encoding="utf-8")
    inner = text.split("<<'PY' || true\n", 1)[1].split("\nPY\n", 1)[0]
    payload = tmp_path / "storage-ledger" / "abc" / "payload"
    payload.parent.mkdir(parents=True)
    payload.write_bytes(b"SECRET-CONTENT")
    out = subprocess.run([sys.executable, "-I", "-c", inner], env={"FTM_LOCAL_ROOT": str(tmp_path)},
                         capture_output=True, text=True, check=True).stdout
    assert "SECRET-CONTENT" not in out
    tree = next(t for t in json.loads(out)["trees"] if t["path"] == str(tmp_path))
    assert tree["file_count"] == 1 and tree["total_bytes"] == 14
    assert tree["files"][0]["relative_path"] == "storage-ledger/abc/payload"
    assert payload.read_bytes() == b"SECRET-CONTENT"
