#!/bin/bash
# Read-only effective-grant and negative privilege verification for the Auth
# interaction worker.  Run from omnibioai-studio with the selected Compose
# file and a protected .env; this script never prints a password.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.release.yml}"
COMPOSE=(docker compose -f "$COMPOSE_FILE")
: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD must be set}"
: "${INTERACTION_DB_PASSWORD:?INTERACTION_DB_PASSWORD must be set}"

root_mysql() {
  "${COMPOSE[@]}" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=socket -uroot "$@"' sh "$@"
}

worker_mysql() {
  printf '%s\0' "$INTERACTION_DB_PASSWORD" | "${COMPOSE[@]}" exec -T mysql sh -c 'IFS= read -r -d "" INTERACTION_DB_PASSWORD; export INTERACTION_DB_PASSWORD; MYSQL_PWD="$INTERACTION_DB_PASSWORD" mysql --protocol=socket -uomnibioai_interaction_worker omnibioai "$@"' sh "$@"
}

grants="$(root_mysql -NBe "SHOW GRANTS FOR 'omnibioai_interaction_worker'@'%'")"
printf '%s\n' "$grants"

if ! printf '%s\n' "$grants" | grep -Fq 'ON `omnibioai`.`interactions` TO' \
   || ! printf '%s\n' "$grants" | grep -Fq 'SELECT' \
   || ! printf '%s\n' "$grants" | grep -Fq 'INSERT'; then
  echo "required table-scoped SELECT, INSERT grant not found" >&2
  exit 1
fi

table_privileges="$(root_mysql -NBe "SELECT GROUP_CONCAT(privilege_type ORDER BY privilege_type) FROM information_schema.table_privileges WHERE grantee=\"'omnibioai_interaction_worker'@'%'\" AND table_schema='omnibioai' AND table_name='interactions'")"
[ "$table_privileges" = "INSERT,SELECT" ] || { echo "unexpected interaction table privileges" >&2; exit 1; }

global_privileges="$(root_mysql -NBe "SELECT GROUP_CONCAT(privilege_type ORDER BY privilege_type) FROM information_schema.user_privileges WHERE grantee=\"'omnibioai_interaction_worker'@'%'\"")"
[ "$global_privileges" = "USAGE" ] || { echo "unexpected global privilege present" >&2; exit 1; }

unrelated_table_count="$(root_mysql -NBe "SELECT COUNT(*) FROM information_schema.table_privileges WHERE grantee=\"'omnibioai_interaction_worker'@'%'\" AND NOT (table_schema='omnibioai' AND table_name='interactions')")"
[ "$unrelated_table_count" = "0" ] || { echo "unexpected unrelated table privilege present" >&2; exit 1; }

non_usage_grants="$(printf '%s\n' "$grants" | grep -Fv 'GRANT USAGE ON *.*' || true)"
for forbidden in "ALL PRIVILEGES" "*.*" "omnibioai.*" "WITH GRANT OPTION" "CREATE USER" "SUPER" "ALTER" "CREATE" "DROP" "DELETE" "UPDATE"; do
  if printf '%s\n' "$non_usage_grants" | grep -Fqi -- "$forbidden"; then
    echo "forbidden privilege present: $forbidden" >&2
    exit 1
  fi
done

if worker_mysql -NBe "SELECT 1 FROM omnibioai.users LIMIT 0" >/dev/null 2>&1; then
  echo "negative privilege check unexpectedly allowed unrelated-table access" >&2
  exit 1
fi

echo "interaction worker least-privilege checks passed"
