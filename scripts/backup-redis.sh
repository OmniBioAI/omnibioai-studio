#!/usr/bin/env bash
# Authenticated, encrypted Redis RDB + ACL backup to the approved local tier.
# Phase 1 deliberately does not publish off-host or restore Redis.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib-alert.sh"
REDIS_CONTAINER="${REDIS_BACKUP_CONTAINER:-omnibioai-studio-redis-1}"
REDIS_IMAGE="${REDIS_BACKUP_IMAGE:-redis:7-alpine}"
REDIS_NETWORK="${REDIS_BACKUP_NETWORK:-omnibioai-studio_default}"
REDIS_SERVICE="${REDIS_BACKUP_SERVICE:-redis}"
REDIS_CREDENTIAL_FILE="${REDIS_BACKUP_CREDENTIAL_FILE:-/home/manish/redis-prod-credentials/redis_backup.pass}"
ENCRYPTION_KEY_FILE="${REDIS_BACKUP_ENCRYPTION_KEY_FILE:-/home/manish/redis-prod-credentials/redis_backup_encryption.pass}"
DESTINATION="${REDIS_BACKUP_DESTINATION:-/media/manish/omnibioai-data/secure-backup}"
DESTINATION_DEVICE="${REDIS_BACKUP_DESTINATION_DEVICE:-/dev/sda1}"
MIN_FREE_BYTES="${REDIS_BACKUP_MIN_FREE_BYTES:-1073741824}"
MAX_SNAPSHOT_SECONDS="${REDIS_BACKUP_MAX_SNAPSHOT_SECONDS:-180}"
POLL_SECONDS="${REDIS_BACKUP_POLL_SECONDS:-2}"
HEALTH_FILE="${REDIS_BACKUP_HEALTH_FILE:-${DESTINATION}/redis-backup-health.env}"
LOCK_FILE="${REDIS_BACKUP_LOCK_FILE:-${DESTINATION}/.redis-backup.lock}"
WORK_DIR="${REDIS_BACKUP_WORK_DIR:-${DESTINATION}/.staging}"
RUN_DIR=""; REDIS_ENV=""; ARTIFACT=""; STAGE=init; STATE=NONE
SNAPSHOT_TS=""; VERIFIED_TS=""; TIMESTAMP=""

log() { echo "[INFO] $(date -Iseconds) $*"; }

write_health() {
  local result="$1" stage="$2" artifact="${3:-}" sha="${4:-}" state="${5:-NONE}" tmp="${HEALTH_FILE}.tmp"
  mkdir -p "$(dirname "$HEALTH_FILE")"; chmod 700 "$(dirname "$HEALTH_FILE")" 2>/dev/null || true
  {
    printf 'LAST_ATTEMPT_TS=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'LAST_RESULT=%s\nLAST_STAGE=%s\n' "$result" "$stage"
    printf 'LAST_SNAPSHOT_TS=%s\nLAST_VERIFIED_TS=%s\n' "$SNAPSHOT_TS" "$VERIFIED_TS"
    printf 'LAST_ARTIFACT=%s\nLAST_ARTIFACT_SHA256=%s\nLAST_ARTIFACT_STATE=%s\n' "$artifact" "$sha" "$state"
    printf 'LAST_ARTIFACT_ENCRYPTED=%s\nDESTINATION_DEVICE=%s\n' "$([[ -n "$artifact" ]] && echo true || echo false)" "$DESTINATION_DEVICE"
    printf 'RPO_TARGET_SECONDS=300\nSCHEDULE_INTERVAL_SECONDS=900\n'
  } > "$tmp"
  chmod 600 "$tmp"; mv -f "$tmp" "$HEALTH_FILE"
}

fail() {
  local message="$1"
  write_health failure "$STAGE" "$ARTIFACT" "" "$STATE"
  emit_security_alert redis-backup "${ALERT_CONDITION:-backup_failed}" critical "$message" "stage=$STAGE"
  rm -rf "$RUN_DIR" 2>/dev/null || true
  exit 1
}

cleanup() { rm -f "$REDIS_ENV" 2>/dev/null || true; rm -rf "$RUN_DIR" 2>/dev/null || true; }
trap cleanup EXIT
trap 'fail "unexpected backup command failure"' ERR

require_file() {
  local path="$1" label="$2"
  [[ -f "$path" && -s "$path" ]] || { ALERT_CONDITION=backup_authentication_failed; fail "$label unavailable"; }
  [[ "$(stat -c '%a' "$path")" == 600 ]] || { ALERT_CONDITION=backup_authentication_failed; fail "$label permissions are not 0600"; }
}

check_destination() {
  STAGE=destination
  [[ -d "$DESTINATION" ]] || { ALERT_CONDITION=backup_destination_unavailable; fail "backup destination missing"; }
  local source root_source mode available
  source="$(findmnt -n -o SOURCE -T "$DESTINATION" 2>/dev/null || true)"
  root_source="$(findmnt -n -o SOURCE -T / 2>/dev/null || true)"
  [[ "$source" == "$DESTINATION_DEVICE" ]] || { ALERT_CONDITION=backup_destination_unavailable; fail "backup destination mount source mismatch"; }
  [[ "$source" != "$root_source" ]] || { ALERT_CONDITION=backup_destination_unavailable; fail "backup destination resolves to root filesystem"; }
  mode="$(stat -c '%a' "$DESTINATION")"; [[ "$mode" == 700 ]] || { ALERT_CONDITION=backup_destination_unavailable; fail "backup destination permissions are unsafe"; }
  [[ -w "$DESTINATION" ]] || { ALERT_CONDITION=backup_destination_unavailable; fail "backup destination is not writable"; }
  available="$(df -P -B1 "$DESTINATION" | awk 'NR==2 {print $4}')"
  [[ "$available" =~ ^[0-9]+$ && "$available" -ge "$MIN_FREE_BYTES" ]] || { ALERT_CONDITION=backup_capacity_failure; fail "backup destination free space is below minimum"; }
  mkdir -p "$WORK_DIR"; chmod 700 "$WORK_DIR"
}

make_redis_env() {
  REDIS_ENV="$(mktemp "${RUN_DIR}/redis-env.XXXXXX")"; chmod 600 "$REDIS_ENV"
  { printf 'REDISCLI_AUTH='; cat "$REDIS_CREDENTIAL_FILE"; printf '\n'; } > "$REDIS_ENV"
}

redis_cli() {
  docker run --rm --network "$REDIS_NETWORK" --env-file "$REDIS_ENV" "$REDIS_IMAGE" \
    redis-cli -h "$REDIS_SERVICE" -p 6379 --user redis_backup "$@"
}

persistence_info() { redis_cli INFO persistence | tr '\r' '\n'; }

snapshot() {
  STAGE=precheck
  redis_cli PING >/dev/null || { ALERT_CONDITION=backup_authentication_failed; fail "redis_backup authentication failed"; }
  local before after status started elapsed
  before="$(redis_cli LASTSAVE)" || { ALERT_CONDITION=backup_persistence_failure; fail "LASTSAVE precheck failed"; }
  status="$(persistence_info)" || { ALERT_CONDITION=backup_persistence_failure; fail "persistence inspection failed"; }
  echo "$status" | grep -q '^aof_enabled:1$' || { ALERT_CONDITION=backup_persistence_failure; fail "AOF is not enabled"; }
  echo "$status" | grep -q '^rdb_last_bgsave_status:ok$' || { ALERT_CONDITION=backup_persistence_failure; fail "RDB status is not healthy"; }
  STAGE=snapshot; redis_cli BGSAVE >/dev/null || { ALERT_CONDITION=backup_snapshot_failure; fail "BGSAVE failed"; }
  started="$(date +%s)"
  while :; do
    status="$(persistence_info)" || { ALERT_CONDITION=backup_persistence_failure; fail "persistence polling failed"; }
    if echo "$status" | grep -q '^rdb_bgsave_in_progress:0$' && echo "$status" | grep -q '^rdb_last_bgsave_status:ok$'; then
      after="$(redis_cli LASTSAVE)" || { ALERT_CONDITION=backup_persistence_failure; fail "LASTSAVE postcheck failed"; }
      [[ "$after" =~ ^[0-9]+$ && "$after" -gt "$before" ]] || { ALERT_CONDITION=backup_persistence_failure; fail "LASTSAVE did not advance"; }
      SNAPSHOT_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; return 0
    fi
    elapsed=$(( $(date +%s) - started )); (( elapsed < MAX_SNAPSHOT_SECONDS )) || { ALERT_CONDITION=backup_snapshot_timeout; fail "BGSAVE completion timeout"; }
    sleep "$POLL_SECONDS"
  done
}

encrypt_artifact() {
  STAGE=encryption; ARTIFACT="${DESTINATION}/redis-backup-${TIMESTAMP}.tar.gz.gpg"; local partial="${ARTIFACT}.partial"
  set +e
  trap - ERR
  docker exec "$REDIS_CONTAINER" sh -c 'tar -C /data -cf - dump.rdb users.acl' | gzip -c | \
    gpg --batch --yes --pinentry-mode loopback --passphrase-file "$ENCRYPTION_KEY_FILE" --symmetric --cipher-algo AES256 -o "$partial"
  local -a statuses=("${PIPESTATUS[@]}"); set -e
  trap 'fail "unexpected backup command failure"' ERR
  if (( statuses[0] != 0 || statuses[1] != 0 || statuses[2] != 0 )); then
    ALERT_CONDITION=backup_encryption_failure; rm -f "$partial"; fail "snapshot extraction or encryption failed"
  fi
  [[ -s "$partial" ]] || { ALERT_CONDITION=backup_encryption_failure; fail "encrypted artifact is empty"; }
  mv -f "$partial" "$ARTIFACT"; chmod 600 "$ARTIFACT"; STATE=ENCRYPTED
}

verify_artifact() {
  STAGE=verification; local sha listing
  sha="$(sha256sum "$ARTIFACT" | awk '{print $1}')"
  listing="$(gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$ENCRYPTION_KEY_FILE" --decrypt "$ARTIFACT" | tar -tzf -)" || { ALERT_CONDITION=backup_checksum_failure; fail "encrypted artifact decryption failed"; }
  echo "$listing" | grep -qx 'dump.rdb' || { ALERT_CONDITION=backup_checksum_failure; fail "dump.rdb missing from encrypted artifact"; }
  echo "$listing" | grep -qx 'users.acl' || { ALERT_CONDITION=backup_checksum_failure; fail "users.acl missing from encrypted artifact"; }
  local manifest="${ARTIFACT%.tar.gz.gpg}.manifest.json"
  python3 - "$manifest" "$ARTIFACT" "$sha" "$SNAPSHOT_TS" <<'PY'
import json, sys
from pathlib import Path
manifest, artifact, sha, snapshot = sys.argv[1:]
data = {"schema_version": 1, "state": "VERIFIED", "artifact": Path(artifact).name,
        "artifact_size_bytes": Path(artifact).stat().st_size, "sha256": sha,
        "snapshot_timestamp_utc": snapshot, "redis_version_classification": "redis-7",
        "format": "rdb-acl-v1", "default_user": "off",
        "contains": ["dump.rdb", "users.acl"], "restore_verified": False}
tmp = Path(str(manifest) + ".tmp"); tmp.write_text(json.dumps(data, sort_keys=True) + "\n", encoding="utf-8")
tmp.chmod(0o600); tmp.replace(manifest)
PY
  STATE=VERIFIED; VERIFIED_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; write_health success verification "$ARTIFACT" "$sha" VERIFIED
}

retain() {
  STAGE=retention
  local restore_count; restore_count="$(grep -rl '"restore_verified": true' "$DESTINATION"/*.manifest.json 2>/dev/null || true)"; restore_count="$(printf '%s\n' "$restore_count" | sed '/^$/d' | wc -l)"
  if [[ "$restore_count" -eq 0 ]]; then log "Retention conservative mode: no RESTORE-VERIFIED artifact exists"; return 0; fi
  log "Retention restore-aware mode available; no artifact deleted in Phase 1"
}

main() {
  [[ "${1:-}" != --help ]] || { echo "usage: backup-redis.sh"; return 0; }
  require_file "$REDIS_CREDENTIAL_FILE" "Redis backup credential"; require_file "$ENCRYPTION_KEY_FILE" "Redis backup encryption credential"
  RUN_DIR="$(mktemp -d -p /tmp redis-backup.XXXXXX)"; chmod 700 "$RUN_DIR"
  exec 9>"$LOCK_FILE"; flock -n 9 || { STAGE=lock; ALERT_CONDITION=backup_lock_contention; fail "another Redis backup is already running"; }
  check_destination; make_redis_env; snapshot; TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"; encrypt_artifact; verify_artifact; retain
  log "Redis backup VERIFIED: encrypted artifact published locally"
}
main "$@"
