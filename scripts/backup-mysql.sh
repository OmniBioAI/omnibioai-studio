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

set -euo pipefail

# ── Config ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${OMNIBIOAI_ENV_FILE:-${SCRIPT_DIR}/../.env}"

# shellcheck source=./lib-env.sh
source "${SCRIPT_DIR}/lib-env.sh"

set -a
load_env_file "$ENV_FILE"
set +a

BACKUP_DIR="${BACKUP_DIR:-${SCRIPT_DIR}/../work/backups/mysql}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"
CONTAINER="${MYSQL_CONTAINER:-omnibioai-studio-mysql-1}"
HEALTH_FILE="${BACKUP_HEALTH_FILE:-${BACKUP_DIR}/../mysql-backup-health.env}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${BACKUP_DIR}/omnibioai_${TIMESTAMP}.sql.gz"
TMP_FILE="${OUT_FILE}.partial"
STAGE="init"
ARTIFACT_SHA256=""
ARTIFACT_SIZE_BYTES=""

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
  local prior_success="" prior_artifact="" prior_size="" prior_sha=""
  if [[ -f "$HEALTH_FILE" ]]; then
    prior_success="$(grep -m1 '^LAST_SUCCESS_TS=' "$HEALTH_FILE" 2>/dev/null | cut -d= -f2- || true)"
    prior_artifact="$(grep -m1 '^LAST_ARTIFACT=' "$HEALTH_FILE" 2>/dev/null | cut -d= -f2- || true)"
    prior_size="$(grep -m1 '^LAST_ARTIFACT_SIZE_BYTES=' "$HEALTH_FILE" 2>/dev/null | cut -d= -f2- || true)"
    prior_sha="$(grep -m1 '^LAST_ARTIFACT_SHA256=' "$HEALTH_FILE" 2>/dev/null | cut -d= -f2- || true)"
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
    else
      echo "LAST_SUCCESS_TS=${prior_success}"
      echo "LAST_ARTIFACT=${prior_artifact}"
      echo "LAST_ARTIFACT_SIZE_BYTES=${prior_size}"
      echo "LAST_ARTIFACT_SHA256=${prior_sha}"
    fi
  } > "${HEALTH_FILE}.tmp"
  mv -f "${HEALTH_FILE}.tmp" "$HEALTH_FILE"
}

# fail(): the single exit path for every anticipated failure. Records
# health, removes any partial artifact (never publish a partial dump),
# and exits non-zero so the scheduler sees the failure.
fail() {
  local msg="$1" code="${2:-1}"
  echo "[ERROR] $(date -Iseconds) ${msg} (stage: ${STAGE})" >&2
  record_health "failure"
  rm -f "${TMP_FILE}" 2>/dev/null || true
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
echo "[INFO] $(date -Iseconds) Starting MySQL backup → ${OUT_FILE}"

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
| gzip > "${TMP_FILE}"
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

# ── Integrity verification ──────────────────────────────────────
STAGE="verify"
gzip -t "${TMP_FILE}" || fail "compressed archive failed integrity check (gzip -t)"
[[ -s "${TMP_FILE}" ]] || fail "backup archive is empty"
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
echo "[INFO] $(date -Iseconds) Backup complete — ${SIZE} written to ${OUT_FILE} (sha256 ${ARTIFACT_SHA256:0:12}...)"

STAGE="health"
record_health "success"

# ── Retention (only reachable after a successful, published backup) ─
# Never deletes the last remaining backup regardless of its age —
# retention must not be able to leave zero recovery points.
STAGE="retention"
mapfile -t ALL_BACKUPS < <(find "${BACKUP_DIR}" -maxdepth 1 -name "omnibioai_*.sql.gz" | sort)
mapfile -t CANDIDATES < <(find "${BACKUP_DIR}" -maxdepth 1 -name "omnibioai_*.sql.gz" -mtime "+${RETAIN_DAYS}" | sort)
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
