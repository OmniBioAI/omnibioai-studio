#!/bin/bash
# Provision the Auth interaction worker identity during first-time MySQL setup.
# This file is executed by the official MySQL image as root.  The password is
# supplied through the protected container environment and is never printed.
set -euo pipefail

: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD must be set}"
: "${INTERACTION_DB_PASSWORD:?INTERACTION_DB_PASSWORD must be set}"

# SQL string literals escape a single quote by doubling it.  The value is sent
# on stdin to mysql, never as a command-line argument.
interaction_password_sql=$(printf '%s' "$INTERACTION_DB_PASSWORD" | sed "s/'/''/g")

MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=socket -uroot <<SQL
CREATE USER IF NOT EXISTS 'omnibioai_interaction_worker'@'%' IDENTIFIED BY '${interaction_password_sql}';
ALTER USER 'omnibioai_interaction_worker'@'%' IDENTIFIED BY '${interaction_password_sql}';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'omnibioai_interaction_worker'@'%';
FLUSH PRIVILEGES;
SQL

table_exists=$(MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=socket -uroot -NBe \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='omnibioai' AND table_name='interactions'")
if [ "$table_exists" = "1" ]; then
  MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=socket -uroot <<SQL
GRANT SELECT, INSERT ON \`omnibioai\`.\`interactions\` TO 'omnibioai_interaction_worker'@'%';
FLUSH PRIVILEGES;
SQL
fi

unset MYSQL_PWD interaction_password_sql
