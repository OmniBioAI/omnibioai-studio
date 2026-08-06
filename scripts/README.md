# OmniBioAI Scripts

## test-enterprise-security.sh (PR12/PR13)
IAM/RBAC smoke test: auth/gateway/policy-engine/control-center health, JWT
issuance+validation, and RBAC enforcement (401/401/403/200) against the live
stack -- PR13 added the 200 path (a scientist-role token succeeds where a
viewer-role token gets 403), seeded via direct MySQL access since there's no
HTTP-only way to get a throwaway user into an org-scoped role. See
`docs/security/IAM-RBAC.md` (in `omnibioai-docs`) for the full architecture
writeup.

**Temporary home**: this script lives here, and the accompanying doc lives
in `omnibioai-docs/security/IAM-RBAC.md`, because `omnibioai-ecosystem` —
the intended long-term home for both — was mid an interactive git rebase
(history rewrite removing private-repo gitlinks) when PR12 was written, and
was unsafe to commit to. Once that rebase completes, migrate both there;
optionally leave a wrapper script in `omnibioai-ecosystem` that just invokes
this one, rather than duplicating it.

### Manual run
./scripts/test-enterprise-security.sh

See `PR13-DEPLOYMENT-RUNBOOK.md` (this directory) for the full deployment
procedure this script is step 7 of — backup, merge, migrate, restart,
verify. Documented only; not yet executed as of PR13.

## backup-mysql.sh
Daily MySQL backup with 7-day retention.

### Manual run
./scripts/backup-mysql.sh

### Schedule with cron (daily at 2am)
Run `crontab -e` and add:
0 2 * * * /home/manish/Desktop/machine/omnibioai-studio/scripts/backup-mysql.sh >> /var/log/omnibioai-backup.log 2>&1

### Configuration (via environment or .env)
| Variable         | Default                    | Description              |
|------------------|----------------------------|--------------------------|
| BACKUP_DIR       | work/backups/mysql         | Where backups are stored |
| RETAIN_DAYS      | 7                          | Days to keep backups     |
| MYSQL_CONTAINER  | omnibioai-studio-mysql-1   | Container name           |

## check-env.sh
Validates .env before starting the stack. Run before `docker compose up`.

./scripts/check-env.sh && docker compose up -d

Exits with code 1 if any critical secret uses a placeholder value.
