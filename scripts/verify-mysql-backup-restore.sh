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
#   ./scripts/verify-mysql-backup-restore.sh [path/to/omnibioai_TIMESTAMP.sql.gz[.gpg]]
#   (defaults to the artifact recorded in mysql-backup-health.env)
#
# If the artifact is GPG-encrypted (Track E4 -- filename ends in .gpg),
# MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE must point at the same
# passphrase file backup-mysql.sh used to produce it. Wrong key or a
# corrupted ciphertext both fail this script closed (gpg's own exit
# code is checked explicitly, never ignored) -- a "restore" that
# silently skipped decryption or swallowed a decrypt failure would be
# worse than no restore test at all.
#
# Exit 0 = restore verified structurally sound. Non-zero = it isn't —
# do not treat the source backup as proven recoverable.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HEALTH_FILE="${BACKUP_HEALTH_FILE:-${SCRIPT_DIR}/../work/backups/mysql-backup-health.env}"
# shellcheck source=./lib-alert.sh
source "${SCRIPT_DIR}/lib-alert.sh"

ARTIFACT="${1:-}"

record_restore_test_result() {
  local result="$1"
  [[ -f "$HEALTH_FILE" ]] || return 0
  grep -v '^LAST_RESTORE_TEST' "$HEALTH_FILE" > "${HEALTH_FILE}.tmp" 2>/dev/null || true
  {
    echo "LAST_RESTORE_TEST_TS=$(date -Iseconds)"
    echo "LAST_RESTORE_TEST_ARTIFACT=${ARTIFACT}"
    echo "LAST_RESTORE_TEST_RESULT=${result}"
  } >> "${HEALTH_FILE}.tmp"
  mv -f "${HEALTH_FILE}.tmp" "$HEALTH_FILE"
}

# fail(): single failure exit path (Track E4 breadth pass) -- records the
# restore-test result and emits a security alert before exiting, same
# discipline as backup-mysql.sh's own fail(). Never silently exits 1
# without both side-effects.
fail() {
  local msg="$1"
  echo "[FAIL] $(date -Iseconds) ${msg}" >&2
  record_restore_test_result "fail"
  emit_security_alert "mysql-restore-verify" "restore_verification_failed" "critical" "$msg" "artifact=$(basename "${ARTIFACT:-unknown}")"
  exit 1
}

if [[ -z "$ARTIFACT" ]]; then
  [[ -f "$HEALTH_FILE" ]] || fail "no artifact given and no health file at ${HEALTH_FILE}"
  ARTIFACT="$(grep -m1 '^LAST_ARTIFACT=' "$HEALTH_FILE" | cut -d= -f2-)"
fi
[[ -f "$ARTIFACT" ]] || fail "backup artifact not found: ${ARTIFACT}"

IMAGE="${MYSQL_RESTORE_IMAGE:-mysql:8.0}"
RUN_ID="$(date +%s)_$$"
TARGET="omnibioai-mysql-restore-verify-${RUN_ID}"
SCRATCH="$(mktemp -d -p /tmp omnibioai-mysql-restore-verify.XXXXXX)"
DECRYPTED_GZ="${SCRATCH}/restore.sql.gz"
DECOMPRESSED="${SCRATCH}/restore.sql"

cleanup() {
  docker rm -f "${TARGET}" >/dev/null 2>&1 || true
  rm -rf -- "${SCRATCH}"
}
trap cleanup EXIT

echo "[INFO] $(date -Iseconds) Verifying restorability of: ${ARTIFACT}"

# ── Checksum, over whatever was actually published (ciphertext if
#    encrypted) -- independent of backup-mysql.sh's own check ──────
if [[ -f "${ARTIFACT}.sha256" ]]; then
  ( cd "$(dirname "${ARTIFACT}")" && sha256sum -c "$(basename "${ARTIFACT}").sha256" --status ) \
    || fail "sha256 checksum mismatch for ${ARTIFACT}"
  echo "[OK]   sha256 checksum verified"
else
  echo "[WARN] no .sha256 sidecar found for ${ARTIFACT} — skipping checksum verification"
fi

# ── Decryption (only if the artifact is encrypted) ───────────────
GZ_ARTIFACT="${ARTIFACT}"
if [[ "${ARTIFACT}" == *.gpg ]]; then
  [[ -n "${MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE:-}" ]] \
    || fail "artifact is encrypted (${ARTIFACT}) but MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE is not set"
  [[ -s "${MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE}" ]] \
    || fail "encryption passphrase file missing or empty: ${MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE}"
  echo "[INFO] $(date -Iseconds) Decrypting ${ARTIFACT}"
  # Explicit exit-code check, not `|| true` and not relying on `set -e`
  # alone -- a wrong passphrase or corrupted ciphertext must fail this
  # script closed, never proceed to restore whatever gpg partially wrote.
  if ! gpg --batch --yes --pinentry-mode loopback \
        --passphrase-file "${MYSQL_BACKUP_ENCRYPTION_PASSPHRASE_FILE}" \
        -o "${DECRYPTED_GZ}" -d "${ARTIFACT}"; then
    rm -f "${DECRYPTED_GZ}"
    fail "gpg decryption failed (wrong passphrase or corrupted ciphertext) for ${ARTIFACT}"
  fi
  [[ -s "${DECRYPTED_GZ}" ]] || fail "decrypted output is empty: ${ARTIFACT}"
  echo "[OK]   decryption succeeded"
  GZ_ARTIFACT="${DECRYPTED_GZ}"
fi

# ── Integrity of the (now-plaintext) compressed dump ─────────────
gzip -t "${GZ_ARTIFACT}" || fail "gzip integrity check failed on ${GZ_ARTIFACT}"

zcat "${GZ_ARTIFACT}" > "${DECOMPRESSED}"
[[ -s "${DECOMPRESSED}" ]] || fail "decompressed dump is empty"

# ── Expected structure, derived from the dump itself (deterministic —
#    not subject to timing drift against a live, possibly-changing DB) ─
mapfile -t EXPECTED_DBS < <(grep -oE '^CREATE DATABASE.*`[a-zA-Z0-9_]+`' "${DECOMPRESSED}" \
  | grep -oE '`[a-zA-Z0-9_]+`$' | tr -d '`' | sort -u)
EXPECTED_TABLE_COUNT="$(grep -c '^CREATE TABLE' "${DECOMPRESSED}")"
echo "[INFO] Dump declares ${#EXPECTED_DBS[@]} database(s), ${EXPECTED_TABLE_COUNT} table(s) total"

# ── Isolated restore target ─────────────────────────────────────
docker run -d --name "${TARGET}" --network none \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes "${IMAGE}" >/dev/null

# Diagnosed root cause of the previously-reported intermittent restore
# failure ("Lost connection to MySQL server during query", non-
# deterministic line number): this container is always started fresh,
# with no persisted data volume, so the official mysql:8.0 entrypoint
# always runs a two-phase startup on it -- a throwaway "temporary
# server" first (to run first-run initialization scripts), which is
# then STOPPED and replaced by the real server. Confirmed directly
# against this image: the temporary server responds to
# `mysqladmin ping` exactly like the real one (same socket), and its
# own log line sequence is:
#   "Starting temporary server" -> ready -> "Stopping temporary server"
#   -> "Temporary server stopped" -> ready (the real server, this time
#   also listening on the TCP port, not just the socket)
# A ping-only readiness check can therefore succeed against the
# temporary server, let the restore begin, and then have the
# connection killed out from under it when the temporary server is
# replaced -- exactly the symptom seen. Fix: wait for the explicit
# "Temporary server stopped" marker in the container's own logs BEFORE
# starting the ping-based readiness wait, so a `mysqladmin ping`
# success can only mean the real, final server. Bounded and fails
# closed (never an unbounded wait) via MYSQL_INIT_WAIT_SECONDS.
INIT_WAIT_SECONDS="${MYSQL_INIT_WAIT_SECONDS:-90}"
for attempt in $(seq 1 "$INIT_WAIT_SECONDS"); do
  docker logs "${TARGET}" 2>&1 | grep -q "Temporary server stopped" && break
  sleep 1
  [[ "$attempt" -eq "$INIT_WAIT_SECONDS" ]] && fail "restore target's temporary initialization server did not stop within ${INIT_WAIT_SECONDS}s -- real server never started"
done

PING_WAIT_SECONDS="${MYSQL_READY_WAIT_SECONDS:-60}"
for attempt in $(seq 1 "$PING_WAIT_SECONDS"); do
  docker exec "${TARGET}" mysqladmin ping -uroot --silent >/dev/null 2>&1 && break
  sleep 1
  [[ "$attempt" -eq "$PING_WAIT_SECONDS" ]] && fail "restore target did not become ready"
done

echo "[INFO] $(date -Iseconds) Restoring into isolated container ${TARGET} (--network none)"
docker exec -i "${TARGET}" mysql -uroot < "${DECOMPRESSED}" \
  || fail "mysql restore command failed -- see docker exec output above"
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

# ── Track E4: does the audit-hardening (E3) structure survive restore,
#    not just the raw data? Skipped (not failed) on a dump that
#    legitimately never had the audit stack deployed alongside it.
#
# Deliberately targets ONLY omnibioai_audit (the omnibioai-security-audit
# service's own configured database -- see AuditConfig.DATABASE_URL),
# never a same-named-table match in a different database. Diagnosed
# during this track: the live host also has an unrelated
# `omnibioai.audit_events` table (a different, older, non-Track-E3
# table belonging to another service) -- an earlier version of this
# check picked whichever of the two matched last in the loop above and
# wrongly reported the real omnibioai_audit hardening as "missing"
# because it was actually checking the OTHER table. ─────────────────
AUDIT_DB=""
has_hardened_db="$(docker exec "${TARGET}" mysql -N -B -uroot -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='omnibioai_audit' AND table_name='audit_events'" 2>/dev/null || echo 0)"
[[ "$has_hardened_db" == "1" ]] && AUDIT_DB="omnibioai_audit"

if [[ -n "$AUDIT_DB" ]]; then
  echo "[INFO] Verifying E3 audit-hardening structures in ${AUDIT_DB} survived restore"

  has_hash_col="$(docker exec "${TARGET}" mysql -N -B -uroot -e \
    "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='${AUDIT_DB}' AND table_name='audit_events' AND column_name='record_integrity_hash'")"
  if [[ "$has_hash_col" == "1" ]]; then
    echo "[OK]   record_integrity_hash (stored-record integrity metadata) column present"
  else
    echo "[FAIL] record_integrity_hash column missing on ${AUDIT_DB}.audit_events after restore" >&2
    FAIL=1
  fi

  has_legal_hold="$(docker exec "${TARGET}" mysql -N -B -uroot -e \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${AUDIT_DB}' AND table_name='audit_legal_holds'")"
  if [[ "$has_legal_hold" == "1" ]]; then
    echo "[OK]   audit_legal_holds table present"
  else
    echo "[FAIL] audit_legal_holds table missing on ${AUDIT_DB} after restore" >&2
    FAIL=1
  fi

  trigger_count="$(docker exec "${TARGET}" mysql -N -B -uroot -e \
    "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='${AUDIT_DB}' AND event_object_table='audit_events'")"
  echo "[INFO] ${trigger_count} trigger(s) declared on ${AUDIT_DB}.audit_events after restore"
  if [[ "$trigger_count" -lt 1 ]]; then
    echo "[FAIL] no triggers found on ${AUDIT_DB}.audit_events after restore -- append-only enforcement did not survive" >&2
    FAIL=1
  else
    # Functional probe, not just schema existence: insert one synthetic
    # row (test data, never restored PHI) and confirm an UPDATE against
    # it is actually rejected by the restored trigger. This is the
    # strongest evidence available that append-only enforcement, not
    # merely the trigger's SQL text, survived the restore.
    if docker exec "${TARGET}" mysql -uroot -e \
      "INSERT INTO \`${AUDIT_DB}\`.audit_events (event_id, timestamp, service, event_type, action) VALUES ('e4-restore-probe', NOW(), 'e4-probe', 'probe', 'probe')" \
      2>/dev/null; then
      update_output="$(docker exec "${TARGET}" mysql -uroot -e \
        "UPDATE \`${AUDIT_DB}\`.audit_events SET action='tampered' WHERE event_id='e4-restore-probe'" 2>&1)"; update_rc=$?
      if [[ "$update_rc" -ne 0 ]] && echo "$update_output" | grep -qi "append-only"; then
        echo "[OK]   append-only trigger functionally rejected a real UPDATE attempt on the restored table"
      else
        echo "[FAIL] restored audit_events table did NOT reject a real UPDATE attempt (rc=${update_rc}) -- append-only enforcement did not survive restore" >&2
        FAIL=1
      fi
    else
      echo "[WARN] could not insert a synthetic probe row into restored ${AUDIT_DB}.audit_events -- functional append-only probe skipped (schema/insert issue, not itself a restore failure)"
    fi
  fi
fi

if [[ "$FAIL" -eq 0 ]]; then
  echo "[PASS] $(date -Iseconds) Restore structurally verified: all declared databases and table counts present in the isolated restore target."
  record_restore_test_result "pass"
  emit_security_alert "mysql-restore-verify" "restore_verification_passed_recovered" "info" "Automated restore verification passed" "artifact=$(basename "${ARTIFACT}")"
  exit 0
else
  fail "Restore verification found structural mismatches — see above for details"
fi
