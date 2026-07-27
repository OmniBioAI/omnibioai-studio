#!/bin/bash
# Config/secrets backup for OmniBioAI Studio
#
# Backs up docker-compose.yml, .env, and any .env.* / docker-compose.override.yml
# files from omnibioai-studio. These files hold live JWT/DB/license secrets --
# if the host is lost, the data can potentially be reconstructed, but the
# running config (especially rotated secrets) cannot be regenerated.
#
# Output is a tar.gz locked to 600 permissions (owner read/write only), since
# the containing directory itself is currently world-writable/readable and
# this backup unlike the others (MySQL dump, Neo4j dump) contains plaintext
# credentials rather than just application data.
#
# Intended to be run from cron, e.g.:
#   0 4 * * * /home/manish/Desktop/machine/omnibioai-studio/scripts/backup-config.sh >> /home/manish/Desktop/machine/work/backups/omnibioai-config-backup.log 2>&1

set -euo pipefail

# Output is GPG-encrypted (AES256, symmetric) rather than just chmod 600,
# because BACKUP_DIR lives on an exFAT mount (fmask=0000,dmask=0000) that
# cannot enforce Unix permissions at all -- chmod silently no-ops there.
# The passphrase file must live on a filesystem that DOES honor permissions
# (e.g. ext4 under $HOME), never on the exFAT backup drive itself.
STUDIO_DIR="/home/manish/Desktop/machine/omnibioai-studio"
BACKUP_DIR="/home/manish/Desktop/machine/work/backups/config"
PASSPHRASE_FILE="/home/manish/.omnibioai-config-backup-passphrase"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVE_NAME="omnibioai-studio-config_${TIMESTAMP}.tar.gz.gpg"

log() {
    echo "[INFO] $(date -Iseconds) $*"
}

err() {
    echo "[ERROR] $(date -Iseconds) $*" >&2
}

if [ ! -f "$PASSPHRASE_FILE" ]; then
    err "Passphrase file not found at ${PASSPHRASE_FILE}."
    err "Create it once with: umask 077 && openssl rand -base64 32 > ${PASSPHRASE_FILE}"
    err "Then chmod 600 ${PASSPHRASE_FILE} and store a copy of that passphrase somewhere safe (password manager) -- if this file is lost, existing backups become unrecoverable."
    exit 1
fi

mkdir -p "$BACKUP_DIR"

log "Starting config backup -> ${BACKUP_DIR}/${ARCHIVE_NAME}"

cd "$STUDIO_DIR"

# Collect whichever of these actually exist -- don't fail if some are absent.
FILES_TO_BACKUP=()
for f in .env .env.local .env.production docker-compose.yml docker-compose.override.yml; do
    if [ -f "$f" ]; then
        FILES_TO_BACKUP+=("$f")
    fi
done

if [ "${#FILES_TO_BACKUP[@]}" -eq 0 ]; then
    err "No config files found in ${STUDIO_DIR} -- nothing to back up."
    exit 1
fi

log "Including: ${FILES_TO_BACKUP[*]}"

SCRATCH_ARCHIVE=$(mktemp)
trap 'rm -f "$SCRATCH_ARCHIVE"' EXIT
tar -czf "$SCRATCH_ARCHIVE" "${FILES_TO_BACKUP[@]}"

gpg --batch --yes --pinentry-mode loopback \
    --passphrase-file "$PASSPHRASE_FILE" \
    --symmetric --cipher-algo AES256 \
    -o "${BACKUP_DIR}/${ARCHIVE_NAME}" \
    "$SCRATCH_ARCHIVE"

SIZE=$(du -h "${BACKUP_DIR}/${ARCHIVE_NAME}" | cut -f1)
log "Backup complete — ${SIZE} written to ${BACKUP_DIR}/${ARCHIVE_NAME} (GPG-encrypted, AES256)"

# Prune archives older than RETENTION_DAYS
find "$BACKUP_DIR" -maxdepth 1 -name 'omnibioai-studio-config_*.tar.gz.gpg' -mtime "+${RETENTION_DAYS}" -print -delete | while read -r f; do
    log "Pruned old backup: $f"
done

log "Done."