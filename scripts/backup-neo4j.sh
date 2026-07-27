#!/bin/bash
# Neo4j offline dump backup for OmniBioAI
#
# Stops the live neo4j container briefly (typically <5s for this dataset size),
# dumps via a throwaway container against the same named volume (avoids file
# lock conflicts without needing Enterprise's online `STOP DATABASE`), then
# restarts the live service. Prunes dumps older than RETENTION_DAYS.
#
# Intended to be run from cron, e.g.:
#   0 4 * * * /home/manish/Desktop/machine/omnibioai-studio/scripts/backup-neo4j.sh >> /home/manish/Desktop/machine/work/backups/omnibioai-neo4j-backup.log 2>&1

set -euo pipefail

CONTAINER_NAME="omnibioai-studio-neo4j-1"
VOLUME_NAME="omnibioai-studio_neo4j_data"
NEO4J_IMAGE="neo4j:5.15"
BACKUP_DIR="/home/manish/Desktop/machine/work/backups/neo4j"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_NAME="neo4j_${TIMESTAMP}.dump"

log() {
    echo "[INFO] $(date -Iseconds) $*"
}

err() {
    echo "[ERROR] $(date -Iseconds) $*" >&2
}

mkdir -p "$BACKUP_DIR"

log "Starting Neo4j backup -> ${BACKUP_DIR}/${DUMP_NAME}"

WAS_RUNNING=false
if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    WAS_RUNNING=true
    log "Stopping ${CONTAINER_NAME} for offline dump"
    docker stop "$CONTAINER_NAME" > /dev/null
fi

# Use a scratch dir per run so a failed dump can't be mistaken for a
# successful one already sitting in BACKUP_DIR under the final name.
# chmod 777: the neo4j image runs as its own non-root "neo4j" user inside
# the container, which otherwise can't write into a dir owned by the host
# user with default (700) mktemp permissions.
SCRATCH_DIR=$(mktemp -d)
chmod 777 "$SCRATCH_DIR"
trap 'rm -rf "$SCRATCH_DIR"' EXIT

if docker run --rm \
    -v "${VOLUME_NAME}:/data" \
    -v "${SCRATCH_DIR}:/backups" \
    "$NEO4J_IMAGE" \
    neo4j-admin database dump neo4j --to-path=/backups; then
    mv "${SCRATCH_DIR}/neo4j.dump" "${BACKUP_DIR}/${DUMP_NAME}"
    SIZE=$(du -h "${BACKUP_DIR}/${DUMP_NAME}" | cut -f1)
    log "Backup complete — ${SIZE} written to ${BACKUP_DIR}/${DUMP_NAME}"
    DUMP_STATUS=0
else
    err "neo4j-admin dump failed — see output above"
    DUMP_STATUS=1
fi

if [ "$WAS_RUNNING" = true ]; then
    log "Restarting ${CONTAINER_NAME}"
    docker start "$CONTAINER_NAME" > /dev/null
fi

# Prune dumps older than RETENTION_DAYS
find "$BACKUP_DIR" -maxdepth 1 -name 'neo4j_*.dump' -mtime "+${RETENTION_DAYS}" -print -delete | while read -r f; do
    log "Pruned old backup: $f"
done

if [ "$DUMP_STATUS" -ne 0 ]; then
    err "Done with errors."
    exit 1
fi

log "Done."