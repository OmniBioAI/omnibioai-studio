#!/usr/bin/env bash
# backup-mysql.sh — Daily MySQL backup for OmniBioAI
# Dumps all databases to compressed files, retains last 7 days.
#
# Usage:
#   ./scripts/backup-mysql.sh                    # uses .env defaults
#   BACKUP_DIR=/mnt/nas/backups ./scripts/backup-mysql.sh
#
# Cron (daily at 2am):
#   0 2 * * * /home/manish/Desktop/machine/omnibioai-studio/scripts/backup-mysql.sh >> /var/log/omnibioai-backup.log 2>&1

set -euo pipefail

# ── Config ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"

# Load .env if present
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -v '^#' "$ENV_FILE" | grep -v '^$')
  set +a
fi

MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-omnibioai}"
BACKUP_DIR="${BACKUP_DIR:-${SCRIPT_DIR}/../work/backups/mysql}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"
CONTAINER="${MYSQL_CONTAINER:-omnibioai-studio-mysql-1}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${BACKUP_DIR}/omnibioai_${TIMESTAMP}.sql.gz"

# ── Pre-flight ────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "[ERROR] $(date -Iseconds) MySQL container '${CONTAINER}' not running" >&2
  exit 1
fi

# ── Dump ──────────────────────────────────────────────────────
echo "[INFO] $(date -Iseconds) Starting MySQL backup → ${OUT_FILE}"

docker exec "${CONTAINER}" \
  mysqldump \
    -uroot \
    -p"${MYSQL_ROOT_PASSWORD}" \
    --all-databases \
    --single-transaction \
    --quick \
    --lock-tables=false \
| gzip > "${OUT_FILE}"

SIZE=$(du -sh "${OUT_FILE}" | cut -f1)
echo "[INFO] $(date -Iseconds) Backup complete — ${SIZE} written to ${OUT_FILE}"

# ── Rotate old backups ────────────────────────────────────────
DELETED=$(find "${BACKUP_DIR}" -name "omnibioai_*.sql.gz" \
  -mtime "+${RETAIN_DAYS}" -print -delete | wc -l)
if [[ "$DELETED" -gt 0 ]]; then
  echo "[INFO] $(date -Iseconds) Rotated ${DELETED} backup(s) older than ${RETAIN_DAYS} days"
fi

echo "[INFO] $(date -Iseconds) Done."
