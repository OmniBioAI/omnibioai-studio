# OmniBioAI Scripts

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
