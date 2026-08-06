# PR13 Deployment Runbook — Dynamic Permission Assignment & Enterprise RBAC Activation

**Status: NOT YET EXECUTED.** This is the documented procedure for when PR13
is reviewed and approved for merge — recorded here so it doesn't need to be
reconstructed at that time, not an instruction that's been carried out. All
6 repos currently have PR13 on `feature/pr13-dynamic-rbac-activation` only;
`main` is untouched, and the live docker-compose stack is still running
`main`'s code.

Repos touched: `omnibioai-auth`, `omnibioai-policy-engine`,
`omnibioai-api-gateway`, `omnibioai-control-center`, `omnibioai-docs`,
`omnibioai-studio` (this repo).

Pre-requisite: all 6 repos' test suites pass and build cleanly on the
feature branch (already verified — see PR13's implementation report).
This runbook is deploy-only; it does not re-run those suites.

---

## 1. Backup MySQL

```bash
cd ~/Desktop/machine/omnibioai-studio
./scripts/backup-mysql.sh
```

Same script used for PR12's deployment. Confirm the printed output path
and size before continuing — do not proceed to step 4 without a fresh
backup.

## 2. Merge branches

Requires actual PR review/approval per repo, not just this runbook. For
each of the 6 repos, in this order (matches the dependency order used for
PR12 — auth's schema/JWT changes are the foundation everything else reads):

```bash
for repo in omnibioai-auth omnibioai-policy-engine omnibioai-api-gateway \
            omnibioai-control-center omnibioai-docs omnibioai-studio; do
  cd ~/Desktop/machine/$repo
  git checkout main
  git merge --no-ff feature/pr13-dynamic-rbac-activation
done
```

## 3. Pull main

If deploying from a different checkout than the one PR13 was developed in,
`git pull origin main` in each repo after step 2's merge is pushed. If
deploying from the same checkout, step 2 already leaves `main` up to date
locally — this step is a no-op in that case.

## 4. Run `alembic upgrade head`

```bash
cd ~/Desktop/machine/omnibioai-auth
alembic current   # confirm it's NOT already 0016_role_org_scope (idempotency check)
alembic upgrade head
```

Migration `0016_role_org_scope` adds `roles.organization_id` (nullable) and
drops the old global unique constraint on `roles.name`. Fully additive —
no data migration, no backfill required. If `alembic current` already shows
`0016_role_org_scope`, skip this step (already applied) rather than
re-running it.

## 5. Verify `roles.organization_id`

```bash
docker exec omnibioai-studio-mysql-1 mysql -uroot -p"${MYSQL_ROOT_PASSWORD:-root}" \
  -N -e "DESCRIBE omnibioai.roles;" | grep organization_id
docker exec omnibioai-studio-mysql-1 mysql -uroot -p"${MYSQL_ROOT_PASSWORD:-root}" \
  -N -e "SELECT name, organization_id FROM omnibioai.roles WHERE name IN ('scientist','viewer');"
```

Confirms the column exists and that `ensure_default_org_roles` (runs at
`auth-service` startup, step 6) will find `scientist`/`viewer` already
seeded — or that they get created on the first restart if this is a truly
fresh migration.

## 6. Restart services

```bash
cd ~/Desktop/machine/omnibioai-studio
docker compose build auth-service policy-engine api-gateway control-center
docker compose up -d --no-deps --force-recreate \
  auth-service policy-engine api-gateway control-center
docker compose ps
```

Note from PR12's deployment: `api-gateway` has no `build:` stanza in
`docker-compose.yml` (image-only, no CI publish step) — `docker compose
build api-gateway` is a silent no-op. Build it manually first if this
gap hasn't been closed by then:

```bash
cd ~/Desktop/machine
docker build -t ghcr.io/omnibioai/omnibioai-api-gateway:latest -f omnibioai-api-gateway/Dockerfile .
```

## 7. Run `test-enterprise-security.sh`

```bash
cd ~/Desktop/machine/omnibioai-studio
./scripts/test-enterprise-security.sh
```

### Expected results

| Check | Expected |
|---|---|
| Scientist token, `GET /model-registry/v1` (requires `model.use`) | **200** |
| Viewer token, `GET /model-registry/v1` (lacks `model.use`) | **403** |
| Org Admin creates an org-scoped custom role (`POST /organizations/{id}/roles`) | **200/201** |
| Org Admin attempts to assign `platform_admin` to another member | **403**, plus one `ROLE_ASSIGNMENT_DENIED` audit event (`omnibioai-auth`'s `audit_events` table / Control Center's Audit Logs page) |

The script's seeded scientist/viewer cases (case 4, PR13) cover the first
two rows directly. The Org-Admin-creates-a-role and
Org-Admin-blocked-from-`platform_admin` rows aren't in the script itself
(it's a single-user smoke test, not a two-user org-management one) — verify
those two manually against the live stack, e.g.:

```bash
# Assumes $ORG_OWNER_TOKEN (an org's own admin) and $ORG_ID, $OTHER_USER_ID
# (another active member of that org) are already set.

curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "http://localhost:8001/organizations/$ORG_ID/roles" \
  -H "Authorization: Bearer $ORG_OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"deploy-check-role","permissions":["dataset.read"]}'
# expect 201

curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "http://localhost:8001/organizations/$ORG_ID/members/$OTHER_USER_ID/roles" \
  -H "Authorization: Bearer $ORG_OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"roles":["platform_admin"]}'
# expect 403
```

If any expected result doesn't match, stop and do not consider the
deployment complete — see PR13's implementation report for the security
rationale behind each of these four checks (Finding 1 for the
scientist/viewer 200/403 pair, Finding 2 for the two Org-Admin rows).

---

## 8. Rollback Procedure

Trigger rollback if:
- migration fails
- smoke tests fail
- authentication failures occur
- RBAC permission evaluation errors occur

### Step 1 — Stop PR13 services

```bash
cd ~/Desktop/machine/omnibioai-studio
docker compose stop \
  auth-service \
  policy-engine \
  api-gateway \
  control-center
```

### Step 2 — Restore database

> **`scripts/restore-mysql.sh` does not exist in this repo as of PR13** —
> only `backup-mysql.sh` (and per-service `backup-config.sh`/
> `backup-neo4j.sh`/`backup-nvme.sh`) exist. Writing that script is a
> prerequisite for this rollback plan to be real, not just aspirational —
> until it exists, restore manually. `backup-mysql.sh` produces a
> `mysqldump | gzip` file at `work/backups/mysql/omnibioai_<timestamp>.sql.gz`
> (see step 1 of the deployment procedure above for the exact path printed
> at backup time):
>
> ```bash
> gunzip -c work/backups/mysql/omnibioai_<timestamp>.sql.gz \
>   | docker exec -i omnibioai-studio-mysql-1 mysql -uroot -p"${MYSQL_ROOT_PASSWORD:-root}"
> ```

Verify:

```sql
SELECT version_num FROM alembic_version;
```

Expected:

```
0015_refresh_token_length
```

### Step 3 — Downgrade migration (if DB restore unavailable)

```bash
cd ~/Desktop/machine/omnibioai-auth
alembic downgrade 0015_refresh_token_length
```

Verify `roles` table does not contain `organization_id`:

```bash
docker exec omnibioai-studio-mysql-1 mysql -uroot -p"${MYSQL_ROOT_PASSWORD:-root}" \
  -N -e "DESCRIBE omnibioai.roles;" | grep organization_id
# expect no output
```

Only one of Step 2 or Step 3 is needed, not both — a full DB restore (Step
2) already reverts the schema; Step 3 is the fallback when no usable
backup exists. Running both is redundant, not harmful (the migration's
downgrade is idempotent against a database that's already pre-`0016`).

### Step 4 — Checkout previous release

```bash
for repo in omnibioai-auth omnibioai-policy-engine omnibioai-api-gateway \
            omnibioai-control-center omnibioai-docs omnibioai-studio; do
  cd ~/Desktop/machine/$repo
  git checkout <pre-PR13-main-commit>
done
```

Use each repo's `main` HEAD *as it was immediately before* the PR13 merge
commits from step 2 of the deployment procedure above — record those
commit hashes at merge time (`git log --oneline -1 main` per repo, right
before merging) specifically so this step has a real target instead of a
placeholder when it's actually needed.

### Step 5 — Rebuild previous images

```bash
cd ~/Desktop/machine/omnibioai-studio
docker compose build \
  auth-service \
  policy-engine \
  api-gateway \
  control-center
```

Same `api-gateway` caveat as the deployment procedure's step 6 applies here
too (no `build:` stanza in `docker-compose.yml` — build it manually from
its own Dockerfile if that gap is still open).

### Step 6 — Restart previous stack

```bash
docker compose up -d --no-deps --force-recreate \
  auth-service policy-engine api-gateway control-center
docker compose ps
```

### Step 7 — Validate rollback

Verify:
- login works (`POST /auth/login` against a known account)
- JWT validation works (`POST /auth/validate`)
- existing roles resolve (`GET /orgs/{org_id}/roles` for an org created
  before PR13 — should list `org_admin`/`org_member` with no
  `organization_id` field, since that response shape reverts with the code)
- API gateway authorization works (`GET /model-registry/v1` with a valid
  token — 401/403/200 behavior matches pre-PR13 expectations)
- Control Center loads (Roles & Permissions page renders the pre-PR13
  read-only view — no Create/Edit/Delete controls, since that UI reverted
  too)

Rollback is complete only when all 5 checks above pass. If any fails, this
is now a live incident beyond what this runbook covers — escalate rather
than continuing to improvise against production.
