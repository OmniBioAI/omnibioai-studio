# MySQL root password as a compose secret

The `mysql` service in `docker-compose.yml` reads its root password from a
compose secret instead of the environment:

```yaml
environment:
  MYSQL_ROOT_PASSWORD_FILE: /run/secrets/mysql-root-password
secrets:
  - mysql-root-password
...
secrets:
  mysql-root-password:
    file: ${MYSQL_ROOT_PASSWORD_SECRET_FILE}
```

The image only uses the root password when it initialises an **empty** data
volume. On an existing volume the server ignores it, so moving to the file
changes nothing in the database. The value must still be the current root
password, so that a fresh volume, a restore drill or an admin tool reading
the secret gets the right credential. This change does not rotate anything.

The healthcheck no longer logs in at all (see the comment on the service), so
it does not need this secret.

## One-time migration step (per host, before the first recreate)

Run from the Studio checkout as the deploy user. Nothing is printed except
MATCH/DIFF.

```bash
F=/home/manish/.config/omnibioai/studio-mysql-root.pass   # any path; keep it off the repo
umask 077
grep '^MYSQL_ROOT_PASSWORD=' .env | head -n1 | cut -d= -f2- | tr -d '\n' > "$F"
chmod 600 "$F"
# The file must hold exactly the .env value, with no trailing newline:
[ "$(cat "$F")" = "$(grep '^MYSQL_ROOT_PASSWORD=' .env | head -n1 | cut -d= -f2-)" ] && echo MATCH || echo DIFF
[ "$(tail -c1 "$F" | od -An -c | tr -d ' ')" != '\n' ] && echo "no trailing newline" || echo "TRAILING NEWLINE"
# And the running server must accept it (root@localhost over the socket):
docker exec -i omnibioai-studio-mysql-1 sh -c 'MYSQL_PWD="$(cat)" mysql -uroot -N -e "SELECT 1"' < "$F" && echo "server accepts it"
echo "MYSQL_ROOT_PASSWORD_SECRET_FILE=$F" >> .env    # the path only, not the value
```

The `.env` value is assumed unquoted (`KEY=value`). If it is quoted, strip the
quotes before writing the file.

Then recreate only `mysql` with the usual compose file chain. Verify:

```bash
docker inspect omnibioai-studio-mysql-1 -f '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | grep MYSQL_ROOT
# expect MYSQL_ROOT_PASSWORD_FILE only (no MYSQL_ROOT_PASSWORD)
docker exec omnibioai-studio-mysql-1 stat -c '%a' /run/secrets/mysql-root-password
docker inspect omnibioai-studio-mysql-1 -f '{{.State.Health.Status}}'   # healthy
```

Keep `MYSQL_ROOT_PASSWORD` in `.env` for now: other compose entries and the
release compose files still reference it. Removing it is a separate change.

## Tools that need the root password inside the container

They read `/run/secrets/mysql-root-password` first and fall back to
`$MYSQL_ROOT_PASSWORD`, so they work before and after the switch:
`scripts/verify-interaction-db-privileges.sh`,
`scripts/mysql_live_manifest_v3.py`. `ops/mysql/binlog-grants.sh` in the
ecosystem repo still reads `$MYSQL_ROOT_PASSWORD` for the `audit` instance and
needs the same change before it is next run against this server.

## Rollback

Revert this file's compose change and recreate `mysql`; the server keeps the
same password either way, because the volume is already initialised.
