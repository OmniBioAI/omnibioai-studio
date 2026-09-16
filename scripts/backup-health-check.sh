#!/usr/bin/env bash
# backup-health-check.sh — independent MySQL backup freshness signal.
#
# Deliberately separate from backup-mysql.sh: if the backup script had
# some future bug that made it *look* successful without actually
# producing a usable artifact, a check living inside that same script
# could share the bug. This one only reads the health-status file
# backup-mysql.sh writes and judges it from the outside.
#
# No external alerting platform (Prometheus alerting/PagerDuty/etc.)
# was found wired up for this host as of the 2026-09-16 incident (see
# omnibioai-docs/security/mysql_backup_recovery_evidence.md) — this
# script is the strongest available local signal until one exists.
# Recommended: run independently on a schedule, e.g.
#   0 */6 * * * /home/manish/Desktop/machine/omnibioai-studio/scripts/backup-health-check.sh >> /home/manish/Desktop/machine/work/backups/omnibioai-backup-health-check.log 2>&1
# (this line is a recommendation, not installed by this script —
# crontab changes are left to the operator to review and apply.)
#
# Exit 0 = healthy. Exit 1 = stale or failed — treat as needing attention.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HEALTH_FILE="${BACKUP_HEALTH_FILE:-${SCRIPT_DIR}/../work/backups/mysql-backup-health.env}"
MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-30}"  # daily-at-4am backup + buffer

if [[ ! -f "$HEALTH_FILE" ]]; then
  echo "[FAIL] $(date -Iseconds) no health file at ${HEALTH_FILE} — no evidence a backup has ever run"
  exit 1
fi

LAST_RESULT=""
LAST_STAGE=""
LAST_SUCCESS_TS=""
LAST_ATTEMPT_TS=""
LAST_ARTIFACT=""
while IFS='=' read -r k v; do
  case "$k" in
    LAST_RESULT) LAST_RESULT="$v" ;;
    LAST_STAGE) LAST_STAGE="$v" ;;
    LAST_SUCCESS_TS) LAST_SUCCESS_TS="$v" ;;
    LAST_ATTEMPT_TS) LAST_ATTEMPT_TS="$v" ;;
    LAST_ARTIFACT) LAST_ARTIFACT="$v" ;;
  esac
done < "$HEALTH_FILE"

FAIL=0

if [[ -z "$LAST_SUCCESS_TS" ]]; then
  echo "[FAIL] $(date -Iseconds) no successful backup recorded yet"
  FAIL=1
else
  NOW_EPOCH="$(date +%s)"
  SUCCESS_EPOCH="$(date -d "$LAST_SUCCESS_TS" +%s 2>/dev/null || echo 0)"
  if [[ "$SUCCESS_EPOCH" -eq 0 ]]; then
    echo "[FAIL] $(date -Iseconds) LAST_SUCCESS_TS in health file is unparseable: '${LAST_SUCCESS_TS}'"
    FAIL=1
  else
    AGE_HOURS=$(( (NOW_EPOCH - SUCCESS_EPOCH) / 3600 ))
    if [[ "$AGE_HOURS" -gt "$MAX_AGE_HOURS" ]]; then
      echo "[FAIL] $(date -Iseconds) last successful backup is ${AGE_HOURS}h old (max ${MAX_AGE_HOURS}h) — ${LAST_SUCCESS_TS}"
      FAIL=1
    else
      echo "[OK]   $(date -Iseconds) last successful backup ${AGE_HOURS}h ago (${LAST_SUCCESS_TS}), artifact: ${LAST_ARTIFACT}"
    fi
  fi
fi

if [[ "$LAST_RESULT" == "failure" ]]; then
  echo "[WARN] $(date -Iseconds) most recent attempt (${LAST_ATTEMPT_TS}) FAILED at stage '${LAST_STAGE}' — even if an older backup is still within the age threshold, today's run needs investigation"
  FAIL=1
fi

if [[ -n "$LAST_ARTIFACT" && ! -f "$LAST_ARTIFACT" ]]; then
  echo "[FAIL] $(date -Iseconds) recorded artifact no longer exists on disk: ${LAST_ARTIFACT}"
  FAIL=1
fi

exit "$FAIL"
