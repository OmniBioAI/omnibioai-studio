# OmniBioAI Production Deployment Runbook

## Prerequisites

| Requirement | Version / Notes |
|---|---|
| Docker | 24+ |
| Docker Compose | v2 (bundled with Docker Desktop or `docker compose` CLI plugin) |
| Node.js | 18+ (for Studio frontend) |
| Python | 3.11+ (for key generation helpers) |
| RAM | 16 GB minimum, 32 GB recommended |
| Disk | 100 GB minimum; at least 50 GB free before deploy |
| Ports | See port table below — all must be free on the host |

---

## Port Reference

| Port | Service | Notes |
|---|---|---|
| 3306 | MySQL | Internal only — not exposed externally in prod |
| 6380 | Redis | Host-mapped from container 6379 |
| 7000 | lims | LIMS Django API |
| 7070 | control-center | OmniBioAI Control Center API |
| 8000 | workbench | Main Django workbench |
| 8001 | auth-service | JWT auth / IAM |
| 8002 | policy-engine | RBAC policy engine |
| 8003 | hpc-policy-engine | HPC quota policy |
| 8004 | security-audit | Audit log service |
| 8080 | api-gateway | Unified API gateway |
| 8081 | tes | Task Execution Service |
| 8082 | dev-hub | Dev-hub API |
| 8086 | videos | Video content server |
| 8090 | rag | RAG service (maps to container 8096) |
| 8095 | model-registry | ML model registry |
| 8097 | tool-images | Tool image catalogue |
| 8098 | workflow-bundles | Workflow bundle service |
| 8181 | opa | Open Policy Agent |
| 9090 | toolserver | Tool execution server |
| 9091 | prometheus | Metrics scrape (maps to container 9090) |
| 11434 | ollama | LLM inference |
| 3000 | grafana | Monitoring dashboards |
| 5173 | dev-hub Vite | Frontend dev server |
| 5190 | sdk | OmniBioAI Python SDK |

---

## Environment Variables

Create `deploy/compose/.env` (never commit this file).

### Required — All Environments

```dotenv
# ── Database ──────────────────────────────────────────────────────────────────
MYSQL_ROOT_PASSWORD=<strong-password>
MYSQL_DEFAULT_DB=omnibioai

# ── LIMS ──────────────────────────────────────────────────────────────────────
LIMSX_DJANGO_SECRET_KEY=<generate: python3 -c "import secrets; print(secrets.token_urlsafe(50))">
# LIMSX_DJANGO_DEBUG=False  # set to False in production

# ── Encryption ────────────────────────────────────────────────────────────────
# generate: python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
FIELD_ENCRYPTION_KEY=<fernet-key>

# ── RAG ───────────────────────────────────────────────────────────────────────
# generate: python3 -c "import secrets; print(secrets.token_urlsafe(32))"
RAGBIO_API_KEY=<random-token>

# ── LLM / AI APIs ─────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# ── Auth service ──────────────────────────────────────────────────────────────
AUTH_SECRET_KEY=<generate: python3 -c "import secrets; print(secrets.token_urlsafe(50))">

# ── Container registry ────────────────────────────────────────────────────────
GITHUB_TOKEN=<PAT with read:packages scope — for ghcr.io pull>

# ── Paths ─────────────────────────────────────────────────────────────────────
HOST_IP=0.0.0.0                # or specific NIC IP
WORKSPACE_HOST=/home/<user>/Desktop/machine
WORK_DIR=/home/<user>/Desktop/machine/work
DATA_DIR=/home/<user>/Desktop/machine/data
VIDEO_DIR=/home/<user>/Desktop/machine/omnibioai-videos/content
DB_INIT_DIR=/home/<user>/Desktop/machine/db-init
```

### Key Generation Helpers

```bash
# Django / Auth secret key
python3 -c "import secrets; print(secrets.token_urlsafe(50))"

# Fernet encryption key (FIELD_ENCRYPTION_KEY)
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# API token (RAGBIO_API_KEY)
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## Pre-Deployment Checklist

- [ ] All environment variables set in `.env`
- [ ] `FIELD_ENCRYPTION_KEY` generated and stored in secrets manager (Vault / AWS Secrets Manager)
- [ ] `RAGBIO_API_KEY` generated and stored in secrets manager
- [ ] `LIMSX_DJANGO_SECRET_KEY` generated and stored in secrets manager
- [ ] `AUTH_SECRET_KEY` generated and stored in secrets manager
- [ ] `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` verified valid
- [ ] All ports listed in the port table are free on host: `ss -tlnp | grep -E '7000|8000|8080|8090|9091|3000'`
- [ ] Docker logged in to ghcr.io: `echo $GITHUB_TOKEN | docker login ghcr.io -u man4ish --password-stdin`
- [ ] At least 50 GB disk free: `df -h .`
- [ ] DB init SQL files present at `$DB_INIT_DIR`
- [ ] `$WORK_DIR`, `$DATA_DIR`, `$VIDEO_DIR` directories exist and are writable

---

## Deployment Steps

### 1. Clone Repositories

```bash
BASE=/home/$USER/Desktop/machine
mkdir -p $BASE && cd $BASE

# Core services
git clone https://github.com/man4ish/omnibioai.git
git clone https://github.com/man4ish/omnibioai-lims.git
git clone https://github.com/man4ish/omnibioai-rag.git
git clone https://github.com/man4ish/omnibioai-tes.git
git clone https://github.com/man4ish/omnibioai-toolserver.git
git clone https://github.com/man4ish/omnibioai-model-registry.git
git clone https://github.com/man4ish/omnibioai-control-center.git
git clone https://github.com/man4ish/omnibioai-dev-hub.git
git clone https://github.com/man4ish/omnibioai-auth.git
git clone https://github.com/man4ish/omnibioai-studio.git
```

### 2. Configure Environment

```bash
cd $BASE/omnibioai-studio
cp .env.example .env
# Edit .env — fill in ALL required variables
nano .env
```

### 3. Pull Pre-Built Images

```bash
cd $BASE/omnibioai-studio
docker compose pull
```

### 4. Start All Services

```bash
docker compose up -d
# Watch startup logs
docker compose logs -f --tail=50
```

Wait for all services to reach healthy state:

```bash
docker compose ps
# All should show "healthy" or "running"
```

### 5. Run Database Migrations

```bash
# Workbench (main Django app)
docker compose exec workbench python manage.py migrate

# LIMS
docker compose exec lims python manage.py migrate
```

### 6. Create Superuser

```bash
# Workbench
docker compose exec workbench python manage.py createsuperuser

# LIMS
docker compose exec lims python manage.py createsuperuser
# Or use the auto-admin command if available:
docker compose exec lims python manage.py ensure_admin
```

### 7. Load Seed Data (Optional)

```bash
# LIMS sample data
docker compose exec -T mysql mysql -uroot -p$MYSQL_ROOT_PASSWORD limsdb \
  < /home/$USER/Desktop/machine/omnibioai-lims/seed_lims_10samples.sql
```

### 8. Start Studio Frontend

```bash
cd $BASE/omnibioai-studio
npm install
npm run dev
# Access at http://localhost:55761
```

---

## Health Verification

Run these after deployment to confirm each service is live:

```bash
# Core services
curl -sf http://localhost:8000/health/   && echo "workbench OK"
curl -sf http://localhost:7000/          && echo "lims OK"
curl -sf http://localhost:8090/health    && echo "rag OK"
curl -sf http://localhost:9090/health    && echo "toolserver OK"
curl -sf http://localhost:8095/health    && echo "model-registry OK"
curl -sf http://localhost:7070/health    && echo "control-center OK"

# Security plane
curl -sf http://localhost:8001/health    && echo "auth-service OK"
curl -sf http://localhost:8002/health    && echo "policy-engine OK"
curl -sf http://localhost:8003/health    && echo "hpc-policy-engine OK"
curl -sf http://localhost:8004/health    && echo "security-audit OK"
curl -sf http://localhost:8080/health    && echo "api-gateway OK"

# Monitoring
curl -sf http://localhost:9091/-/healthy && echo "prometheus OK"
curl -sf http://localhost:3000/api/health && echo "grafana OK"

# Grafana dashboards loaded
curl -s -u admin:omnibioai http://localhost:3000/api/search \
  | python3 -m json.tool | grep '"title"'
```

Expected dashboard titles: `OmniBioAI Platform Overview`, `OmniBioAI LIMS`, `OmniBioAI RAG`.

---

## Rollback Procedure

### Using Git Tags

```bash
# List available release tags
git tag --sort=-version:refname | head -10

# Roll back omnibioai-studio to a specific tag
cd /home/$USER/Desktop/machine/omnibioai-studio
git fetch --tags
git checkout tags/v1.2.3

# Re-pull images for that tag (if images are tag-versioned)
docker compose pull

# Restart services
docker compose up -d
```

### Manual Image Rollback

```bash
# Pin a specific image digest in docker-compose.yml, then:
docker compose up -d --no-deps <service-name>
```

---

## Backup and Restore

### MySQL Backup

```bash
# Full backup of all OmniBioAI databases
docker compose exec mysql mysqldump \
  -uroot -p$MYSQL_ROOT_PASSWORD \
  --all-databases \
  --single-transaction \
  --routines \
  --triggers \
  > backup_$(date +%Y%m%d_%H%M%S).sql

# Single database backup (e.g. limsdb)
docker compose exec mysql mysqldump \
  -uroot -p$MYSQL_ROOT_PASSWORD \
  --single-transaction limsdb \
  > limsdb_$(date +%Y%m%d_%H%M%S).sql
```

### MySQL Restore

```bash
docker compose exec -T mysql mysql \
  -uroot -p$MYSQL_ROOT_PASSWORD \
  < backup_<timestamp>.sql
```

### Redis Backup

```bash
docker compose exec redis redis-cli BGSAVE
docker compose cp redis:/data/dump.rdb ./redis_backup_$(date +%Y%m%d).rdb
```

### Grafana Dashboard Backup

```bash
# Export all dashboards via API
mkdir -p grafana_dashboards_backup
curl -s -u admin:omnibioai http://localhost:3000/api/search?type=dash-db \
  | python3 -c "import sys,json; [print(d['uid']) for d in json.load(sys.stdin)]" \
  | while read uid; do
      curl -s -u admin:omnibioai "http://localhost:3000/api/dashboards/uid/$uid" \
        > "grafana_dashboards_backup/${uid}.json"
    done
```

---

## Monitoring

| URL | Service | Credentials |
|---|---|---|
| http://localhost:9091 | Prometheus | none |
| http://localhost:3000 | Grafana | admin / omnibioai |
| http://localhost:8181 | OPA (Open Policy Agent) | none |

### Useful Prometheus Queries

```promql
# Service up/down
up

# LIMS request rate
rate(django_http_requests_total_by_view_transport_method_total{job="omnibioai-lims"}[5m])

# RAG p95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="omnibioai-rag"}[5m]))

# Error rate across all services
sum(rate(django_http_responses_total_by_status_view_method_total{status=~"5.."}[5m])) by (job)
```

---

## Troubleshooting

### Port conflicts

```bash
# Find what is using a port (e.g. 7000)
ss -tlnp | grep 7000
sudo kill -9 $(lsof -ti:7000)
```

### FAISS binary incompatibility

The RAG service uses FAISS which must match the CPU architecture. If you see `Illegal instruction` or SIGILL:

```bash
# Check container arch vs host
docker inspect omnibioai-rag | grep Architecture
uname -m

# Rebuild the RAG image for the correct arch
cd /home/$USER/Desktop/machine/omnibioai-rag
docker build --platform linux/$(uname -m) -f Dockerfile.new --target backend -t omnibioai-rag-local .
# Then update docker-compose.yml to use the local image
```

### Django migration errors

```bash
# If migrations fail with "table already exists":
docker compose exec workbench python manage.py migrate --fake-initial
docker compose exec workbench python manage.py migrate

# If a specific app's migration is stuck:
docker compose exec workbench python manage.py showmigrations
docker compose exec workbench python manage.py migrate <app_name> --fake <migration_number>
```

### Cookie auth not working through proxy / API gateway

- Ensure `DJANGO_ALLOWED_HOSTS` includes the gateway hostname and the host IP.
- The auth cookie (`access_token`, `refresh_token`) must be `SameSite=None; Secure` when proxied over HTTPS. In dev over HTTP, use `SameSite=Lax`.
- Verify the api-gateway is forwarding `Cookie` headers: check `api-gateway` env for `JWT_SECRET` matching `AUTH_SECRET_KEY`.
- Check `CORS_ALLOWED_ORIGINS` in the `lims` service includes the Studio URL.

### RAG container unhealthy

```bash
docker compose logs rag --tail=50
# Common causes:
# 1. FAISS binary mismatch — see section above
# 2. Ollama not ready — check: curl http://localhost:11434/api/tags
# 3. RAGBIO_API_KEY not set — verify in .env
docker compose exec rag python -c "import faiss; print('faiss OK')"
```

### Control Center can't reach services on different Docker networks

The control-center mounts the Docker socket (`/var/run/docker.sock`) and uses internal Docker service names. If it can't resolve `workbench`, `tes`, etc.:

```bash
# Verify all services are on the same Docker network
docker network inspect omnibioai-studio_default

# If control-center was started before other services:
docker compose restart control-center

# Check control-center can reach workbench
docker compose exec control-center curl -sf http://workbench:8000/health/
```

### Celery workers not picking up tasks

```bash
docker compose logs celery-worker --tail=50
# Common: broker URL mismatch. Verify:
docker compose exec celery-worker env | grep CELERY_BROKER_URL
# Should be: redis://redis:6379/1
```

### "No such container" errors after restart

Docker Compose service names are not the same as container names when using the `build:` directive. Use service names in `docker compose exec <service>`, not container names.

### Disk full — overlay2 growth

```bash
# Clean up unused images/layers
docker system prune -f
docker volume prune -f
# Check disk usage per container
docker system df -v
```
