#!/bin/bash
set -u
E="$(cd "$(dirname "$0")" && pwd)"; R=$E/run; rm -rf $R; mkdir -p $R/tenants $R/data $R/ftm $R/objects
ROUTER_CONF=${1:-$HOME/Desktop/omnibioai-worktrees/omnibioai-studio/my-files-router/docker/nginx-router.conf}
WT=$HOME/Desktop/omnibioai-worktrees/omnibioai-workbench/my-files
export E2E_DB_PASSWORD=$(openssl rand -hex 16) E2E_JWT_SECRET=$(openssl rand -hex 32)
docker rm -f myfiles-e2e-wb myfiles-e2e-iam myfiles-e2e-router myfiles-e2e-mysql >/dev/null 2>&1; docker network rm myfiles-e2e >/dev/null 2>&1; docker network create myfiles-e2e >/dev/null
COMMON="--network myfiles-e2e --user $(id -u):$(id -g) -v $WT:/src:ro -v $E:/e2e -w /src --tmpfs /tmp:rw,size=4g -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -e PYTHONPATH=/e2e:/src -e DJANGO_SETTINGS_MODULE=e2e_settings -e DJANGO_SECRET_KEY=$E2E_JWT_SECRET -e JWT_SECRET=$E2E_JWT_SECRET -e E2E_DB_PASSWORD=$E2E_DB_PASSWORD -e JWT_AUDIENCE=omnibioai-platform -e DEBUG=1 -e CELERY_BROKER_URL=memory:// -e NUMBA_CACHE_DIR=/tmp/numba -e MPLCONFIGDIR=/tmp/mpl -e FTM_LOCAL_ROOT=/e2e/run/ftm -e OMNI_OBJECT_STORAGE_DIR=/e2e/run/objects -e OMNI_OBJECT_REGISTRY_PATH=/e2e/run/registry.json -e MY_FILES_MAX_UPLOAD_BYTES=95000000 --entrypoint python tenant-provisioning-workbench-test:local"
docker run -d --rm --name myfiles-e2e-mysql --network myfiles-e2e -e MYSQL_ROOT_PASSWORD=$E2E_DB_PASSWORD -e MYSQL_DATABASE=e2e --tmpfs /var/lib/mysql mysql:8.0 >/dev/null
for i in $(seq 1 60); do docker exec myfiles-e2e-mysql mysql -h127.0.0.1 -uroot -p$E2E_DB_PASSWORD -e 'select 1' >/dev/null 2>&1 && break; sleep 2; done
docker run --rm $COMMON manage.py migrate --noinput > $R/migrate.log 2>&1 || { tail -5 $R/migrate.log | cut -c1-200; exit 1; }
docker run --rm $COMMON manage.py migrate --run-syncdb --noinput >> $R/migrate.log 2>&1 || { tail -5 $R/migrate.log | cut -c1-200; exit 1; }
docker run --rm $COMMON /e2e/seed.py || exit 1
docker run -d --name myfiles-e2e-iam --network-alias fakeiam $COMMON /e2e/fake_iam.py >/dev/null
docker run -d --name myfiles-e2e-wb --network-alias workbench $COMMON manage.py runserver 0.0.0.0:8000 --noreload >/dev/null
docker run -d --name myfiles-e2e-router --network myfiles-e2e -p 127.0.0.1:18080:80 -v "$ROUTER_CONF":/etc/nginx/conf.d/default.conf:ro omnibioai-studio-nginx-router:e7ba23a40ca0 >/dev/null
for i in $(seq 1 60); do curl -s -o /dev/null -m 2 -H 'Host: webstudio.omnibioai.org' http://127.0.0.1:18080/health && break; sleep 2; done
docker ps --filter name=myfiles-e2e --format '{{.Names}} {{.Status}}'
docker exec myfiles-e2e-router nginx -t 2>&1 | tail -2
