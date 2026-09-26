# Redis Backup and Recovery — Phase 1 Local Tier

Phase 1 implements an authenticated, encrypted Redis RDB plus ACL-file backup to `/media/manish/omnibioai-data/secure-backup` on `/dev/sda1`.

The workflow uses `redis_backup` with only `PING`, `INFO`, `LASTSAVE`, and `BGSAVE`. It has no ACL, CONFIG, key, stream, or broad-category permissions. The password and dedicated encryption credential remain outside Git and containers with mode 0600 files under the protected credential directory.

`scripts/backup-redis.sh` requires authenticated `redis_backup` and `redis_admin` prechecks, and compares runtime ACL metadata with `/data/users.acl` after removing password hashes. Any runtime-only identity or authorization drift refuses publication. It then requires healthy AOF/RDB state, `BGSAVE`, bounded completion polling, an advancing `LASTSAVE`, encrypted publication, SHA-256 verification, decryption verification, and a non-secret manifest. The encrypted archive contains `dump.rdb` and `users.acl`; the manifest asserts `default off`, includes the ACL identity count and cutoff/snapshot/local-verification timestamps, and contains no ACL hashes or data values.

`scripts/verify-redis-backup.sh` verifies ciphertext, manifest, checksum, decryption, and archive structure. It deliberately does not restore Redis and never marks an artifact `RESTORE-VERIFIED`.

After a complete isolated restore, `scripts/record-redis-restore-verification.py` writes an atomic, checksum-bound `.restore-verified.json` sidecar. The encrypted artifact and its original `VERIFIED` manifest remain immutable. Only a successful `VERIFIED` artifact with complete ACL evidence can transition to `RESTORE-VERIFIED`; repeated identical transitions are idempotent. Retention recognizes these sidecars and protects restore-verified artifacts.

`scripts/redis-backup-health-check.sh` checks the machine-readable health state, freshness, checksum, mount source, and destination permissions. Existing local alert events are used; this is **LOCAL EVENT EMISSION ONLY**, not external operator notification.

The production schedule is implemented as one host cron entry in `scripts/redis-backup.cron`, running every five minutes. Credentials are read only from the protected external credential directory; they are not present in the cron command. The workflow uses an exclusive `flock` and records lock contention separately from last-good backup health, so an overlapping invocation cannot start a second `BGSAVE` or turn a healthy backup into a false failure.

Retention keeps 288 newest valid recovery points plus up to 14 older daily points. Artifact, manifest, and any restore-verification sidecar are treated as one unit. Malformed or unrecognized units are preserved, restore-verified units are protected, and retention failure is observable without invalidating a successfully verified artifact. A one-gigabyte minimum-free-space guard prevents uncontrolled operation when the destination becomes constrained; the threshold is well above the measured two-times projected five-minute steady-state footprint and is configurable for operations.

The strictest approved technical RPO is recorded as 5 minutes. A five-minute schedule establishes the intended maximum interval, not by itself a measured end-to-end RPO; actual scheduled cutoff, snapshot, and local-verification timestamps must be assessed over repeated runs. External/off-host protection and operator-visible alert delivery remain outside this local Phase 1 tranche.

Retention stays conservative until an isolated restore establishes the first `RESTORE-VERIFIED` artifact. Failed backup, encryption, verification, or retention processing preserves existing artifacts.

No off-host publication, external alerting, production restore, production application change, or Redis recreation is part of Phase 1.
