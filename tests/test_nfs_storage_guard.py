import importlib.util
import json
import os
import stat
from pathlib import Path

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[1]
SOURCE = '192.168.86.24:/volume1/omnibioai'
UUID = 'f9b2ec0f-7e62-4ee0-85fd-ea0c8d5fbbd5'


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


health_monitor = load('deploy/storage-guard/libexec/omnibioai_nas_health.py', 'nas_health')
layout = load('scripts/storage_nfs_layout.py', 'storage_nfs_layout')


def test_compose_enables_nfs_guard_with_identical_paths_and_read_only_health_mount():
    document = yaml.safe_load((ROOT / 'docker-compose.override.yml').read_text(encoding='utf-8'))
    expected = None
    for name in ('workbench', 'celery-worker'):
        service = document['services'][name]
        env = service['environment']
        selected = {key: env[key] for key in (
            'FTM_LOCAL_ROOT', 'STORAGE_TENANT_ROOT', 'OMNI_OBJECT_STORAGE_DIR',
            'OMNI_OBJECT_REGISTRY_PATH', 'STORAGE_BACKEND_KIND', 'STORAGE_EXPECTED_FS_TYPE',
            'STORAGE_EXPECTED_NFS_SOURCE', 'STORAGE_EXPECTED_FS_UUID', 'STORAGE_HEALTH_STATE_FILE')}
        assert selected['FTM_LOCAL_ROOT'] == '/mnt/nas/omnibioai/tenants/managed'
        assert selected['STORAGE_TENANT_ROOT'] == '/mnt/nas/omnibioai/tenants'
        assert selected['OMNI_OBJECT_STORAGE_DIR'] == '/mnt/nas/omnibioai/tenants/objects'
        assert selected['OMNI_OBJECT_REGISTRY_PATH'] == '/mnt/nas/omnibioai/tenants/object_registry.json'
        assert selected['STORAGE_BACKEND_KIND'] == selected['STORAGE_EXPECTED_FS_TYPE'] == 'nfs'
        assert selected['STORAGE_EXPECTED_NFS_SOURCE'] == SOURCE
        assert selected['STORAGE_EXPECTED_FS_UUID'] == UUID
        assert 'STORAGE_BACKEND_IDENTITY_CHECKS' not in env
        assert 'STORAGE_PHYSICAL_CAPACITY_CHECKS' not in env
        health = next(volume for volume in service['volumes'] if volume.get('target') == '/run/omnibioai')
        assert health == {'type': 'bind', 'source': '/run/omnibioai', 'target': '/run/omnibioai',
                          'read_only': True, 'bind': {'create_host_path': False}}
        assert selected == (expected or selected)
        expected = selected


def _mountinfo(path, mountpoint, source=SOURCE, options='rw'):
    path.write_text(
        '1 0 0:1 / / rw - ext4 /dev/root rw\n'
        f'2 1 0:2 / {mountpoint} {options} - nfs {source} {options}\n', encoding='utf-8')


def test_health_monitor_publishes_expected_available_schema_atomically(tmp_path, monkeypatch):
    mount = tmp_path / 'mnt' / 'nas' / 'omnibioai'
    mount.mkdir(parents=True)
    mountinfo = tmp_path / 'mountinfo'
    _mountinfo(mountinfo, mount)
    body = health_monitor.health(mount, SOURCE, mountinfo=str(mountinfo), now=123)
    assert body == {'schema_version': 1, 'status': 'AVAILABLE', 'observed_at_unix': 123,
                    'roles': [{'role': 'primary', 'ok': True, 'expected_source': SOURCE}]}
    output = tmp_path / 'run' / 'omnibioai' / 'nas-health.json'
    health_monitor.atomic_publish(output, body, require_root=False)
    assert json.loads(output.read_text()) == body
    assert stat.S_IMODE(output.stat().st_mode) == 0o644
    assert not list(output.parent.glob('*.tmp'))


@pytest.mark.parametrize('source,options', [(SOURCE, 'ro'), ('192.168.86.24:/wrong', 'rw')])
def test_health_monitor_reports_unavailable_before_probe(tmp_path, monkeypatch, source, options):
    mount = tmp_path / 'mnt' / 'nas' / 'omnibioai'
    mount.mkdir(parents=True)
    mountinfo = tmp_path / 'mountinfo'
    _mountinfo(mountinfo, mount, source=source, options=options)
    monkeypatch.setattr(health_monitor, 'writable_fresh_probe', lambda path: pytest.fail('must not probe wrong mount'))
    body = health_monitor.health(mount, SOURCE, mountinfo=str(mountinfo), now=456)
    assert body['status'] == 'UNAVAILABLE' and body['roles'][0]['ok'] is False


def test_health_monitor_timeout_fallback_overwrites_lingering_success(monkeypatch):
    published = []
    monkeypatch.setattr(health_monitor, 'atomic_publish', lambda output, body: published.append(body))
    assert health_monitor.main(['--service-result', 'timeout']) == 0
    assert published[0]['status'] == 'UNAVAILABLE' and published[0]['roles'][0]['ok'] is False
    published.clear()
    assert health_monitor.main(['--service-result', 'success']) == 0
    assert published == []


def test_systemd_units_run_as_root_every_sixty_seconds():
    service = (ROOT / 'deploy/storage-guard/systemd/omnibioai-nas-health.service').read_text()
    timer = (ROOT / 'deploy/storage-guard/systemd/omnibioai-nas-health.timer').read_text()
    assert 'User=root' in service and 'Group=root' in service
    assert 'ReadWritePaths=/run/omnibioai /mnt/nas/omnibioai' in service
    assert 'ExecStopPost=' in service and '--service-result=${SERVICE_RESULT}' in service
    assert 'OnUnitActiveSec=60s' in timer


def _layout(tmp_path):
    work = tmp_path / 'work'
    tenant = tmp_path / 'tenants'
    (work / 'objects' / 'ftm-local' / 'storage-ledger/a').mkdir(parents=True)
    (work / 'objects' / 'ftm-local' / 'storage-ledger/a/payload').write_bytes(b'ledger')
    (work / 'objects').joinpath('123e4567-e89b-12d3-a456-426614174000.bin').write_bytes(b'legacy')
    (work / 'object_registry.json').write_text('{"version":1}')
    (tenant / 'managed').mkdir(parents=True)
    (tenant / 'managed' / layout.MARKER).write_text(json.dumps({
        'schema_version': 1, 'kind': layout.MARKER_KIND, 'fs_uuid': UUID,
    }))
    return work, tenant


def test_layout_requires_reviewed_dry_run_and_retains_sources(tmp_path):
    work, tenant = _layout(tmp_path)
    plan = layout.build_plan(work, tenant)
    with pytest.raises(ValueError, match='approved plan hash'):
        layout.apply_plan(plan, 'wrong')
    completed = layout.apply_plan(plan, plan['plan_sha256'])
    assert (tenant / 'managed/storage-ledger/a/payload').read_bytes() == b'ledger'
    assert (tenant / 'objects/123e4567-e89b-12d3-a456-426614174000.bin').read_bytes() == b'legacy'
    assert (tenant / 'object_registry.json').read_text() == '{"version":1}'
    assert (work / 'objects/ftm-local/storage-ledger/a/payload').exists()
    marker = json.loads((tenant / 'managed' / layout.MARKER).read_text())
    assert marker['backing_uuid'] == UUID and marker['role'] == 'primary'
    assert (tenant / 'managed' / (layout.MARKER + '.pre-nfs')).exists()
    assert any(item['kind'] == 'copied_source_retained' for item in completed)
    assert layout.apply_plan(layout.build_plan(work, tenant), layout.build_plan(work, tenant)['plan_sha256'])


def test_layout_reports_existing_symlinked_object_tree_without_copying(tmp_path):
    work, tenant = tmp_path / 'work', tmp_path / 'tenants'
    work.mkdir(); (tenant / 'managed').mkdir(parents=True)
    (tenant / 'managed' / layout.MARKER).write_text(json.dumps({
        'schema_version': 1, 'kind': layout.MARKER_KIND, 'fs_uuid': UUID,
    }))
    shared = tenant / 'objects'
    shared.mkdir()
    (shared / 'legacy.bin').write_bytes(b'legacy')
    (work / 'objects').symlink_to(shared, target_is_directory=True)
    plan = layout.build_plan(work, tenant)
    assert [item['kind'] for item in plan['actions']].count('already_aligned') == 1
    assert not [item for item in plan['actions'] if item['kind'] == 'copy' and item['destination'].endswith('legacy.bin')]
