# Studio Deployment Network Boundary & Credential Requirements

Scope: the **Studio release/packaged deployment configuration** — the compose
files that ship to and run on customer machines. This document covers one
HIPAA audit finding (infrastructure-level exposure and gateway bypass in the
Studio release compose configuration). It does **not** cover, and makes no
claim about, the rest of the HIPAA audit.

---

## 1. The original exposure

`docker-compose.release.yml` — the file `electron-builder` bundles into every
packaged installer, and the one the app runs on customer machines — published
both datastores directly to the host with no interface binding:

```yaml
mysql:
  environment:
    MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-omnibioai}
  ports:
    - "3306:3306"        # → 0.0.0.0:3306

redis:
  ports:
    - "6380:6379"        # → 0.0.0.0:6380
```

A bare `"3306:3306"` binds `0.0.0.0`, not loopback. On any machine whose host
firewall did not independently block the port, MySQL and Redis were reachable
from the network.

Three separate problems compounded:

| # | Problem | Consequence |
|---|---|---|
| 1 | MySQL published on `0.0.0.0:3306` | Direct network reach to the multi-tenant database |
| 2 | Root password defaulted to the literal `omnibioai`, committed in this repo | The reachable database had a **publicly known** credential |
| 3 | Redis published on `0.0.0.0:6380`, no auth at all | Session/cache/audit-stream data readable and writable by anyone |

### Why this mattered more than "a database port is open"

Every application-layer control the platform has — IAM authentication, RBAC
permission checks, organization isolation, audit logging, the API Gateway's
zero-trust middleware — operates *above* the datastore. A client that can
speak the MySQL wire protocol to port 3306 is beneath all of it. It does not
present a JWT, is not subject to `organization_id` scoping, is not filtered
by any queryset, and generates no audit event.

The extensive tenant-isolation work already merged across `omnibioai-auth`,
`omnibioai-lims`, `omnibioai-model-registry`, and others enforces its
boundaries in application code against this shared database. A direct
connection reads every organization's rows regardless. Item 2 meant no
credential guessing was required.

`DEPLOYMENT.md`'s own port table already documented the intended design:

> | 3306 | MySQL | Internal only — not exposed externally in prod |

The intent was right. The compose file simply never implemented it.

---

## 2. The production network boundary

Release/default configuration (`docker-compose.release.yml`, and the
dash-named `docker-compose-release.yml` kept in parity with it):

- **MySQL: not published.** No `ports:` entry.
- **Redis: not published.** No `ports:` entry.
- Both remain fully reachable **inside** the compose network by service name
  (`mysql:3306`, `redis:6379`), which is how every consumer already addressed
  them. No connection string changed.
- The **API Gateway (`:8080`) remains published** — it is the intended
  entry point, and a regression test asserts it stays that way, so the
  exposure fix cannot be over-applied to the service that is supposed to be
  externally reachable.

The distinction this enforces:

| Category | Status | Example |
|---|---|---|
| Internal Docker-network service-to-service | **Allowed, unchanged** | `workbench → mysql:3306` |
| Externally published datastore | **Removed** | `0.0.0.0:3306` |
| Externally published gateway | **Retained deliberately** | `api-gateway:8080` |
| Browser/client-facing API | Through gateway / nginx-router | `/_svc/*` |

---

## 3. The development-only exception

Local access to the release stack's datastores is preserved — through an
explicit, separate file, never by weakening the default:

```bash
docker compose -f docker-compose.release.yml \
               -f docker-compose.release.dev-ports.yml \
               --env-file .env up -d
```

`docker-compose.release.dev-ports.yml` republishes both, and:

- binds **`127.0.0.1` by default**, not `0.0.0.0` — enabling local access does
  not expose a datastore to the developer's LAN. Overridable via
  `MYSQL_DEV_HOST_IP` / `REDIS_DEV_HOST_IP` for the rare case that needs it;
- is **not bundled** by `electron-builder` (asserted by test);
- is **not referenced** by `electron/main.js` or `scripts/start.sh` — the two
  production startup paths (asserted by test).

The dev exception therefore cannot become the production default by
accident: it requires someone to type a second `-f` flag.

`docker-compose.yml` (the local development stack, used only when the Electron
app is unpackaged) is **deliberately unchanged** and still publishes ports for
local tooling. That is its purpose; the finding is about the release
configuration. A test pins this distinction so the two files' roles stay
legible.

---

## 4. Credential requirements

Every credential below previously fell back to a public literal committed to
this repository. All are now **required** — compose refuses to start without
them, via `${VAR:?message}`:

| Variable | Was silently defaulting to |
|---|---|
| `MYSQL_ROOT_PASSWORD` | `omnibioai` |
| `AUTH_SECRET_KEY` | `change-me-in-production` |
| `LICENSE_SECRET` | `omnibioai-secret-change-in-production` |
| `GF_ADMIN_PASSWORD` | `omnibioai` |
| `LIMSX_DJANGO_SECRET_KEY` | `omnibioai-studio-secret` |
| `JUPYTER_TOKEN` | `omnibioai` |
| `RSTUDIO_PASSWORD` | `omnibioai` |
| `VSCODE_PASSWORD` | `omnibioai` |

Missing any of them now produces:

```
error while interpolating services.<svc>.environment.<VAR>:
required variable MYSQL_ROOT_PASSWORD is missing a value: MYSQL_ROOT_PASSWORD must be set
```

…instead of a stack that starts successfully with a guessable password.

**No replacement secrets are hard-coded.** Values come from the environment
only. The Studio app generates them per-installation on first launch
(`electron/secrets.js`, 32 random bytes each, rotated if still at a known-weak
literal), and never logs a value. `tests/test_secret_generation.js` asserts on
properties (length, charset, distinctness across installs) and likewise never
prints one.

Two related fixes fell out of this:

- **`LIMSX_DJANGO_SECRET_KEY`, `JUPYTER_TOKEN`, `RSTUDIO_PASSWORD`, and
  `VSCODE_PASSWORD` were never in the app's generation list at all** — so
  every Studio installation everywhere shared the same four hardcoded values,
  including the key signing LIMS's session cookies. They are generated now.
- **`scripts/start.sh` defaulted `MYSQL_ROOT_PASSWORD` to `omnibioai`** in its
  "no .env found" branch, which would have re-supplied the weak value and
  defeated the `:?` guard. Removed, so the guard actually fires.

`ADMIN_KEY` was **removed** rather than made required: PR11 replaced the
license server's static shared-secret check with IAM authorization, and
`backend/license_server.py` has had zero references to it since. Both release
files were still passing a dead `${ADMIN_KEY:-admin-secret}`.

---

## 5. Gateway-first access

Each backend dependency was assessed individually rather than rewritten
wholesale — most internal Docker URLs are legitimate and were left alone.

**Fixed:** `celery-worker` had no `GATEWAY_URL` in either release file, though
`docker-compose.yml` gained it with issue #196. The call sites that #196
repointed read `GATEWAY_URL` exclusively, so **the packaged release build
never received that fix** — only the dev stack did. Now wired in both.

**Deliberately left pointing directly at the backend:**

- `TES_BASE_URL` in `workbench`/`celery-worker`. Other, not-yet-migrated
  readers of this variable in the same image (`bioquery_tasks.py`, #209)
  attach no bearer token and would silently 401 if it were routed through the
  gateway's `AuthMiddleware`. This matches the reasoning already recorded in
  `docker-compose.yml` and is tracked under #209, not this workstream.
- `IAM_URL`, `POLICY_URL`, `AUDIT_URL`, `TOOLSERVER_BASE_URL`,
  `MODEL_REGISTRY_BASE_URL`, `RAG_BASE_URL`, `BILLING_URL`, `LIMS_BASE_URL`,
  and the gateway's own upstream `*_URL` values. These are **internal control-
  plane and service-mesh calls on the private Docker network**, not
  client-facing traffic. The gateway routes *external* clients to these
  services; routing the gateway's own upstreams through itself would be
  circular. Publishing them is a separate question from how they are
  addressed internally.

---

## 6. Accepted / intentionally retained

Recorded explicitly so they are visible decisions rather than oversights:

- **Internal Docker-network service-to-service communication is retained in
  full.** It is not the finding, and severing it would break the platform.
- **`docker-compose.yml` (dev stack) still publishes datastores.** By design.
- **Other services remain published** (`workbench:8000`, `tes:8081`,
  `auth-service:8001`, etc.). They enforce their own IAM authorization and are
  out of scope for this datastore-exposure finding — but see the gap below.
- **`docker-compose-release.yml` (dash) is not the shipped artifact.**
  `electron-builder.json` and `electron/main.js` both use the dot-named
  `docker-compose.release.yml`. The dash file is kept in credential/exposure
  parity — the two have silently diverged before, which is why
  `tests/test_compose_release_config.py` exists — but consolidating or
  deleting it is separate work.

---

## 7. Remaining gaps (not addressed here)

Found during this work; **not fixed in this change** and not claimed to be:

1. **Backend services are published on `${HOST_IP:-0.0.0.0}`.** The default
   binds all interfaces for `workbench`, `tes`, `auth-service`, `rag`,
   `model-registry`, and others. These do enforce IAM authorization, so this
   is materially different from an unauthenticated datastore — but the
   gateway-first design would be better served by binding them to loopback
   and routing through `nginx-router`, as `lims` and `nginx-router` itself
   already do. Larger change (breaks the direct-LAN-access path `HOST_IP`
   exists for); needs a product/deployment decision, not made here.

   **`control-center` follow-up (2026-08-13, separate branch):** this
   document previously claimed `control-center` was *already* loopback-only
   alongside `lims`/`nginx-router` — a re-audit found that claim was true
   only of `docker-compose.yml` (dev); both release files had drifted to
   `${HOST_IP:-0.0.0.0}:7070:7070`. Fixed to `127.0.0.1:7070:7070` in both
   release files, restoring the binding this document already described
   (`tests/test_compose_network_exposure.py`'s
   `test_control_center_is_loopback_bound_in_release_configs` /
   `test_dev_compose_control_center_still_loopback_bound` pin it going
   forward). Not a live-authentication-bypass fix — `control-center`'s
   `/docker`, `/services`, `/summary`, `/config` routes are independently
   gated by `require_permission("platform.manage_infra")` at the FastAPI
   app level (`omnibioai-control-center`, commit `8720377`) regardless of
   this binding — this closes an unintended defense-in-depth gap and a
   documentation inaccuracy, not an unauthenticated exposure. The general
   `workbench`/`tes`/`auth-service`/`rag`/`model-registry` question above is
   otherwise unchanged and still open.
2. **`docker-compose-release.yml`'s `security-audit` block lacks
   `AUDIT_DATABASE_URL` and the corresponding `depends_on: mysql: condition:
   service_healthy`** that `docker-compose.release.yml` has (both files wire
   `JWT_SECRET` identically — that part is not the gap). Without
   `AUDIT_DATABASE_URL`, `GET /audit/events` falls back to the app's own
   hardcoded `mysql+pymysql://root:root@localhost:3306/omnibioai_audit`
   default, which is unreachable from inside the container. Pre-existing
   drift between the two files (confirmed present on `origin/main` before
   this change), unrelated to exposure; left alone to keep this change
   scoped.
3. **Weak defaults remain on non-credential variables**, e.g.
   `LIMS_PASSWORD: ${LIMS_PASSWORD:-omnibioai}` (a service-account password
   for workbench→LIMS) and `NEO4J_PASSWORD`. These sit on a different path
   than the datastore exposure fixed here and warrant their own pass.
4. **No verification that a real deployment has rotated its credentials.**
   The `:?` guard proves a value was *supplied*, not that it is strong or
   unique. A startup-time weak-credential check would close that.
5. **`lims` DEBUG follow-up (2026-08-13, separate branch):** a re-audit
   found `docker-compose-release.yml`'s `lims` service had drifted to
   `DJANGO_DEBUG: "true"` with `FIELD_ENCRYPTION_KEY` entirely absent, while
   `docker-compose.release.yml` (the file actually shipped by
   `electron-builder`) already carried the correct `"false"` +
   `FIELD_ENCRYPTION_KEY` pairing from an earlier fix (951ad25) that missed
   the dash file. `lab_data_manager/settings.py` reads `DJANGO_DEBUG`
   directly from the environment with no override anywhere in the image, so
   this was a live drift, not dead configuration — confirmed effective (not
   merely present) before fixing. Not reachable through the packaged
   Electron app's own startup path (`electron/main.js` never resolves to
   the dash file), so this closes a parity/drift gap in the file documented
   above as "kept in parity," not a live exposure in the shipped installer.
   Fixed to match the dot file; pinned by
   `tests/test_lims_debug_config.py` so the two files' `DJANGO_DEBUG` and
   `FIELD_ENCRYPTION_KEY` wiring can't silently diverge again.

---

## 8. Verifying the boundary

```bash
# No mysql/redis ports in the release default
docker compose -f docker-compose.release.yml config | grep -A2 -E '^  (mysql|redis):'

# Fails closed without required secrets
docker compose --env-file /dev/null -f docker-compose.release.yml config

# Regression suites
python3 -m pytest tests/test_compose_network_exposure.py \
                  tests/test_compose_release_config.py -q
npm run test:secrets
```

CI enforces all of the above on every push and PR, including a negative test
asserting that both release files *refuse* to validate when required secrets
are absent.
