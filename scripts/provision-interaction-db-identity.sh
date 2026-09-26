#!/bin/bash
# Run the migration/admin-owned identity provisioning against an existing
# MySQL volume. It invokes the same protected script used at first boot and
# never prints the credential.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.release.yml}"
docker compose -f "$COMPOSE_FILE" exec -T mysql \
  bash /docker-entrypoint-initdb.d/10-create-interaction-worker-identity.sh

echo "interaction worker database identity provisioned"
