# Redis ACL canonical policy and bootstrap

`config/redis/acl-policy.json` is the single tracked source for Redis user
names, enablement, command rules, key/channel patterns, selector rules, and
credential *references*. It contains no passwords or ACL hashes. The
`redis_rag_cache` record preserves the observed ACL; the separate
`rag-cache-target-policy.json` is a future contract and is deliberately not
bound to a username.

## Bootstrap contract

`scripts/redis_acl_bootstrap.py bootstrap` is a standard-library Python
one-shot initializer. The `redis:7-alpine` runtime image does not provide
Python, so Compose consolidation should invoke it from a separate bootstrap
service, not add an interpreter to or change the Redis image. The initializer
should use `network_mode: none`, mount the Redis data volume read/write, the
policy read-only, and the protected credential directory read-only. Redis
must depend on successful completion (`service_completed_successfully`) and
must not start before then. Application services continue to depend on Redis
health. This sequencing provides no Redis listener during policy rendering.

The initializer reads protected credential files, hashes each credential in
memory using Redis's SHA-256 ACL password representation, and writes
`users.acl` with mode `0600` using an atomic replace. The default user is
rendered explicitly `off`. Redis is not started by this command; the caller
may start it only after successful initialization, passing the resulting ACL
file at process startup.

The first run is permitted only when `/data` has no ACL file, ownership marker,
or other data (apart from `lost+found`). It writes a non-secret marker binding
the volume to the SHA-256 of the canonical policy. A subsequent run accepts a
volume only when the marker and the full ACL—including password hashes
compared internally—match the rendered policy. It never repairs, replaces, or
silently adopts drift. Missing credentials, malformed inputs, missing or extra
users, and policy mismatches exit nonzero before Redis starts. An existing
unmanaged volume requires a separately reviewed adoption/reconciliation
operation; it is not treated as fresh.

Credential references name protected environment variables for application
identities whose Compose variable names are established; the Studio secret
generator materializes those values as per-user files, which the bootstrap
reads rather than inheriting secrets in its process environment. It uses protected files for
`redis_admin` and `redis_backup`; the existing exporter password-map file for
`redis_monitoring`; and a separate protected `redis_rag_cache.pass` input.
The running RAG container obtains `CACHE_REDIS_URL` from the protected
`.secrets/rag_redis.env` file; its username is `redis_rag_cache`. The URL
credential matches the running Redis identity and can be preserved without
rotation, but the dedicated `redis_rag_cache.pass` input expected in the
bootstrap credential directory is not present. Do not infer it from the
different legacy `REDIS_IAM_RAG_PASSWORD` setting. An operator must transfer
the existing decoded credential into the protected input through an approved,
no-overwrite procedure before bootstrap validation.

The running exporter is configured as `redis_monitoring` and reads the
read-only protected exporter password map. Its current map entry matches the
protected `redis_monitoring.pass` value, and the exporter reports a successful
Redis scrape. However, the map key is a target-URI key, not the
`redis_monitoring` key currently referenced by `acl-policy.json`; therefore
the canonical bootstrap credential reference must be reconciled before it can
render this identity. Do not activate bootstrap while either credential
reference is unresolved. The renderer never prints credential contents or ACL
hashes. The Studio `.env` generator creates
missing established application Redis credentials once, preserves existing
values, and enforces owner-only (`0600`) `.env` mode. The derived
`.secrets/redis-acl/<user>.pass` files are held in a `0700` directory, mode
`0600`, and existing files must match rather than being silently replaced.
Its settings writer also preserves the environment fields instead of dropping
them on save.

## Current-volume handoff

This tranche intentionally does not activate the bootstrap in Compose. The
three Compose files currently have unrelated concurrent modifications. The
tracked source and tests are ready for the Studio consolidation to add a
one-shot initializer dependency and protected credential mounts. Before
activation, the current production volume must be handled as **unmanaged**:
it has no bootstrap ownership marker. Do not run this bootstrap against that
volume; first perform a separately approved, read-only source/credential
reconciliation and explicit adoption plan. Production ACLs and consumers were
not changed here.

## Identity ownership findings

The running RAG container's Redis URL username is `redis_rag_cache`. The
running containers/configuration inspected in this tranche did not establish
a current production consumer for `redis_cache_manager`; its appearance in
dirty release Compose files is not treated as deployed ownership. Therefore
the future RAG contract is recommended for deliberate tightening of
`redis_rag_cache` after the RAG owner approves a separate change. Do not
repurpose `redis_cache_manager`.

The future RAG contract is the required command set and key scope from its
approved source commit. It does not grant `KEYS`, `SCAN`, `INFO`, `FLUSHDB`, or
`FLUSHALL`. Stale query-index registrations remain housekeeping metadata, not
an authorization boundary.

## Operational state machine

| Volume state | Behavior |
| --- | --- |
| Truly empty, no marker and no data | Render/validate and atomically create ACL plus marker, then caller may start Redis |
| Managed marker and exact policy/hash match | No-op; caller may start Redis |
| ACL without marker, marker without ACL, or non-empty unowned volume | Fail closed; require explicit operator reconciliation |
| Missing/malformed credential, missing/extra identity, changed rules, marker mismatch | Fail closed; do not overwrite existing files |

Compose activation is intentionally deferred to the existing Studio
consolidation so no unrelated dirty Compose hunk is mixed into this change.
