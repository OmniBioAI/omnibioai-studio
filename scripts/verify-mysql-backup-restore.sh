#!/usr/bin/env bash
# verify-mysql-backup-restore.sh — prove a real backup-mysql.sh artifact
# is actually restorable, using an isolated, throwaway, network-isolated
# MySQL container. Never touches the production container or production
# credentials for anything beyond a read-only structural comparison.
#
# A backup is not evidence of recoverability until this has been run
# against it. See omnibioai-docs/security/mysql_backup_recovery_evidence.md.
#
# Usage:
#   ./scripts/verify-mysql-backup-restore.sh [path/to/omnibioai_TIMESTAMP.sql.gz]
#   (defaults to the artifact recorded in mysql-backup-health.env)
#
# Exit 0 = restore verified structurally sound. Non-zero = it isn't —
# do not treat the source backup as proven recoverable.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HEALTH_FILE="${BACKUP_HEALTH_FILE:-${SCRIPT_DIR}/../work/backups/mysql-backup-health.env}"

ARTIFACT="${1:-}"
if [[ -z "$ARTIFACT" ]]; then
  [[ -f "$HEALTH_FILE" ]] || { echo "[FAIL] no artifact given and no health file at ${HEALTH_FILE}" >&2; exit 1; }
  ARTIFACT="$(grep -m1 '^LAST_ARTIFACT=' "$HEALTH_FILE" | cut -d= -f2-)"
fi
[[ -f "$ARTIFACT" ]] || { echo "[FAIL] backup artifact not found: ${ARTIFACT}" >&2; exit 1; }

IMAGE="${MYSQL_RESTORE_IMAGE:-mysql:8.0}"
RUN_ID="$(date +%s)_$$"
TARGET="omnibioai-mysql-restore-verify-${RUN_ID}"
SCRATCH="$(mktemp -d -p /tmp omnibioai-mysql-restore-verify.XXXXXX)"
DECOMPRESSED="${SCRATCH}/restore.sql"

cleanup() {
  docker rm -f "${TARGET}" >/dev/null 2>&1 || true
  rm -rf -- "${SCRATCH}"
}
trap cleanup EXIT

echo "[INFO] $(date -Iseconds) Verifying restorability of: ${ARTIFACT}"

# ── Integrity, independent of backup-mysql.sh's own check ──────
gzip -t "${ARTIFACT}" || { echo "[FAIL] gzip integrity check failed on ${ARTIFACT}" >&2; exit 1; }
if [[ -f "${ARTIFACT}.sha256" ]]; then
  ( cd "$(dirname "${ARTIFACT}")" && sha256sum -c "$(basename "${ARTIFACT}").sha256" --status ) \
    || { echo "[FAIL] sha256 checksum mismatch for ${ARTIFACT}" >&2; exit 1; }
  echo "[OK]   sha256 checksum verified"
else
  echo "[WARN] no .sha256 sidecar found for ${ARTIFACT} — skipping checksum verification"
fi

zcat "${ARTIFACT}" > "${DECOMPRESSED}"
[[ -s "${DECOMPRESSED}" ]] || { echo "[FAIL] decompressed dump is empty" >&2; exit 1; }

# ── Expected structure, derived from the dump itself (deterministic —
#    not subject to timing drift against a live, possibly-changing DB) ─
mapfile -t EXPECTED_DBS < <(grep -oE '^CREATE DATABASE.*`[a-zA-Z0-9_]+`' "${DECOMPRESSED}" \
  | grep -oE '`[a-zA-Z0-9_]+`$' | tr -d '`' | sort -u)
EXPECTED_TABLE_COUNT="$(grep -c '^CREATE TABLE' "${DECOMPRESSED}")"
echo "[INFO] Dump declares ${#EXPECTED_DBS[@]} database(s), ${EXPECTED_TABLE_COUNT} table(s) total"

# ── Isolated restore target ─────────────────────────────────────
docker run -d --name "${TARGET}" --network none \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes "${IMAGE}" >/dev/null

for attempt in $(seq 1 60); do
  docker exec "${TARGET}" mysqladmin ping -uroot --silent >/dev/null 2>&1 && break
  sleep 1
  [[ "$attempt" -eq 60 ]] && { echo "[FAIL] restore target did not become ready" >&2; exit 1; }
done

echo "[INFO] $(date -Iseconds) Restoring into isolated container ${TARGET} (--network none)"
docker exec -i "${TARGET}" mysql -uroot < "${DECOMPRESSED}"
echo "[OK]   mysql restore command completed"

# ── Structural verification: does the restored instance actually
#    contain what the dump said it would? ────────────────────────
FAIL=0
for db in "${EXPECTED_DBS[@]}"; do
  [[ "$db" == "mysql" || "$db" == "sys" || "$db" == "performance_schema" || "$db" == "information_schema" ]] && continue
  present="$(docker exec "${TARGET}" mysql -N -B -uroot -e \
    "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${db}'")"
  if [[ "$present" -ne 1 ]]; then
    echo "[FAIL] database '${db}' missing after restore" >&2
    FAIL=1
    continue
  fi
  restored_tables="$(docker exec "${TARGET}" mysql -N -B -uroot -e \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${db}'")"
  expected_tables="$(grep -c "^CREATE TABLE \`" "${DECOMPRESSED}" || true)"
  # per-db expected count via awk sectioning (dump is one file, all DBs)
  expected_tables_db="$(awk -v db="\`${db}\`" '
    $0 ~ "^USE " db { in_db=1; next }
    $0 ~ /^USE `/ && $0 !~ db { in_db=0 }
    in_db && /^CREATE TABLE/ { c++ }
    END { print c+0 }
  ' "${DECOMPRESSED}")"
  echo "[INFO] ${db}: restored ${restored_tables} table(s), dump declared ${expected_tables_db} table(s) for this schema"
  if [[ "$restored_tables" -ne "$expected_tables_db" ]]; then
    echo "[FAIL] table count mismatch for '${db}': restored=${restored_tables} expected=${expected_tables_db}" >&2
    FAIL=1
  fi
done

# ── Representative aggregate row counts (safe — counts only, no
#    content) for the highest-value tables: the audit ledger and the
#    auth ledger, if present. ────────────────────────────────────
for probe in "omnibioai_audit.audit_events" "omnibioai.audit_events"; do
  db="${probe%%.*}"; tbl="${probe#*.}"
  exists="$(docker exec "${TARGET}" mysql -N -B -uroot -e \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${db}' AND table_name='${tbl}'" 2>/dev/null || echo 0)"
  if [[ "$exists" == "1" ]]; then
    rows="$(docker exec "${TARGET}" mysql -N -B -uroot -e "SELECT COUNT(*) FROM \`${db}\`.\`${tbl}\`")"
    echo "[INFO] restored ${probe}: ${rows} row(s) (aggregate count only — no row content inspected)"
  fi
done

if [[ "$FAIL" -eq 0 ]]; then
  echo "[PASS] $(date -Iseconds) Restore structurally verified: all declared databases and table counts present in the isolated restore target."
  # Record restore-test evidence alongside the backup health file.
  if [[ -f "$HEALTH_FILE" ]]; then
    grep -v '^LAST_RESTORE_TEST' "$HEALTH_FILE" > "${HEALTH_FILE}.tmp" 2>/dev/null || true
    {
      echo "LAST_RESTORE_TEST_TS=$(date -Iseconds)"
      echo "LAST_RESTORE_TEST_ARTIFACT=${ARTIFACT}"
      echo "LAST_RESTORE_TEST_RESULT=pass"
    } >> "${HEALTH_FILE}.tmp"
    mv -f "${HEALTH_FILE}.tmp" "$HEALTH_FILE"
  fi
  exit 0
else
  echo "[FAIL] $(date -Iseconds) Restore verification found structural mismatches — see above." >&2
  exit 1
fi
