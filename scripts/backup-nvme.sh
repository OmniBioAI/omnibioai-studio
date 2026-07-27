#!/bin/bash
# NVMe data backup for OmniBioAI
#
# rsyncs the local data directory to the external omnibioai-data drive, then
# writes a fresh entry into backup_status.json so the control-center
# dashboard's Backup Status panel reflects what actually happened, instead
# of a hand-edited value that silently goes stale.
#
# NOTE: does NOT use --delete. Files removed from the source will remain in
# the destination indefinitely (safer default -- a bad/empty source run
# can't wipe out an otherwise-good backup). If you want a strict mirror
# instead, add --delete deliberately and understand the tradeoff.
#
# Intended to be run from cron, e.g.:
#   0 1 * * * /home/manish/Desktop/machine/omnibioai-studio/scripts/backup-nvme.sh >> /home/manish/Desktop/machine/work/backups/omnibioai-nvme-backup.log 2>&1

set -euo pipefail

SRC="/home/manish/Desktop/machine/data/"
DEST_MOUNT="/media/manish/omnibioai-data"
DEST="${DEST_MOUNT}/data/"
STATUS_FILE="/home/manish/Desktop/machine/work/backup_status.json"
TARGET_NAME="omnibioai-data"

log() {
    echo "[INFO] $(date -Iseconds) $*"
}

err() {
    echo "[ERROR] $(date -Iseconds) $*" >&2
}

# Fail loudly (not silently) if the external drive isn't mounted -- rsync
# into a missing mountpoint would otherwise just fill up the root filesystem.
if ! mountpoint -q "$DEST_MOUNT"; then
    err "${DEST_MOUNT} is not mounted -- is the drive plugged in? Aborting without touching backup_status.json."
    exit 1
fi

log "Starting rsync: ${SRC} -> ${DEST}"

RSYNC_STATUS="success"
if ! rsync -a --info=stats2 "$SRC" "$DEST"; then
    err "rsync exited with a non-zero status"
    RSYNC_STATUS="failed"
fi

SIZE_MB=$(du -sm "$DEST" 2>/dev/null | cut -f1 || echo 0)
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

log "Backup ${RSYNC_STATUS} — ${SIZE_MB} MB at ${DEST}"

python3 - "$STATUS_FILE" "$TARGET_NAME" "$NOW_ISO" "$RSYNC_STATUS" "$SIZE_MB" "$DEST_MOUNT" << 'PYEOF'
import json
import sys
from pathlib import Path

status_file, target, ts, status, size_mb, destination = sys.argv[1:7]
path = Path(status_file)

backups = []
if path.exists():
    try:
        backups = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(backups, list):
            backups = []
    except Exception:
        backups = []

entry = {
    "target": target,
    "last_backup_at": ts,
    "status": status,
    "size_mb": float(size_mb),
    "destination": destination,
}

replaced = False
for i, b in enumerate(backups):
    if b.get("target") == target:
        backups[i] = entry
        replaced = True
        break
if not replaced:
    backups.append(entry)

path.write_text(json.dumps(backups, indent=2), encoding="utf-8")
PYEOF

log "Updated ${STATUS_FILE}"

if [ "$RSYNC_STATUS" != "success" ]; then
    err "Done with errors."
    exit 1
fi

log "Done."