# Storage P0: DGX controlled-deployment qualification

Status as of 2026-10-12 ~04:10 UTC. This was a read-only qualification: nothing
was restarted, rebuilt, pulled, pushed or uploaded, and `.env` was not changed.
**Production cutover is not authorized**, and this document does not authorize it.

Implementation references: Workbench `docs/STORAGE_P0_PERSISTENCE_AND_MOUNT_SAFETY_V1.md`,
Studio `docker-compose.managed-storage.yml`.

## 1. Deployment baseline

| Item | Value |
|---|---|
| Workbench checkout | `main` @ `2a5cf06b` (contains PR #733, P0) |
| Studio checkout | `main` @ `7803d83a` (contains PR #128 P0 and PR #129 inventory fix) |
| Tracked modifications | none in either repository |
| Live stack | `docker-compose.yml` (project `omnibioai-studio`). The live mount counts (workbench 16, celery-worker 10) match the base file exactly. |
| Workbench container | `7e11a260febb…`, process started 2026-10-11 11:50 CDT |
| Celery container | `22fc7adf0b41…` (one worker, 20 prefork children), started 2026-10-11 09:00 CDT |
| Running images contain P0? | **No.** Both processes started before `backend_guard.py` existed (first committed 22:37 CDT). Cutover requires rebuilding both images. |

## 2. Inventory and database reconciliation

- `storage-inventory.json` (v2 driver, generated 2026-10-12 03:52Z): status
  `complete`, no errors. One workbench and one celery-worker container were
  inspected, and their IDs match the live containers.
- Neither container sets `FTM_LOCAL_ROOT`, and there is no `/data/managed`
  mount. All four inspected trees (`/app/work/file_transfer_manager` and its
  default `local` root in each container) **do not exist**, so they hold
  **0 files and 0 bytes**.
- Live MySQL `omnibioai`, read-only transaction at 03:56:49Z: allocations 0,
  aliases 0, ledger events 0, organization storage 0, user accounts 0,
  artifacts 0, provenance edges 0. Migrations `storage_ledger.0001/0002` and
  `artifact_manager.0001` are applied.
- Ledger-payload writers: only code in the Workbench image
  (`Dockerfile.app`, target `backend`), which runs as the `workbench` and
  `celery-worker` services. No other service sets `FTM_LOCAL_ROOT` or uses
  that image. Both are covered.
- **Result: reconciled, with zero discrepancies.**

## 3. HDD and capacity qualification (preflight `check`, read-only)

| Check | Result |
|---|---|
| Mount | `/mnt/wdpro26tb` ← `/dev/sdd1`, `rw,relatime` |
| Filesystem / UUID | ext4 / `f9b2ec0f-7e62-4ee0-85fd-ea0c8d5fbbd5`; statvfs fsid `0x35f53df303064f7c` matches |
| Managed root | `/mnt/wdpro26tb/omnibioai/tenants/managed`, `0750 manish:manish`, contains only the marker |
| Marker | valid (schema 1, `omnibioai-managed-wdpro26tb`), unchanged since creation |
| Permissions | both services run as uid 0 with Docker's default CapEff `a80425fb` (includes `CAP_DAC_OVERRIDE`); no `user:`, `cap_drop`, `read_only` or userns remap. An in-container write is only proven by smoke step S3. |
| Capacity (04:0xZ) | total 23.55 TiB, free 21.44 TiB, reserve 10% = 2.36 TiB, **usable after reserve 19.08 TiB** |
| Smoke-test need | under 1 MiB, sufficient |

The PubMed `rsync` (PIDs 68521/68523) is still writing to `/mnt/wdpro26tb/omnibioai/`,
so free space is falling (about 0.27 TiB/h observed). The guard uses live
free space, so this is safe. The rsync's top-level names (`Abstracts`, `PDFs`, …)
don't collide with `tenants/`. They land directly in `omnibioai/` rather than
`datasets/`, which may be unintended.

## 4. Compose overlay validation (no containers started)

- The base `docker-compose.yml` alone validates with the current `.env` (exit 0).
- The overlay is opt-in. Without `MANAGED_STORAGE_*` it fails interpolation by design.
- In the merged config (base plus overlay plus scratch variables), all 21 checks
  pass:
  - identical binds in workbench and celery-worker, with source
    `/mnt/wdpro26tb/omnibioai/tenants/managed`, target `/data/managed`, and
    `create_host_path: false`;
  - `FTM_LOCAL_ROOT=/data/managed`, identity checks (UUID and ext4) and
    capacity checks on, reserve 10;
  - quota mode `audit` (celery-worker uses the settings default `audit`) and
    `STORAGE_QUOTA_BASELINE_VERIFIED=false`;
  - existing env keys, mounts and other keys preserved, with only the 6
    storage env keys added;
  - the other 40 services byte-identical.
- No secrets were printed, and the `.env` checksum is unchanged.

### `COMPOSE_FILE` side effects

Setting `COMPOSE_FILE=docker-compose.yml:docker-compose.managed-storage.yml`
in `.env` makes every plain `docker compose` command in the Studio directory
include the overlay. An explicit `-f` overrides it. These callers would
therefore **drop the overlay**:

| Caller | Effect after cutover | Control |
|---|---|---|
| `scripts/start.sh` | Uses `-f docker-compose.release.yml` whenever that file exists (it does on the DGX). It would switch the whole stack to release images. **Already unsafe on the DGX today**, unrelated to P0. | Do not use on the DGX. |
| Electron in dev mode (`electron/main.js`: `compose -f docker-compose.yml up -d`) | Recreates workbench and celery-worker without the overlay. A P0 image then returns 503 for uploads; it fails closed. | Do not run Studio desktop dev mode against this stack. No Electron process runs today. |
| `scripts/stop.sh` (`-f docker-compose.yml down`) | Removes containers. Data on the HDD is unaffected. | Acceptable. |
| `provision-interaction-db-identity.sh`, `verify-interaction-db-privileges.sh` | Read `$COMPOSE_FILE` only from the shell environment, not from `.env`. | Not affected. |
| `deploy-verify` service | Reads the raw base file only for image freshness and never blocks. | Not affected. |
| cron / systemd | No compose entries found. | none |

Operator rule after cutover: run Compose from the Studio directory without
`-f`, or always pass both files.

## 5. Image qualification

| Item | Finding |
|---|---|
| Workbench / Celery images | Local builds, tagged `omnibioai-studio-workbench` / `omnibioai-studio-celery-worker`, from context `omnibioai-workbench`, `Dockerfile.app`, target `backend`. No `image:` key. |
| Base image | `FROM ghcr.io/omnibioai/omnibioai-base:latest`, a **mutable tag**. Build without `--pull` so the cached base already in use is reused. |
| Build secret | Only `workbench` declares `github_token` (from `GHCR_PULL_TOKEN`, present in `.env`). `celery-worker` declares none, so its build succeeds only by reusing workbench's cached `pip install` layer. Build workbench first, never with `--no-cache`, and verify that both resulting image IDs are equal. |
| Migrations | All 50 migration files (27 apps) on Workbench `main` are already applied, so the startup `migrate` should be a no-op. Recheck with `migrate --plan`. |
| Host architecture | aarch64 |
| **Image IDs, digests, architecture, base-image architecture** | **BLOCKED: requires Docker access.** See command P2. |

### Publication isolation

- The DGX images are local-only build tags. `docker compose push` would target
  `docker.io/library/omnibioai-studio-*`, never `ghcr.io/omnibioai/omnibioai-app`.
- Studio's `build-multiarch.sh app` is gated by `release_storage_gate.py`
  (currently BLOCKED). Its context `$BASE/omnibioai` is also an empty
  root-owned directory, so it cannot build anyway.
- Ungated paths: Workbench `.github/workflows_disabled/ci.yml` (inactive) and
  manual `docker tag … ghcr.io/omnibioai/omnibioai-app` plus `docker push`.
  Procedural control: the cutover never tags or pushes to GHCR.
- **Isolation is qualified** provided the procedure below is followed exactly.

## 6. Controlled deployment procedure (operator, maintenance window)

Run every command from `~/Desktop/omnibioai-ecosystem/omnibioai-studio` as a
user with Docker access. `$E` holds evidence and never contains secrets. Stop
at the first unexpected result.

```bash
cd ~/Desktop/omnibioai-ecosystem/omnibioai-studio
E=~/omnibioai-cutover-evidence/storage-p0-$(date -u +%Y%m%dT%H%M%SZ); mkdir -p -m 700 "$E"
```

**P1. Code identity**
```bash
git -C ../omnibioai-workbench rev-parse HEAD   # expect 2a5cf06b… (or a later reviewed main)
git rev-parse HEAD                              # expect 7803d83a… (or later reviewed main)
git -C ../omnibioai-workbench status --short | grep -v '^??'; git status --short | grep -v '^??'   # expect empty
```

**P2. Capture current images.** The read-only part (P2a) can and should run
before the window, because it closes the image-evidence blocker. P2b runs
inside the window and is required for rollback.
```bash
# P2a: read-only
for s in workbench celery-worker; do
  c=$(docker compose ps -q $s); img=$(docker inspect -f '{{.Image}}' "$c")
  echo "$s container=$c image=$img" | tee -a "$E/images-before.txt"
  docker image inspect -f '{{.Id}} arch={{.Architecture}} os={{.Os}} created={{.Created}} digests={{json .RepoDigests}} tags={{json .RepoTags}}' "$img" | tee -a "$E/images-before.txt"
done
docker image inspect -f 'base {{.Id}} arch={{.Architecture}}' ghcr.io/omnibioai/omnibioai-base:latest | tee -a "$E/images-before.txt"
# P2b: window only. Local rollback tags, never pushed.
for s in workbench celery-worker; do
  docker tag "$(docker inspect -f '{{.Image}}' "$(docker compose ps -q $s)")" omnibioai-studio-$s:pre-storage-p0
done
```
Expected: `arch=arm64` for all three. If any shows `amd64`, **stop**: the
images are emulated, and the plan must be re-qualified.

**P3. Fresh inventory and database check (writers still running)**
```bash
sudo bash scripts/storage_container_inventory.sh --output "$E/inventory-before.json"; echo "exit=$?"   # expect 0
python3 -c "import json;r=json.load(open('$E/inventory-before.json'));print(r['status'],[(c['service'],sum(t['file_count'] for t in c['payload_inventory']['trees'])) for c in r['containers']])"
docker compose exec -T workbench python manage.py shell -c "from storage_ledger.models import Allocation;from plugins.artifact_manager.models import Artifact;print(Allocation.objects.count(),Artifact.objects.count())"
```
Expected: `complete`, 0 files per service, `0 0`. Otherwise **stop** and run
`storage_managed_migrate` per the Workbench runbook first.

**P4. Quiesce writers (outage starts)**
```bash
docker compose stop celery-worker workbench
docker compose ps workbench celery-worker      # both exited; every other service still Up
```

**P5. Revalidate the HDD**
```bash
python3 scripts/managed_storage_preflight.py check --root /mnt/wdpro26tb/omnibioai/tenants/managed \
  --fs-uuid f9b2ec0f-7e62-4ee0-85fd-ea0c8d5fbbd5 --expected-mount /mnt/wdpro26tb --reserve-percent 10 | tee "$E/preflight.json"
```

**P6. Build P0 images (local only; no `--pull`, no `--no-cache`, no push)**
```bash
docker compose build workbench && docker compose build celery-worker
for s in workbench celery-worker; do docker image inspect -f "$s {{.Id}} arch={{.Architecture}}" omnibioai-studio-$s; done | tee "$E/images-new.txt"
# Expect identical IDs and arch=arm64. Verify P0 is present without starting a service:
docker run --rm --network none --entrypoint python omnibioai-studio-workbench -c \
  "import importlib.util as u;print(all(u.find_spec(m) for m in ('storage_ledger.backend_guard','storage_ledger.migration')))"   # True
docker compose run --rm --no-deps workbench python manage.py migrate --plan | tee "$E/migrate-plan.txt"   # expect "No planned migration operations."
```
If the IDs differ, check whether the celery build reused the workbench layers.
If `migrate --plan` lists anything, **stop**: schema changes need separate approval.

**P7. Activate the overlay** (back up `.env` first; values below are not secrets)
```bash
cp -p .env .env.pre-storage-p0
cat >> .env <<'EOF'
MANAGED_STORAGE_ROOT=/mnt/wdpro26tb/omnibioai/tenants/managed
MANAGED_STORAGE_FS_UUID=f9b2ec0f-7e62-4ee0-85fd-ea0c8d5fbbd5
COMPOSE_FILE=docker-compose.yml:docker-compose.managed-storage.yml
EOF
docker compose config --quiet && docker compose config --format json | python3 -c "
import json,sys;s=json.load(sys.stdin)['services']
for n in ('workbench','celery-worker'):
  print(n,s[n]['environment']['FTM_LOCAL_ROOT'],[v for v in s[n]['volumes'] if v['target']=='/data/managed'])"
```

**P8. Recreate only the two services**
```bash
docker compose up -d --no-deps --force-recreate workbench celery-worker
docker compose ps    # all other services keep their previous container IDs and uptime
```

**P9. Health**
```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/api/storage/me/usage   # 401 (up, auth required)
docker compose exec -T celery-worker celery -A omnibioai inspect ping
docker compose logs --since 5m workbench celery-worker | grep -i -E "error|traceback" | head
```

**P10. Both containers see the managed disk, and the guard works**
```bash
for s in workbench celery-worker; do docker compose exec -T $s python manage.py shell -c "
import os;from storage_ledger import backend_guard as g;from storage_ledger.authority import LedgerError
print('$s',g.managed_root(),hex(os.statvfs('/data/managed').f_fsid),g.verify_identity() is not None)
try: g.verify_identity('/tmp'); print('NEGATIVE FAILED')
except LedgerError as e: print('negative ok',e.status,e.code)
from django.conf import settings;print('quota',settings.STORAGE_QUOTA_MODE,settings.STORAGE_QUOTA_BASELINE_VERIFIED)"; done
```
Expected per service: `/data/managed 0x35f53df303064f7c True`, `negative ok 503 STORAGE_BACKEND_UNAVAILABLE`, `quota audit False`.

## 7. Smoke test (authorized test account only)

Prerequisites: auth-service (IAM) and billing-service are healthy. Every new
personal reservation verifies the account live with IAM `/me` and `/orgs` and
reads the Billing entitlement, even in audit mode. If either is unavailable,
reservations return 503 `STORAGE_ENTITLEMENT_UNAVAILABLE`, which means "fix
dependencies", not "storage broken".

Use a designated smoke-test account that is an active member of a test
organization. Obtain its access token through the normal Studio login, with
the token's active org set to the test organization. Never put the token on
the command line or in `$E`.

```bash
read -rs TOKEN; export TOKEN; B=http://localhost:8000/plugins/artifact_manager/artifacts
H=(-H "Authorization: Bearer $TOKEN")
head -c 65536 /dev/urandom > "$E/smoke.bin"; sha256sum "$E/smoke.bin" | tee "$E/smoke.sha256"
ID=$(curl -s "${H[@]}" -H 'Content-Type: application/json' -d '{"name":"storage-p0-smoke.bin","project_id":"storage-p0-smoke"}' $B | python3 -c 'import json,sys;print(json.load(sys.stdin)["artifact_id"])'); echo "$ID" > "$E/smoke.id"
curl -s "${H[@]}" -H 'Content-Type: application/json' -d '{"bytes":65536}' $B/$ID/reservation          # S1: 201
curl -s "${H[@]}" -F file=@"$E/smoke.bin" $B/$ID/upload                                                # S2: status available
ls -l /mnt/wdpro26tb/omnibioai/tenants/managed/storage-ledger/*/payload                                   # S3: one 65536-byte file on the HDD
curl -s "${H[@]}" $B/$ID/download | sha256sum                                                          # S4: matches smoke.sha256
docker compose restart workbench && sleep 15 && curl -s "${H[@]}" $B/$ID/download | sha256sum          # S5: restart persistence
docker compose up -d --no-deps --force-recreate workbench && sleep 20 && curl -s "${H[@]}" $B/$ID/download | sha256sum   # S6: recreation persistence
curl -s "${H[@]}" http://localhost:8000/api/storage/me/usage | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["quota_mode"],d["used_bytes"],d["enforcement_active"])'   # S7: audit 65536 False
docker compose exec -T workbench python manage.py storage_quota_reconcile > "$E/reconcile.json"         # S8: no physical/counter findings
curl -s -X DELETE "${H[@]}" $B/$ID                                                                     # S9: status deleted
ls /mnt/wdpro26tb/omnibioai/tenants/managed/storage-ledger/*/payload 2>/dev/null | wc -l                # S10: 0 (payload removed after confirmed release)
docker compose exec -T workbench python manage.py shell -c "from storage_ledger.models import Allocation as A;print(list(A.objects.values_list('state','held_bytes')))"   # [('RELEASED', 0)]
unset TOKEN
```
The deleted smoke artifact's RELEASED tombstone remains in the ledger by
design. Record its allocation ID in `$E`.

**Accept** if P9, P10 and S1–S10 all pass. Then remove the rollback tags
only after a bake period, and never delete `.env.pre-storage-p0` before that.

## 8. Rollback and recovery

Decide by data state, never by reflex:

| State | Rollback allowed |
|---|---|
| A. No new local allocation exists, or every allocation created since cutover is RELEASED (for example, smoke test completed through S10) | **R2 full revert** |
| B. Any non-RELEASED local allocation or non-deleted local artifact exists since cutover (real user data, or a smoke artifact not yet deleted) | **R1 code-only rollback** (keeps managed storage). R2 is forbidden. |
| C. New stack cannot start, and B is true | Stop. Keep the overlay. Fix forward or run R1. Do not revert storage. |

Check the state:
```bash
docker compose exec -T workbench python manage.py shell -c "from storage_ledger.models import Allocation as A;from plugins.artifact_manager.models import Artifact as R;print(A.objects.exclude(state='RELEASED').count(),R.objects.exclude(status='deleted').count())"
```

**R1. Code-only rollback (data-preserving; any state).** Keep the overlay, so
`FTM_LOCAL_ROOT=/data/managed` stays. The pre-P0 code already honours
`FTM_LOCAL_ROOT`, so payloads stay on the HDD.
```bash
for s in workbench celery-worker; do docker tag omnibioai-studio-$s:pre-storage-p0 omnibioai-studio-$s:latest; done
docker compose up -d --no-deps --force-recreate workbench celery-worker
```
Pre-P0 code has no backend guard, so mount safety is lost while R1 is in
place. Treat R1 as temporary.

**R2. Full revert (state A only).**
```bash
cp -p .env.pre-storage-p0 .env      # removes COMPOSE_FILE and MANAGED_STORAGE_*
for s in workbench celery-worker; do docker tag omnibioai-studio-$s:pre-storage-p0 omnibioai-studio-$s:latest; done
docker compose up -d --no-deps --force-recreate workbench celery-worker
docker compose config --format json | python3 -c "import json,sys;s=json.load(sys.stdin)['services'];print([v for v in s['workbench']['volumes'] if v['target']=='/data/managed'])"   # []
```
Never delete anything under `tenants/managed`. RELEASED tombstones are harmless
to the old code. No database recovery is needed in state A, and none may be
attempted in state B.

**HDD unavailable after cutover.** Uploads, downloads and deletes return 503,
and metadata stays readable. Do **not** run R2. Remount by UUID, run preflight
`check`, then `docker compose restart workbench celery-worker` only if their
binds went stale. Never create `tenants/managed` by hand on a bare mountpoint,
and never disable the checks.

## 9. Readiness assessment

| Required evidence | Status |
|---|---|
| Complete container inventory | ✅ (rerun at P3) |
| Zero existing-payload discrepancies | ✅ |
| Verified HDD identity, valid marker | ✅ |
| Correct Compose overlay | ✅ |
| Compatible DGX images | ❌ **BLOCKED**: running image IDs, digests and architecture, and base-image architecture, are unverified (no Docker access). P2/P6 produce this evidence. |
| Safe image distribution | ✅ procedural (local build tags; no GHCR tag or push) |
| Maintenance, health, smoke and rollback plans | ✅ sections 6–8 |

**DGX_CUTOVER_READY = NO.** The single remaining technical blocker is image
evidence (P2), which an operator with Docker access can produce read-only
before the window. Explicit operator approval is also required.
