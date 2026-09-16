#!/usr/bin/env bash
# backup-mysql.sh — Daily MySQL backup for OmniBioAI
#
# Dumps all databases, compresses, checksums, and atomically publishes
# the archive (a partially-written dump is never mistaken for a
# completed backup). Retains the last RETAIN_DAYS days, but never
# deletes the last remaining good backup even if it's older than that.
# Every run — success or failure — updates a small health-status file
# so backup age/result can be checked without grepping a log.
#
# Usage:
#   ./scripts/backup-mysql.sh                    # uses .env defaults
#   BACKUP_DIR=/mnt/nas/backups ./scripts/backup-mysql.sh
#
# Cron (daily at 4am):
#   0 4 * * * /home/manish/Desktop/machine/omnibioai-studio/scripts/backup-mysql.sh >> /home/manish/Desktop/machine/work/backups/omnibioai-backup.log 2>&1
#
# --- 2026-09-16 incident (read before touching the .env-loading logic) ---
# The previous loader was `source <(grep -v '^#' "$ENV_FILE" | grep -v
# '^$')`, which feeds every KEY=VALUE line to the bash parser, not just
# to variable assignment. A rotated secret whose value contained
# parentheses produced a bash syntax error under `set -e`, so the
# script aborted before the dump ever ran — every night, for ~5 weeks,
# with the failure visible only in a log file nobody was watching. Full
# incident write-up: ../../omnibioai-docs/security/mysql_backup_recovery_evidence.md
# Fix: scripts/lib-env.sh's load_env_file() parses KEY=VALUE as literal
# text (pure parameter expansion, no source/eval/process-substitution),
# so no value's content can break the parser. Do not revert to `source`.
#
# --- Track E4: backup encryption at rest ---
# Uses the same GPG symmetric AES256 pattern already established by
# scripts/backup-config.sh and omnibioai-utils/backup-system-state.sh
# (not a new cryptographic scheme) -- but a DEDICATED passphrase file,
# never the config-backup passphrase: this dump contains the HIPAA
# audit evidence itself (omnibioai_audit.audit_events), so mixing its
# key with the general credentials-backup key would mean one passphrase
# compromise exposes both. See MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE
# and MYSQL_BACKUP_REQUIRE_ENCRYPTION below.
#
# Rollout, matching this codebase's established opt-in convention
# (Track E3's WRITER_DATABASE_URL/READER_DATABASE_URL): an unconfigured
# deployment behaves exactly as before this change (plaintext .sql.gz)
# -- the live nightly cron job is not broken by this. Encryption
# activates the moment a passphrase file is configured, or is required
# outright via MYSQL_BACKUP_REQUIRE_ENCRYPTION=true. Once either signal
# is present, there is no plaintext fallback: a missing/unreadable key
# or a failing gpg command fails the whole backup closed.

set -euo pipefail

# ── Config ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${OMNIBIOAI_ENV_FILE:-${SCRIPT_DIR}/../.env}"

# shellcheck source=./lib-env.sh
source "${SCRIPT_DIR}/lib-env.sh"
# shellcheck source=./lib-alert.sh
source "${SCRIPT_DIR}/lib-alert.sh"

set -a
load_env_file "$ENV_FILE"
set +a

BACKUP_DIR="${BACKUP_DIR:-${SCRIPT_DIR}/../work/backups/mysql}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"
CONTAINER="${MYSQL_CONTAINER:-omnibioai-studio-mysql-1}"
HEALTH_FILE="${BACKUP_HEALTH_FILE:-${BACKUP_DIR}/../mysql-backup-health.env}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
# Encryption config: no default passphrase-file path is baked in here
# (unlike backup-config.sh's hardcoded PASSPHRASE_FILE) -- this must be
# an explicit, dedicated operator decision, never silently inherited.
ENCRYPTION_PASSPHRASE_FILE="${MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE:-}"
REQUIRE_ENCRYPTION="${MYSQL_BACKUP_REQUIRE_ENCRYPTION:-false}"
DUMP_FILE="${BACKUP_DIR}/omnibioai_${TIMESTAMP}.sql.gz"
DUMP_TMP="${DUMP_FILE}.partial"
STAGE="init"
ARTIFACT_SHA256=""
ARTIFACT_SIZE_BYTES=""
ENCRYPTED="false"
# Set once the encrypt stage decides the real final path -- everything
# before that stage operates on DUMP_FILE/DUMP_TMP unconditionally.
OUT_FILE=""
TMP_FILE=""

mkdir -p "$BACKUP_DIR" "$(dirname "$HEALTH_FILE")"

# ── Failure visibility (Phase 5) ────────────────────────────────
# record_health() is called on every exit path, success or failure, so
# "last successful backup" and "last attempt" are always answerable
# from a file instead of requiring a log grep. A failed run preserves
# the previous LAST_SUCCESS_TS/LAST_ARTIFACT* fields verbatim — a
# failure must never make backup age look better, and must never erase
# the record of the last known-good artifact.
record_health() {
  local result="$1" now
  now="$(date -Iseconds)"
  local prior_success="" prior_artifact="" prior_size="" prior_sha="" prior_encrypted=""
  if [[ -f "$HEALTH_FILE" ]]; then
    prior_success="$(grep -m1 '^LAST_SUCCESS_TS=' "$HEALTH_FILE" 2>/dev/null | cut -d= -f2- || true)"
    prior_artifact="$(grep -m1 '^LAST_ARTIFACT=' "$HEALTH_FILE" 2>/dev/null | cut -d= -f2- || true)"
    prior_size="$(grep -m1 '^LAST_ARTIFACT_SIZE_BYTES=' "$HEALTH_FILE" 2>/dev/null | cut -d= -f2- || true)"
    prior_sha="$(grep -m1 '^LAST_ARTIFACT_SHA256=' "$HEALTH_FILE" 2>/dev/null | cut -d= -f2- || true)"
    prior_encrypted="$(grep -m1 '^LAST_ARTIFACT_ENCRYPTED=' "$HEALTH_FILE" 2>/dev/null | cut -d= -f2- || true)"
  fi
  {
    echo "LAST_ATTEMPT_TS=${now}"
    echo "LAST_RESULT=${result}"
    echo "LAST_STAGE=${STAGE}"
    if [[ "$result" == "success" ]]; then
      echo "LAST_SUCCESS_TS=${now}"
      echo "LAST_ARTIFACT=${OUT_FILE}"
      echo "LAST_ARTIFACT_SIZE_BYTES=${ARTIFACT_SIZE_BYTES}"
      echo "LAST_ARTIFACT_SHA256=${ARTIFACT_SHA256}"
      echo "LAST_ARTIFACT_ENCRYPTED=${ENCRYPTED}"
    else
      echo "LAST_SUCCESS_TS=${prior_success}"
      echo "LAST_ARTIFACT=${prior_artifact}"
      echo "LAST_ARTIFACT_SIZE_BYTES=${prior_size}"
      echo "LAST_ARTIFACT_SHA256=${prior_sha}"
      echo "LAST_ARTIFACT_ENCRYPTED=${prior_encrypted}"
    fi
  } > "${HEALTH_FILE}.tmp"
  mv -f "${HEALTH_FILE}.tmp" "$HEALTH_FILE"
}

# fail(): the single exit path for every anticipated failure. Records
# health, removes any partial artifact -- plaintext AND any partial
# ciphertext (never publish a partial dump, encrypted or not, and never
# leave a plaintext .partial lying around after an encryption failure)
# -- and exits non-zero so the scheduler sees the failure.
fail() {
  local msg="$1" code="${2:-1}"
  echo "[ERROR] $(date -Iseconds) ${msg} (stage: ${STAGE})" >&2
  record_health "failure"
  rm -f "${DUMP_TMP}" "${DUMP_TMP}.gpg" "${TMP_FILE}" 2>/dev/null || true
  # Track E4 (breadth pass): a distinct condition for the encrypt stage
  # specifically (backup_encryption_failed) vs. every other stage
  # (backup_failed) -- an operator alerting on "encryption is broken"
  # needs to distinguish that from "the dump itself failed" or "the
  # container wasn't running". Never includes MYSQL_ROOT_PASSWORD or the
  # passphrase file's contents -- $msg is always a static or
  # path/stage-only string, checked at every call site above.
  local alert_condition="backup_failed"
  [[ "$STAGE" == "encrypt" ]] && alert_condition="backup_encryption_failed"
  emit_security_alert "mysql-backup" "$alert_condition" "critical" "$msg" "stage=${STAGE}"
  exit "$code"
}
# Safety net for any command that fails without an explicit check below.
trap 'fail "unexpected command failure" "$?"' ERR

# Fail closed: no fallback password. If this isn't set, stop here.
# Deliberately an explicit `if`/fail() call, not `: "${VAR:?msg}"` — a
# `:?` parameter-expansion error is a fatal shell error that bypasses
# the ERR trap entirely (confirmed empirically), so it would exit
# without ever calling record_health(), leaving this specific failure
# invisible in the health file even though the process exit code was
# still non-zero.
STAGE="credentials"
if [[ -z "${MYSQL_ROOT_PASSWORD:-}" ]]; then
  fail "MYSQL_ROOT_PASSWORD must be set in the protected environment"
fi

# ── Pre-flight ────────────────────────────────────────────────
STAGE="preflight"
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  fail "MySQL container '${CONTAINER}' not running"
fi

# ── Dump + compress (to a .partial file — never the final name) ─
STAGE="dump"
echo "[INFO] $(date -Iseconds) Starting MySQL backup → ${DUMP_FILE}"

# errexit and the ERR trap are two independent mechanisms — `set +e`
# alone only suppresses errexit's auto-exit, it does NOT stop the ERR
# trap from firing on the pipe's failure. And `|| true` right after the
# pipe clobbers PIPESTATUS (the `true` that then runs becomes the new
# "last pipeline", overwriting PIPESTATUS with its own single-element
# status). So both errexit AND the trap are suspended around the pipe,
# PIPESTATUS is captured immediately, then both are restored before we
# make our own stage-specific decision from PIPESTATUS.
set +e
trap - ERR
docker exec \
  -e MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" \
  "${CONTAINER}" \
  mysqldump \
    -uroot \
    --all-databases \
    --single-transaction \
    --quick \
    --lock-tables=false \
| gzip > "${DUMP_TMP}"
PIPE_STATUS=("${PIPESTATUS[@]}")
set -e
trap 'fail "unexpected command failure" "$?"' ERR

if [[ "${PIPE_STATUS[0]}" -ne 0 ]]; then
  STAGE="dump"
  fail "mysqldump exited ${PIPE_STATUS[0]}"
fi
if [[ "${PIPE_STATUS[1]}" -ne 0 ]]; then
  STAGE="compress"
  fail "gzip exited ${PIPE_STATUS[1]}"
fi

# ── Integrity verification (of the plaintext dump) ──────────────
STAGE="verify"
gzip -t "${DUMP_TMP}" || fail "compressed archive failed integrity check (gzip -t)"
[[ -s "${DUMP_TMP}" ]] || fail "backup archive is empty"

# ── Encryption at rest (Track E4) ────────────────────────────────
# Opt-in by either signal: MYSQL_BACKUP_REQUIRE_ENCRYPTION=true (an
# explicit "this deployment must never produce a plaintext backup"),
# or simply configuring a passphrase file (encrypt automatically once
# a key exists -- no separate flag needed to "turn on" what an
# operator already provisioned). Absent both signals, behavior is
# unchanged from before this feature: a plaintext .sql.gz, matching
# the live nightly cron job that already depends on that shape.
STAGE="encrypt"
if [[ -n "$ENCRYPTION_PASSPHRASE_FILE" || "$REQUIRE_ENCRYPTION" == "true" ]]; then
  if [[ -z "$ENCRYPTION_PASSPHRASE_FILE" ]]; then
    fail "MYSQL_BACKUP_REQUIRE_ENCRYPTION=true but MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE is not set"
  fi
  if [[ ! -s "$ENCRYPTION_PASSPHRASE_FILE" ]]; then
    fail "encryption passphrase file missing or empty: ${ENCRYPTION_PASSPHRASE_FILE}"
  fi
  if ! command -v gpg >/dev/null 2>&1; then
    fail "gpg is required for backup encryption but is not on PATH"
  fi
  # No fallback: any gpg failure here goes straight to fail(), which
  # removes both the plaintext .partial and any partial ciphertext --
  # a failed encryption attempt can never leave a plaintext artifact
  # published in its place.
  if ! gpg --batch --yes --pinentry-mode loopback \
        --passphrase-file "$ENCRYPTION_PASSPHRASE_FILE" \
        --symmetric --cipher-algo AES256 \
        -o "${DUMP_TMP}.gpg" "${DUMP_TMP}"; then
    fail "gpg encryption failed"
  fi
  rm -f "${DUMP_TMP}"  # minimize plaintext-on-disk window -- ciphertext is now the only copy
  TMP_FILE="${DUMP_TMP}.gpg"
  OUT_FILE="${DUMP_FILE}.gpg"
  ENCRYPTED="true"
else
  TMP_FILE="${DUMP_TMP}"
  OUT_FILE="${DUMP_FILE}"
  ENCRYPTED="false"
fi

ARTIFACT_SHA256="$(sha256sum "${TMP_FILE}" | cut -d' ' -f1)"

# ── Atomic publication (Phase 4) ────────────────────────────────
# Everything above wrote only to the .partial path. The rename below
# is the one moment a backup becomes "real" — a reader can never
# observe a half-written file at the final name.
STAGE="publish"
mv -f "${TMP_FILE}" "${OUT_FILE}"
echo "${ARTIFACT_SHA256}  $(basename "${OUT_FILE}")" > "${OUT_FILE}.sha256"
ARTIFACT_SIZE_BYTES="$(stat -c%s "${OUT_FILE}")"

SIZE="$(du -sh "${OUT_FILE}" | cut -f1)"
echo "[INFO] $(date -Iseconds) Backup complete — ${SIZE} written to ${OUT_FILE} (encrypted: ${ENCRYPTED}, sha256 ${ARTIFACT_SHA256:0:12}...)"

STAGE="health"
record_health "success"

# ── Retention (only reachable after a successful, published backup) ─
# Never deletes the last remaining backup regardless of its age —
# retention must not be able to leave zero recovery points.
STAGE="retention"
# Matches both plaintext (.sql.gz) and encrypted (.sql.gz.gpg) artifact
# names -- a deployment may have a mix of historical plaintext backups
# and newer encrypted ones after encryption is turned on, and both
# must still be subject to the same retention window.
mapfile -t ALL_BACKUPS < <(find "${BACKUP_DIR}" -maxdepth 1 \( -name "omnibioai_*.sql.gz" -o -name "omnibioai_*.sql.gz.gpg" \) | sort)
mapfile -t CANDIDATES < <(find "${BACKUP_DIR}" -maxdepth 1 \( -name "omnibioai_*.sql.gz" -o -name "omnibioai_*.sql.gz.gpg" \) -mtime "+${RETAIN_DAYS}" | sort)
TOTAL_COUNT="${#ALL_BACKUPS[@]}"
DELETED=0
for f in "${CANDIDATES[@]}"; do
  [[ -z "$f" ]] && continue
  if (( TOTAL_COUNT - DELETED <= 1 )); then
    echo "[WARN] $(date -Iseconds) retention stopped — would delete the last remaining backup (${f})" >&2
    break
  fi
  rm -f -- "$f" "${f}.sha256"
  DELETED=$((DELETED + 1))
  echo "[INFO] $(date -Iseconds) Rotated $(basename "$f")"
done
if [[ "$DELETED" -gt 0 ]]; then
  echo "[INFO] $(date -Iseconds) Rotated ${DELETED} backup(s) older than ${RETAIN_DAYS} days"
fi

STAGE="done"
echo "[INFO] $(date -Iseconds) Done."
