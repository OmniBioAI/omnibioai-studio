# Redis Backup and Recovery — Phase 1 Local Tier

Phase 1 implements an authenticated, encrypted Redis RDB plus ACL-file backup to `/media/manish/omnibioai-data/secure-backup` on `/dev/sda1`.

The workflow uses `redis_backup` with only `PING`, `INFO`, `LASTSAVE`, and `BGSAVE`. It has no ACL, CONFIG, key, stream, or broad-category permissions. The password and dedicated encryption credential remain outside Git and containers with mode 0600 files under the protected credential directory.

`scripts/backup-redis.sh` requires authenticated precheck, healthy AOF/RDB state, `BGSAVE`, bounded completion polling, an advancing `LASTSAVE`, encrypted publication, SHA-256 verification, decryption verification, and a non-secret manifest. The encrypted archive contains `dump.rdb` and `users.acl`; the manifest asserts `default off` without ACL hashes or data values.

`scripts/verify-redis-backup.sh` verifies ciphertext, manifest, checksum, decryption, and archive structure. It deliberately does not restore Redis and never marks an artifact `RESTORE-VERIFIED`.

`scripts/redis-backup-health-check.sh` checks the machine-readable health state, freshness, checksum, mount source, and destination permissions. Existing local alert events are used; this is **LOCAL EVENT EMISSION ONLY**, not external operator notification.

The Phase 1 schedule interval is recorded as 15 minutes and the strictest approved technical RPO is recorded as 5 minutes. A 15-minute schedule does not itself prove a 5-minute measured RPO; that requires the separately approved restore tranche.

Retention stays conservative until an isolated restore establishes the first `RESTORE-VERIFIED` artifact. Failed backup, encryption, verification, or retention processing preserves existing artifacts.

No off-host publication, external alerting, production restore, production application change, or Redis recreation is part of Phase 1.
