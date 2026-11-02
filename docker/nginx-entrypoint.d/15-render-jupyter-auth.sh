#!/bin/sh
# Runs from the nginx image's /docker-entrypoint.sh before nginx starts.
# Renders the /jupyter/ Authorization include from the jupyter_token compose
# secret (/run/secrets/jupyter_token) into /etc/nginx/ide-secrets, a tmpfs
# (docker-compose.yml): the rendered file never lands in the container's
# writable layer, and the token is never in the container's environment, so
# `docker inspect` does not show it. Only `location /jupyter/` in
# nginx-router.conf includes the result.
#
# Never fatal: without a usable secret nothing is rendered, the include glob
# matches nothing, nginx still starts, and /jupyter/ falls back to Jupyter's
# own login page.
set -eu
src=/run/secrets/jupyter_token
tpl=/etc/nginx/ide-templates/ide-secrets/jupyter-auth.conf.template
out=/etc/nginx/ide-secrets/jupyter-auth.conf
umask 077
if [ ! -r "$src" ] || [ ! -r "$tpl" ] || [ ! -d "${out%/*}" ]; then
  echo "$0: jupyter_token secret, template or ${out%/*} missing; not rendering (/jupyter/ will show Jupyter's own login)" >&2
  exit 0
fi
token=$(tr -d '\r\n' < "$src")
case "$token" in
  ''|*[!A-Za-z0-9._~-]*)
    echo "$0: jupyter_token secret is empty or has characters outside [A-Za-z0-9._~-]; not rendering" >&2
    exit 0 ;;
esac
JUPYTER_TOKEN=$token envsubst '${JUPYTER_TOKEN}' < "$tpl" > "$out.tmp"
mv "$out.tmp" "$out"
chmod 600 "$out"
echo "$0: rendered $out"
