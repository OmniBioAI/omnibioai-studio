#!/usr/bin/env bash
# Disposable synthetic MySQL backup/restore drill. Never connects to the
# OmniBioAI production container and never uses runtime credentials.
set -euo pipefail

IMAGE="${MYSQL_DRILL_IMAGE:-mysql:8.0}"
RUN_ID="$(date +%s)_$$"
SOURCE="omnibioai-mysql-drill-source-${RUN_ID}"
TARGET="omnibioai-mysql-drill-target-${RUN_ID}"
SCRATCH="$(mktemp -d -p /tmp omnibioai-mysql-drill.XXXXXX)"
DUMP="${SCRATCH}/synthetic.sql"

cleanup() {
  docker rm -f "${SOURCE}" "${TARGET}" >/dev/null 2>&1 || true
  rm -rf -- "${SCRATCH}"
}
trap cleanup EXIT

wait_mysql() {
  local container="$1"
  local attempt
  for attempt in $(seq 1 60); do
    if docker exec "${container}" mysqladmin ping -uroot --silent >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "[FAIL] ${container} did not become ready within 60 seconds" >&2
  return 1
}

started_ns="$(date +%s%N)"
docker run -d --name "${SOURCE}" --network none \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes "${IMAGE}" >/dev/null
wait_mysql "${SOURCE}"

docker exec "${SOURCE}" mysql -uroot -e '
  CREATE DATABASE readiness_drill;
  USE readiness_drill;
  CREATE TABLE samples (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    sample_key VARCHAR(64) NOT NULL UNIQUE,
    payload VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_samples_created (created_at)
  ) ENGINE=InnoDB;
  INSERT INTO samples(sample_key,payload) VALUES
    ("sample-a","synthetic-alpha"),
    ("sample-b","synthetic-beta"),
    ("sample-c","synthetic-gamma");
' >/dev/null

backup_started_ns="$(date +%s%N)"
docker exec "${SOURCE}" mysqldump -uroot --databases readiness_drill \
  --single-transaction --quick --lock-tables=false \
  --routines --events --triggers >"${DUMP}"
backup_finished_ns="$(date +%s%N)"
[[ -s "${DUMP}" ]] || { echo "[FAIL] synthetic dump is empty" >&2; exit 1; }

docker run -d --name "${TARGET}" --network none \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes "${IMAGE}" >/dev/null
wait_mysql "${TARGET}"
restore_started_ns="$(date +%s%N)"
docker exec -i "${TARGET}" mysql -uroot <"${DUMP}"
restore_finished_ns="$(date +%s%N)"

row_count="$(docker exec "${TARGET}" mysql -N -B -uroot -e 'SELECT COUNT(*) FROM readiness_drill.samples')"
index_count="$(docker exec "${TARGET}" mysql -N -B -uroot -e "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema='readiness_drill' AND table_name='samples' AND index_name='idx_samples_created'")"
constraint_count="$(docker exec "${TARGET}" mysql -N -B -uroot -e "SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema='readiness_drill' AND table_name='samples' AND constraint_type IN ('PRIMARY KEY','UNIQUE')")"
docker exec "${TARGET}" mysql -uroot -e "INSERT INTO readiness_drill.samples(sample_key,payload) VALUES ('sample-after-restore','synthetic-write-check')" >/dev/null
post_write_count="$(docker exec "${TARGET}" mysql -N -B -uroot -e 'SELECT COUNT(*) FROM readiness_drill.samples')"

[[ "${row_count}" == 3 ]]
[[ "${index_count}" == 1 ]]
[[ "${constraint_count}" == 2 ]]
[[ "${post_write_count}" == 4 ]]

finished_ns="$(date +%s%N)"
duration_ms() { echo $(( ($2 - $1) / 1000000 )); }
echo "status=PASS"
echo "evidence=MEASURED_SYNTHETIC_ISOLATED"
echo "image=${IMAGE}"
echo "dump_bytes=$(stat -c %s "${DUMP}")"
echo "backup_ms=$(duration_ms "${backup_started_ns}" "${backup_finished_ns}")"
echo "restore_ms=$(duration_ms "${restore_started_ns}" "${restore_finished_ns}")"
echo "total_drill_ms=$(duration_ms "${started_ns}" "${finished_ns}")"
echo "rows_before_write=${row_count}"
echo "rows_after_write=${post_write_count}"
echo "index_checks=PASS"
echo "constraint_checks=PASS"
