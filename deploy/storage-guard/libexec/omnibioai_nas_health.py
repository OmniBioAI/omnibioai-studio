#!/usr/bin/env python3
"""Publish a root-owned, atomic health statement for the Workbench NFS guard."""
import argparse
import json
import os
import secrets
import stat
import tempfile
import time
from pathlib import Path


SCHEMA_VERSION = 1


def _unescape(value):
    return value.replace('\\040', ' ').replace('\\011', '\t').replace('\\012', '\n').replace('\\134', '\\')


def mount_identity(path, mountinfo='/proc/self/mountinfo'):
    target = os.path.abspath(path)
    best = ''
    identity = (None, None, set())
    with open(mountinfo, encoding='utf-8') as handle:
        for line in handle:
            left, separator, right = line.partition(' - ')
            fields = left.split()
            right_fields = right.split()
            if not separator or len(fields) < 6 or len(right_fields) < 3:
                continue
            point = _unescape(fields[4])
            inside = target == point or point == '/' or target.startswith(point.rstrip('/') + '/')
            if inside and len(point) >= len(best):
                options = set(fields[5].split(',')) | set(right_fields[2].split(','))
                best = point
                identity = (right_fields[0], _unescape(right_fields[1]), options)
    return identity


def writable_fresh_probe(mountpoint):
    """Force a write/read/fsync round trip through the mounted filesystem."""
    root = Path(mountpoint)
    token = secrets.token_bytes(32)
    name = f'.omnibioai-nas-health-{os.getpid()}-{secrets.token_hex(8)}'
    path = root / name
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.write(fd, token)
        os.fsync(fd)
        os.lseek(fd, 0, os.SEEK_SET)
        if os.read(fd, len(token) + 1) != token:
            raise OSError('NFS probe read-back mismatch')
    finally:
        os.close(fd)
        path.unlink(missing_ok=True)


def health(mountpoint, expected_source, mountinfo='/proc/self/mountinfo', now=None):
    ok = False
    try:
        fs_type, source, options = mount_identity(mountpoint, mountinfo)
        if fs_type not in ('nfs', 'nfs4') or source != expected_source or 'rw' not in options or 'ro' in options:
            raise OSError('NFS mount identity or mode mismatch')
        writable_fresh_probe(mountpoint)
        ok = True
    except (OSError, ValueError):
        ok = False
    return {
        'schema_version': SCHEMA_VERSION,
        'status': 'AVAILABLE' if ok else 'UNAVAILABLE',
        'observed_at_unix': int(time.time() if now is None else now),
        'roles': [{'role': 'primary', 'ok': ok, 'expected_source': expected_source}],
    }


def atomic_publish(output, body, require_root=True):
    if require_root and os.geteuid() != 0:
        raise PermissionError('health publisher must run as root')
    output = Path(output)
    output.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.nas-health.', suffix='.tmp', dir=output.parent)
    try:
        os.fchmod(fd, 0o644)
        if require_root:
            os.fchown(fd, 0, 0)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump(body, handle, sort_keys=True, separators=(',', ':'))
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, output)
        directory = os.open(output.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
    metadata = output.stat()
    if stat.S_IMODE(metadata.st_mode) != 0o644 or (require_root and (metadata.st_uid, metadata.st_gid) != (0, 0)):
        raise PermissionError('health state ownership or mode is invalid')


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--mountpoint', default='/mnt/nas/omnibioai')
    parser.add_argument('--expected-source', default='192.168.86.24:/volume1/omnibioai')
    parser.add_argument('--output', default='/run/omnibioai/nas-health.json')
    parser.add_argument('--service-result', help='ExecStopPost result; publish UNAVAILABLE unless it is success')
    args = parser.parse_args(argv)
    if args.service_result is not None:
        if args.service_result == 'success':
            return 0
        body = {
            'schema_version': SCHEMA_VERSION, 'status': 'UNAVAILABLE',
            'observed_at_unix': int(time.time()),
            'roles': [{'role': 'primary', 'ok': False, 'expected_source': args.expected_source}],
        }
        atomic_publish(args.output, body)
        return 0
    body = health(args.mountpoint, args.expected_source)
    atomic_publish(args.output, body)
    return 0 if body['status'] == 'AVAILABLE' else 1


if __name__ == '__main__':
    raise SystemExit(main())
