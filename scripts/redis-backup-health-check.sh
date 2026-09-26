#!/usr/bin/env bash
# Independent local freshness/state check. External notification is not claimed.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib-alert.sh"
source "${SCRIPT_DIR}/lib-env.sh"
DESTINATION="${REDIS_BACKUP_DESTINATION:-/media/manish/omnibioai-data/secure-backup}"
DESTINATION_DEVICE="${REDIS_BACKUP_DESTINATION_DEVICE:-/dev/sda1}"
HEALTH_FILE="${REDIS_BACKUP_HEALTH_FILE:-${DESTINATION}/redis-backup-health.env}"
MAX_AGE_SECONDS="${REDIS_BACKUP_MAX_AGE_SECONDS:-1200}"
fail_check() { emit_security_alert redis-backup stale_backup critical "$1"; echo "[FAIL] $1"; exit 1; }
[[ -f "$HEALTH_FILE" ]] || fail_check "Redis backup health state is missing"
load_env_file "$HEALTH_FILE"
[[ "${LAST_RESULT:-}" == success && "${LAST_ARTIFACT_STATE:-}" == VERIFIED ]] || fail_check "last Redis backup is not VERIFIED"
[[ -n "${LAST_VERIFIED_TS:-}" ]] || fail_check "last verified timestamp is missing"
epoch="$(date -d "$LAST_VERIFIED_TS" +%s 2>/dev/null || echo 0)"; [[ "$epoch" -gt 0 ]] || fail_check "last verified timestamp is invalid"
age=$(( $(date +%s) - epoch )); (( age <= MAX_AGE_SECONDS )) || fail_check "last verified Redis backup is stale"
[[ -f "${LAST_ARTIFACT:-}" ]] || fail_check "last verified artifact is missing"
[[ "$(findmnt -n -o SOURCE -T "$DESTINATION" 2>/dev/null || true)" == "$DESTINATION_DEVICE" ]] || fail_check "backup destination mount is not the approved device"
[[ "$(stat -c '%a' "$DESTINATION")" == 700 ]] || fail_check "backup destination permissions are unsafe"
actual="$(sha256sum "$LAST_ARTIFACT" | awk '{print $1}')"; [[ "$actual" == "${LAST_ARTIFACT_SHA256:-}" ]] || fail_check "last verified artifact checksum mismatch"
printf '[OK] Redis backup VERIFIED age=%ss rpo_target=300s schedule_interval=900s\n' "$age"
