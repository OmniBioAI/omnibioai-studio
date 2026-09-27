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
volume only when the marker and the full ACL—including password verifiers
compared internally—match the rendered policy. It never repairs or replaces
drift. The explicit `adopt` command is only for a non-empty existing volume
without a marker: it validates the exact identity set, disabled default user,
all credential-backed verifiers, and the complete rendered policy, then
atomically creates only the non-secret ownership marker. It does not rewrite
`users.acl`, contact Redis, or alter persistence data. A repeat adoption
validates managed state and returns `managed-match` without writing. Missing
credentials, malformed inputs, identity/rule drift, or an existing mismatched
marker fail closed.

Credential references name established application environment variables; the
bootstrap itself resolves only protected files, never inherited process
environment. For an existing volume, use `adopt`, which compares every
credential-derived verifier with `users.acl` before creating ownership. Do not
populate protected activation files blindly from a stale Studio `.env`: a
verifier mismatch must stop adoption. The exporter credential is resolved
from its password map using the exact target-URI JSON key; duplicate, missing,
or malformed map entries fail closed. The RAG credential can be materialized
without rotation with `materialize-rag-credential --source <protected-rag-env>
--credential-dir <protected-credential-dir>`. This reads the existing
`CACHE_REDIS_URL`, requires the `redis_rag_cache` username, decodes the
password in memory, and creates only `redis_rag_cache.pass` with exclusive
mode-`0600` creation in a mode-`0700` directory. An identical existing file
is a no-op; a different file is never overwritten. This command was not run
against production during implementation.

The running exporter is configured as `redis_monitoring` and reads the
read-only protected exporter password map. Its credential reference selects
the exact target-URI key in that map; the value was verified in memory against
both the protected `redis_monitoring.pass` file and the persisted ACL verifier.
The RAG credential source is the protected `.secrets/rag_redis.env`; its
password is preserved without rotation by the dedicated materialization
command described above. The renderer never prints credential contents or ACL
verifiers. The Studio `.env` generator creates
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
activation, the existing production volume must use the separately controlled
`adopt` mode only after every named credential file has been validated against
the existing ACL. This tranche's read-only source comparison could not verify
two identities from available protected/runtime sources; adoption and
activation must remain stopped until those sources are reconciled. Production
ACLs and consumers were not changed here.

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
| ACL without marker, marker without ACL, or non-empty unowned volume | Fail closed; require explicit `adopt` after exact credential/policy validation |
| Missing/malformed credential, missing/extra identity, changed rules, marker mismatch | Fail closed; do not overwrite existing files |

Compose activation is intentionally deferred to the existing Studio
consolidation so no unrelated dirty Compose hunk is mixed into this change.
