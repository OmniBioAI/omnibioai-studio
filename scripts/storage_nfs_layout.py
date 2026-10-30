#!/usr/bin/env python3
"""Plan or apply the no-delete move from legacy Workbench paths to the NAS layout."""
import argparse
import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path


MARKER = '.omnibioai-storage-identity.json'
MARKER_KIND = 'omnibioai-managed-storage'


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def _file_action(source, destination):
    try:
        already_aligned = destination.exists() and os.path.samefile(source, destination)
    except OSError:
        already_aligned = False
    if already_aligned:
        return {'kind': 'already_aligned', 'path': str(destination),
                'bytes': source.stat().st_size, 'sha256': digest(source)}
    return {'kind': 'copy', 'source': str(source), 'destination': str(destination),
            'bytes': source.stat().st_size, 'sha256': digest(source)}


def build_plan(source_work_root, tenant_root):
    source_work_root, tenant_root = Path(source_work_root), Path(tenant_root)
    actions = []
    legacy_objects = source_work_root / 'objects'
    legacy_ftm = legacy_objects / 'ftm-local'
    if legacy_ftm.is_dir():
        for source in sorted(path for path in legacy_ftm.rglob('*') if path.is_file() and not path.is_symlink()):
            actions.append(_file_action(source, tenant_root / 'managed' / source.relative_to(legacy_ftm)))
    if legacy_objects.is_dir():
        for source in sorted(path for path in legacy_objects.rglob('*') if path.is_file() and not path.is_symlink()
                             and legacy_ftm not in path.parents):
            actions.append(_file_action(source, tenant_root / 'objects' / source.relative_to(legacy_objects)))
    registry = source_work_root / 'object_registry.json'
    if registry.is_file() and not registry.is_symlink():
        actions.append(_file_action(registry, tenant_root / 'object_registry.json'))

    marker = tenant_root / 'managed' / MARKER
    if not marker.is_file() or marker.is_symlink():
        raise ValueError('managed storage identity marker is missing or unsafe')
    body = json.loads(marker.read_text(encoding='utf-8'))
    backing_uuid = body.get('backing_uuid') or body.get('fs_uuid')
    if body.get('schema_version') != 1 or body.get('kind') != MARKER_KIND or not backing_uuid:
        raise ValueError('managed storage identity marker is invalid')
    desired = dict(body)
    desired['backing_uuid'] = backing_uuid
    desired['role'] = 'primary'
    actions.append({'kind': 'marker_verified' if body == desired else 'marker_update',
                    'path': str(marker), 'before_sha256': digest(marker), 'body': desired})
    encoded = json.dumps(actions, sort_keys=True, separators=(',', ':')).encode()
    return {'schema_version': 1, 'actions': actions, 'plan_sha256': hashlib.sha256(encoded).hexdigest()}


def _atomic_json(path, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f'.{path.name}.', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump(body, handle, sort_keys=True, indent=2)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def apply_plan(plan, approved_plan_sha256):
    if approved_plan_sha256 != plan['plan_sha256']:
        raise ValueError('approved plan hash does not match current dry-run plan')
    completed = []
    for action in plan['actions']:
        if action['kind'] == 'copy':
            source, destination = Path(action['source']), Path(action['destination'])
            if digest(source) != action['sha256'] or source.stat().st_size != action['bytes']:
                raise ValueError(f'source changed after dry run: {source}')
            if destination.exists():
                if not destination.is_file() or digest(destination) != action['sha256']:
                    raise ValueError(f'destination conflict: {destination}')
                completed.append({'kind': 'already_present', 'destination': str(destination)})
                continue
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
            temporary = destination.parent / f'.{destination.name}.storage-layout-{os.getpid()}.tmp'
            with source.open('rb') as source_handle, temporary.open('xb') as destination_handle:
                shutil.copyfileobj(source_handle, destination_handle, 1024 * 1024)
                destination_handle.flush()
                os.fsync(destination_handle.fileno())
            if digest(temporary) != action['sha256']:
                temporary.unlink(missing_ok=True)
                raise ValueError(f'copy verification failed: {destination}')
            os.link(temporary, destination)
            temporary.unlink()
            completed.append({'kind': 'copied_source_retained', 'destination': str(destination)})
        elif action['kind'] == 'marker_update':
            marker = Path(action['path'])
            if digest(marker) != action['before_sha256']:
                current = json.loads(marker.read_text(encoding='utf-8'))
                if current != action['body']:
                    raise ValueError('identity marker changed after dry run')
                completed.append({'kind': 'marker_already_updated', 'path': str(marker)})
                continue
            backup = marker.with_name(marker.name + '.pre-nfs')
            if not backup.exists():
                os.link(marker, backup)
            _atomic_json(marker, action['body'])
            completed.append({'kind': 'marker_updated_backup_retained', 'path': str(marker)})
        elif action['kind'] == 'marker_verified':
            completed.append({'kind': 'marker_already_updated', 'path': action['path']})
        else:
            completed.append({'kind': 'already_aligned', 'path': action['path']})
    return completed


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-work-root', required=True)
    parser.add_argument('--tenant-root', default='/mnt/nas/omnibioai/tenants')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--dry-run', action='store_true')
    mode.add_argument('--apply', action='store_true')
    parser.add_argument('--approved-plan-sha256')
    parser.add_argument('--report')
    args = parser.parse_args(argv)
    plan = build_plan(args.source_work_root, args.tenant_root)
    result = {'mode': 'dry-run', **plan}
    if args.apply:
        if not args.approved_plan_sha256:
            parser.error('--apply requires --approved-plan-sha256 from a reviewed dry run')
        result['mode'] = 'apply'
        result['completed'] = apply_plan(plan, args.approved_plan_sha256)
    rendered = json.dumps(result, sort_keys=True, indent=2) + '\n'
    if args.report:
        Path(args.report).write_text(rendered, encoding='utf-8')
    print(rendered, end='')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
