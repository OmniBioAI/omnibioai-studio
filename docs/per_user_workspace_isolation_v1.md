# OMNIBIOAI_PER_USER_WORKSPACE_ISOLATION_V1

WORKSTREAM=OMNIBIOAI_PER_USER_WORKSPACE_ISOLATION_V1  
STATUS=PARTIAL  
RESULT=Architecture audit complete; the existing launcher contract is not an acceptable per-user implementation. No shared Studio service was restarted, no Storage P0 branch was changed, and no production deployment was performed.

## Acceptance result

`PARTIAL`. The current system cannot pass the stated acceptance test. Two authenticated users cannot independently launch isolated runtimes because the existing launcher controls the same three Compose containers for every caller:

```text
omnibioai-jupyter  -> fixed container and fixed host port 8888
omnibioai-rstudio  -> fixed container and fixed host port 8787
omnibioai-vscode   -> fixed container and fixed host port 8083
```

The current v1 API validates identity and bounds, but it applies those bounds to a shared container and keeps its manifest in a process-local `Map`. It is therefore a security foundation, not a qualified isolation implementation. The existing warning must remain until the vertical slice below is delivered in the launcher repository and wired into Studio.

## Resumed implementation and runtime evidence

This resume added a disposable local manager under `workspace-manager/`. It uses a durable `0600` JSON record store, IAM `/auth/validate` ownership, UUID-derived runtime/volume/network names, non-root Jupyter execution, server-side CPU and memory ceilings, Docker `NanoCpus`/`Memory` enforcement, owner-scoped lifecycle routes, expiring owner-bound sessions, and deletion cleanup. Workspace containers receive no Docker socket and no shared host directory.

The disposable test passed from the isolated clone with Docker access granted only to the trusted test process:

```text
DOCKER_SOCKET_PATH=/Users/manishkumar/.docker/run/docker.sock npm test
✔ two IAM owners receive isolated Jupyter runtimes and lifecycle enforcement (1238.627ms)
tests 1, pass 1, fail 0
```

It verified distinct IAM-owned containers, volumes, networks, persisted records, actual Docker CPU/memory limits (`NanoCpus=250000000`, `Memory=536870912`), non-privileged execution, cross-user denial, running resource-change denial, stopped update, stop/resume, and deletion cleanup.

The owner-success HTTP proxy request could not be qualified from this isolated host process: Docker Desktop's loopback-published runtime connection resets inside the manager process (`UND_ERR_SOCKET`), although a direct read-only Node probe to the same disposable port succeeds. This is recorded as a proxy qualification blocker, not treated as a pass.

The existing `docker-socket-proxy` also cannot yet be used by this manager for production lifecycle creation: `/networks/*` and `/volumes/*` are explicitly denied, and named-volume creation is not allowed. Its policy was not weakened. The qualified test therefore used a trusted manager process with daemon access; that is not a production deployment claim.

### Docker API permission matrix

The deployed shared socket proxy currently permits the container lifecycle read/create/start/stop/delete subset, but explicitly denies network and volume categories. The manager's new control plane exposes no arbitrary Docker path; each operation is fixed and every managed resource is checked by deterministic name and ownership labels before mutation.

| Operation | Docker API | Shared proxy | Manager control plane | Lifecycle need | Security boundary |
|---|---|---:|---:|---|---|
| Create container | `POST /containers/create` | Allowed with body policy | Allowed, fixed Jupyter image/config | Create | UUID name, fixed image, labels, non-root, no privileged/socket/host mount |
| Inspect container | `GET /containers/{id}/json` | Allowed | Allowed after label/name verification | Recovery/status | Runtime ID is never accepted as owner proof |
| Start/stop | `POST /containers/{id}/start|stop` | Allowed | Allowed after managed-resource verification | Lifecycle | Owner record plus labels |
| Update | `POST /containers/{id}/update` | Not used by shared Launcher path | Allowed with server allocation only | Stopped resource change | CPU/memory only, GPU zero |
| Delete container | `DELETE /containers/{id}` | Allowed | Allowed after verification | Delete | No arbitrary IDs or names |
| Create/inspect/delete network | `POST/GET/DELETE /networks...` | Denied category | Allowed only for `obws-network-{uuid}` | Per-workspace network | Dedicated manager boundary; no client passthrough |
| Create/inspect/delete volume | `POST/GET/DELETE /volumes...` | Denied category | Allowed only for `obws-volume-{uuid}` | Persistent workspace storage | Dedicated manager boundary; no client passthrough |
| Network attach/detach | `/networks/{id}/connect|disconnect` | Denied category | Not exposed; container is created on its server-selected network | Not required | Avoids arbitrary cross-network attachment |

The shared proxy cannot safely be widened in place: it serves unrelated workbench/TES consumers and its category-level rules do not express “only this workspace UUID and these labels.” The trusted control plane is therefore intentionally narrow in code, but production deployment still needs a separate socket-proxy instance or equivalent policy-enforcing sidecar with the same per-resource restrictions. The raw daemon socket is never exposed to users or workspace containers.

### Threat model and routing failure handling

- Cross-user access: IAM identity and owner organization/user key are required on every API and session route; mismatches return `404`.
- Docker privilege escalation: no privileged mode, host networking, arbitrary mounts, devices, Docker socket, or client-selected image/configuration.
- Arbitrary host mounts: only one server-created Docker named volume is mounted at `/home/jovyan/work`.
- SSRF: upstream host and port come only from server-created runtime metadata; clients supply neither URL nor container ID.
- Container breakout exposure: Jupyter runs as `1000:1000` with `no-new-privileges`; the workspace has no daemon control plane access.
- Resource exhaustion: server ceilings and actual Docker `NanoCpus`/`Memory` values are enforced; GPU is always zero in this slice.
- Stale routing: sessions expire, deleted/stopped workspaces are rejected, and missing runtimes become `failed` during recovery.
- `UND_ERR_SOCKET`/`ECONNRESET`: readiness and direct Node probes succeed, private container IPs are unreachable from the host, and the manager's host-process request to Docker Desktop's loopback-published port resets. The error is returned as `502 workspace proxy unavailable`; it is not retried or hidden. This remains an environment/control-plane integration blocker.

## Architecture audit

### Studio

- `src/ui/pages/Studio.jsx` exposes the Launcher entry point.
- `src/ui/pages/Services.jsx` polls `/api/launcher/status/:tool` and opens fixed JupyterLab, RStudio, and VS Code destinations.
- `docker-compose.yml` defines fixed `jupyter`, `rstudio`, and `vscode` services with fixed container names, host ports, shared `${MACHINE_DIR}/data`, and shared `${MACHINE_DIR}/work` mounts.
- `docker/nginx-router.conf` has static service routes. It does not select a workspace UUID or validate a workspace session token.
- The Docker socket proxy is a useful existing control boundary, but its current Launcher allowlist was intentionally limited to inspect/start/stop of fixed containers; it does not qualify create/inspect/update/stop/remove for per-workspace resources.

### Launcher

The sibling `omnibioai-launcher` repository already contains:

- profiles and environment types (`jupyterlab`, `rstudio`, `vscode`, `terminal`);
- server-side request validation, resource ceilings, image reference validation, architecture checks, and pre-provisioned-GPU checks;
- IAM `/auth/validate` calls and `workspace.launch`/`platform.manage_infra` permission gates;
- user-plus-organization manifest lookup checks;
- legacy fixed-container lifecycle routes retained for Studio compatibility.

It does **not** yet contain:

- per-user container or scheduler creation;
- owner-scoped named volumes and a filesystem containment boundary;
- durable workspace metadata;
- workspace lifecycle state persistence or recovery;
- workspace-specific proxy routing and expiring/revocable access sessions;
- deletion cleanup for runtime, volume, network, and route state.

### Auth, gateway, workbench, and storage contracts

- `omnibioai-auth` is authoritative for token validation, revocation, user identity, organization context, and permissions. `/auth/validate` returns the numeric database identifiers in the current contract; downstream code must normalize them at the boundary.
- `omnibioai-api-gateway` propagates verified identity and organization context. A workspace API must not trust client-supplied identity or organization headers.
- `omnibioai-workbench` has IAM principal bindings and canonical Artifact/Project ownership concepts. It does not currently own the interactive workspace lifecycle.
- Workspace object attachments must call the existing authorized Artifact and Project contracts. An object ID or URI is context, never authorization.
- Storage quota settings remain `STORAGE_QUOTA_MODE=audit` and `STORAGE_QUOTA_BASELINE_VERIFIED=false`. The workspace slice must not introduce strict quota enforcement or assume the physical HDD exists.

## Required local vertical slice

The first qualified backend should be a dedicated `workspace-manager` boundary behind the existing Docker socket proxy. Its API contract is:

```text
POST   /api/workspaces
GET    /api/workspaces
GET    /api/workspaces/{workspace_uuid}
POST   /api/workspaces/{workspace_uuid}/start
POST   /api/workspaces/{workspace_uuid}/stop
PATCH  /api/workspaces/{workspace_uuid}/resources
DELETE /api/workspaces/{workspace_uuid}
POST   /api/workspaces/{workspace_uuid}/sessions
DELETE /api/workspaces/{workspace_uuid}/sessions/{session_id}
```

Every handler must first validate the bearer token with IAM and derive `(user_id, organization_id)` from that response. Every lookup must include both owner dimensions, so an unknown, cross-user, or cross-organization UUID returns the same `404` shape. Client-supplied container names, host paths, Docker arguments, devices, capabilities, privileged flags, and identity fields are rejected.

The persisted record must include:

```text
workspace_uuid, owner_user_id, organization_id, project_id?, profile_id,
environment_type, requested_cpu, requested_memory_bytes, requested_gpu,
architecture, backend, runtime_id, volume_name, network_name, state,
state_reason, created_at, updated_at, deleted_at?, revision
```

The Docker implementation must create names from a server-generated UUID, for example `obws-{uuid}`, and use one owner-scoped named volume and one owner-scoped network per workspace. The runtime must be non-root where the selected image supports it, must not receive the Docker socket, must not mount a shared host directory, and must receive only the workspace volume at its fixed in-container working directory. GPU requests are zero unless an operator policy and the selected image/backend explicitly qualify them.

Resource changes use this state machine:

```text
stopped --PATCH resources--> stopped (update/recreate, then persist)
running --PATCH resources--> 409 with
  "Stop this workspace to change its CPU or memory allocation."
running --stop--------------> stopping -> stopped
stopped --start-------------> starting -> running
any failure------------------> failed (retain reason and audit event)
```

The manager must apply Docker `NanoCpus`, `Memory`, and only policy-approved device requests before starting the runtime. A successful API response must be based on inspected runtime state and actual allocation, not on the presence of the legacy shared service.

## Backend adapter contract

The manager should depend on an adapter with these operations:

```text
create(spec, owner) -> runtime_id, endpoint, allocation
inspect(runtime_id) -> state, allocation, image architecture
start(runtime_id)
stop(runtime_id)
recreate(runtime_id, allocation)
remove(runtime_id)
open_session(runtime_id, expiry, owner)
revoke_session(session_id)
```

Only `LocalDockerBackend` is in scope for the first end-to-end qualification. Kubernetes, Slurm, and cloud adapters should implement the same contract later, but are not implemented or claimed here. Images must be selected from operator configuration and qualify for the requested `amd64` or `arm64` architecture before creation.

## Workspace proxy contract

The static `/jupyter`, `/rstudio`, and `/vscode` routes cannot provide this boundary. The proxy must resolve a route from `(workspace_uuid, session_token)` to the manager's runtime endpoint, verify an unexpired session bound to the authenticated owner and organization, and deny:

- a guessed UUID;
- a valid session for another workspace;
- a session from another user or organization;
- an expired or revoked session;
- direct access to container names or host ports.

The route must never expose the Docker socket, runtime management endpoint, or a shared host directory to the workspace process.

## Studio UX changes required after the API exists

The existing Code entry should become `My Workspaces`, with the following server-backed flow:

1. Create Workspace
2. Choose Profile
3. Select JupyterLab, RStudio, VS Code, or Terminal
4. Configure CPU, memory, optional GPU, and architecture
5. Attach authorized Artifacts and Project context
6. Review and Launch
7. Stop, Resume, Change resources while stopped, or Delete

The UI must display the manager's state (`Creating`, `Starting`, `Running`, `Stopping`, `Stopped`, `Failed`) and inspected allocations. It must not infer `Running` from the legacy service health endpoint. The allocation warning becomes contextual: `Stop this workspace to change its CPU or memory allocation.`

## Test qualification matrix

| Test | Current result | Required qualification |
|---|---|---|
| Two users launch separate workspaces | FAIL: fixed shared containers | Two UUIDs, runtimes, volumes, networks, and routes |
| Same user creates multiple workspaces | FAIL: process-local manifest only; no runtime allocation | Independent persisted records and runtimes |
| Cross-user access denial | PARTIAL: manifest lookup checks owner/org | Runtime and proxy checks must also be owner/org scoped |
| Cross-organization isolation | PARTIAL: manifest lookup checks owner/org | Creation, route, object attachment, and cleanup checks |
| Workspace-specific proxy routing | FAIL: static routes | Expiring, revocable, workspace-bound sessions |
| CPU and memory enforcement | PARTIAL: fixed-container update path | Create/recreate per-workspace runtime and inspect actual limits |
| Running resource-change denial | PASS for shared-container path | Preserve for per-workspace path with safe stop/recreate |
| Stopped resource-change workflow | FAIL: no per-workspace runtime | Stop, update/recreate, inspect, persist, resume |
| Restart and persistence | FAIL: manifest is in-memory | Durable metadata and runtime reconciliation |
| Concurrent launch capacity | FAIL: no per-user creation path | Capacity policy, queueing, and atomic allocation |
| Container failure recovery | FAIL | Reconcile `failed` state and preserve volume |
| IAM revocation | PARTIAL: request-time validation exists | Revoke sessions and deny future lifecycle/proxy access |
| Deletion and cleanup | FAIL | Remove runtime, network, volume, route, and metadata safely |
| Architecture compatibility | PARTIAL: image inspection exists | Validate created runtime image and backend placement |
| Existing shared workspace regression | PASS only for legacy compatibility routes | Keep legacy path explicitly admin-only and non-workspace |

## Requested report fields

WORKSPACE_MANAGER=The disposable `workspace-manager/` is a qualified local slice only; the deployed `omnibioai-launcher` remains a shared-container controller and must own the production implementation.

IAM_OWNERSHIP=PARTIAL. IAM validation and permission checks exist; owner and organization checks exist for manifests. They are not yet applied to runtime IDs, proxy sessions, durable records, and cleanup because those resources do not exist.

PERSISTENCE=PARTIAL. The disposable slice persists owner-scoped records atomically in a `0600` JSON store; the deployed Launcher still uses its process-local JavaScript `Map`.

LOCAL_DOCKER_BACKEND=PARTIAL. The disposable manager created and cleaned real per-user ARM64 Jupyter runtimes, volumes, and networks with inspected CPU/memory limits. Production qualification remains blocked by the existing socket proxy and the isolated manager-process loopback reset.

PER_USER_ISOLATION=PARTIAL. The disposable slice creates UUID-derived containers, named volumes, separate networks, and non-root runtimes with no socket mount; Studio and deployed Launcher still retain the fixed shared topology.

RESOURCE_ENFORCEMENT=PASS for the disposable local slice; PARTIAL overall. Actual Docker limits were inspected and running changes were denied; production proxy/Launcher integration remains incomplete.

WORKSPACE_PROXY=PARTIAL. The manager has owner-bound expiring session routing and cross-user denial; owner-success upstream routing was not qualified because the isolated loopback transport resets, and Studio/nginx integration is not wired.

JUPYTERLAB=PARTIAL. Two isolated ARM64 Jupyter runtimes qualified in disposable Docker; Studio still opens the shared service.

RSTUDIO=PARTIAL. Existing shared service only; no isolated runtime qualification.

VSCODE=PARTIAL. Existing shared service only; no isolated runtime qualification.

TERMINAL=PARTIAL. It aliases the shared VS Code Server integrated terminal and is not an isolated terminal runtime.

MULTI_USER_E2E=PARTIAL. Real two-user disposable Docker creation, resource inspection, denial, lifecycle, and cleanup passed. Owner-success proxy and Studio integration remain unqualified.

SECURITY_TESTS=PARTIAL. Existing Launcher security tests remain passing by audit, and the live test verifies IAM owner scoping, cross-user denial, non-privileged runtimes, no socket mount, and actual limits. Proxy owner-success and session expiry/revocation still need qualification.

REGRESSION_TESTS=PASS for the disposable manager test and read-only shared-service audit; existing Studio services were not restarted or modified. Full Studio regression remains blocked on integration wiring.

ROOT_CAUSE_SHARED_CONTAINER=The legacy Launcher owns three Compose services with hard-coded container names, host ports, shared host mounts, and static proxy routes. The v1 API added identity and validation around that topology but did not replace the topology.

REMAINING_BLOCKERS=Move the manager into the Launcher service boundary; provide a separate constrained Docker proxy that securely authorizes per-workspace network/volume lifecycle operations without weakening the shared proxy; resolve the isolated host-process loopback reset and qualify owner-success proxy routing; add durable restart recovery, session revocation, concurrent-capacity, failure-recovery, architecture, and IAM-revocation tests; integrate Artifact/Project authorization; preserve shared legacy routes; and wire Studio Code to the new API without restarting shared services.

WORKTREE_CLEAN=YES in the isolated clone at `/private/tmp/omnibioai-per-user-workspace-isolation-v1`; the source checkout contains only the mirrored deliverable plus its pre-existing `omnibioai-cli/` change.

PUSH_PERFORMED=NO  
DEPLOYMENT_PERFORMED=NO

## Workspace Manager Proxy Transport V2 qualification

This scoped follow-up was run from the independent clone at
`/private/tmp/omnibioai-per-user-workspace-isolation-v1`, based on `8d8293b`.

### Confirmed transport root cause

The `UND_ERR_SOCKET`/`ECONNRESET` symptom was a readiness race. Docker's
published port accepted TCP before JupyterLab had finished starting its HTTP
server. Direct probes performed after startup succeeded, while the manager's
immediate request reset. The manager now waits for an authenticated `/lab`
HTTP response, rather than treating a TCP connect as readiness. The proxy uses
server-resolved host/port metadata, `fetch` plus `Readable.fromWeb()` for
GET/HEAD response streaming, and a bounded request timeout. Public upstream
errors remain sanitized as 502 responses.

### Routing and WebSocket boundary

HTTP and WebSocket routes validate IAM, owner organization/user, workspace
state, and an expiring workspace-bound session before contacting Jupyter.
Clients cannot supply an upstream URL, container ID, host, or port. The
WebSocket upgrade forwards only the required upgrade headers and the manager's
server-generated Jupyter token; IAM bearer tokens and browser cookies are not
forwarded. The raw WebSocket transport was qualified against a live Jupyter
kernel channel, including a ping/pong exchange and cross-user upgrade denial.

### Control-plane boundary and limitation

The test runs the manager as a private, disposable trusted control-plane
container with a loopback-only published manager port. Workspace containers
receive neither the Docker socket nor control-plane access. The manager API has
no arbitrary Docker-path passthrough: image, container configuration, names,
labels, volume, network, mounts, and resource requests are server-derived.
Every inspected or deleted resource must have the expected UUID-derived name
and ownership labels. Host mounts, privileged mode, host networking, devices,
GPU requests, and user-selected images are rejected by the fixed runtime
configuration.

This is not a claim that a generic Docker socket mount is a complete tenant
boundary. The shared OmniBioAI socket proxy remains unchanged and still denies
`POST /networks/create` and `POST /volumes/create`. A production deployment
requires a separate private control-plane sidecar/proxy that authenticates the
manager and enforces the same operation and managed-label allowlist at the
Docker API boundary. It must not be exposed to Studio browsers or workspace
containers. That deployment was not attached to the live stack.

### V2 runtime evidence

Commands executed in the isolated clone:

```text
node --check server.js
npm test
  1 passed, 0 failed — real two-owner Docker lifecycle/resource regression
npm run test:transport
  1 passed, 0 failed — containerized manager, two live Jupyter runtimes,
  authorized HTTP, request body/status propagation, proxied kernel listing,
  WebSocket kernel-channel ping/pong, cross-user HTTP/WS denial, cleanup
```

The Docker engine was 29.8.1 on ARM64. Existing shared services remained at
44 running containers before and after qualification; no shared container was
restarted or reconfigured. Disposable `obws-*` containers, networks, and
volumes were removed and verified absent after each run. Pytest was not
available in the environment, so no pytest count is claimed.

Streaming is implemented without buffering GET/HEAD response bodies, and the
live kernel-list response was exercised through the manager. Chunked,
long-running, cancellation, and upstream-disconnect stress cases remain
unqualified; WebSocket reconnect and full Studio/Launcher routing remain
outside this workstream.

## Safety record

- No shared Studio service was started, stopped, restarted, or recreated.
- No storage data, quota mode, or Storage P0 integration branch was changed.
- No Docker socket was exposed to a workspace container.
- No production deployment or push was performed.
- The repository's `.git` directory was not writable for linked-worktree registration, so the work was performed in an independent local clone under `/private/tmp` rather than a registered linked worktree.

## Workspace Control Plane Production Readiness V1

### Implementation boundary

The workspace manager now supports an optional private control-plane URL. When
`CONTROL_PLANE_URL` is configured, it does not open the Docker socket; it
sends only fixed, signed requests to `control-plane.js`. The control plane
exposes `healthz` plus nine fixed workspace operations: image architecture,
inspect, create volume/network/container, start, stop, update, and remove.
There is no raw Docker path or caller-selected Docker resource endpoint.

Requests use an HMAC-SHA256 service credential, service identity, timestamp,
random nonce, and correlation ID. Timestamps have a 30-second skew window and
nonces are single-use. The credential is injected through the environment in
the disposable deployment definition; it is not in source or browser traffic.
The authenticated service is the workspace manager, while end-user ownership
continues to derive from IAM claims at the manager boundary. The control plane
validates the manager-provided immutable workspace UUID and owner/org shape,
and the Docker adapter validates deterministic names and labels before every
mutation. Labels are supporting metadata; the manager's durable registry and
service authentication are the authorization boundary.

`Dockerfile.control-plane` and `docker-compose.control-plane.test.yml` define
a private, internal-only, resource-limited control-plane service with a health
check and no published port. The compose file is configuration-only and was
not attached to the live stack. The disposable qualification used an
equivalent isolated Docker network, a private control-plane container, and a
manager container with no Docker socket mount. The control-plane socket is
still a host-equivalent privilege boundary: a compromise of that service can
act on Docker, so production deployment requires host hardening, secret
rotation, image signing/scanning, restricted service identity, and audit
collection. A read-only socket bind does not reduce Docker API authority.

### Threat model coverage

| Threat | Mitigation | Evidence |
|---|---|---|
| Unauthenticated or replayed control-plane request | HMAC service identity, timestamp, single-use nonce | Unit test: auth, replay, wrong identity, stale timestamp |
| Cross-user/org workspace access | IAM-derived owner key, workspace-bound sessions, hidden 404 | Live two-user and cross-organization transport test |
| Forged labels/unmanaged resources | Durable manager record plus deterministic names and label checks | Docker adapter checks; unmanaged operation API is not exposed |
| Arbitrary Docker API, privileged mode, host mount/socket, host network | Fixed operation map and fixed runtime HostConfig | Runtime inspection and fixed-operation unit test |
| SSRF/arbitrary upstream | Server-resolved host/port and path-only proxying | Live authorized/denied routing test |
| Resource exhaustion | CPU/memory ceilings and Docker-enforced limits | Live Docker inspection |
| Stale/replayed sessions | Expiring workspace-bound session and fresh auth per upgrade | Live ownership tests; reconnect uses a new handshake |
| Orphan cleanup/restart | Durable state and reconciliation, explicit exact-name cleanup | Lifecycle restart test and disposable inventory checks |
| Audit leakage | Structured operation outcome/correlation logs without tokens or bodies | Control-plane implementation review |

Concurrent lifecycle serialization, service credential rotation, JWT audience
validation, full administrator policy, persistent audit sink, and deletion
retention policy remain deployment requirements. The current local adapter
deletes the workspace volume as part of explicit workspace deletion, matching
the existing disposable-slice contract; a production retention/data-delete
policy must be selected before user data is exposed.

### V1 qualification evidence

Baseline commit: `275351f`. Final qualification used Docker Engine 29.8.1,
ARM64, and the current live shared-container inventory. The manager-to-control-
plane test used two IAM identities plus a third identity in another
organization, two isolated workspaces, separate containers/volumes/networks,
actual CPU/memory limits, owner HTTP, WebSocket ping/pong, authorized
WebSocket reconnect, cross-user/org denial, unauthenticated denial, and exact
resource cleanup. Existing shared services were not restarted or changed.

Commands:

```text
npm test
  3 passed, 0 failed
npm run test:transport
  1 passed, 0 failed
docker compose -f docker-compose.control-plane.test.yml config
  configuration validation only; no service started
```

The transport test is real Docker and real service authentication; the
workspace manager container has no `/var/run/docker.sock`. Chunked or
long-running streaming, client cancellation, upstream disconnect recovery,
concurrent lifecycle races, and production deployment of the sidecar remain
unqualified. Therefore this workstream remains `PARTIAL`.

## Workspace Control Plane Final Qualification V1

The final qualification added explicit HMAC key IDs with active/previous-key
rotation overlap, persistent sanitized JSONL audit events, and separate
runtime deletion from persistent-data deletion. Workspace deletion retains
the volume by default; `purge_data: true` is the explicit destructive path.

Real Docker evidence included:

```text
npm test
  3 passed, 0 failed — lifecycle and HMAC/replay/rotation tests
npm run test:transport
  1 passed, 0 failed — private manager/control-plane network, HTTP,
  WebSocket/reconnect, cross-user/org denial, unmanaged inspect/remove denial,
  audit persistence, retained volume, explicit purge, cleanup
docker compose -f docker-compose.control-plane.test.yml config --quiet
  passed — configuration validation only
```

The current inventory remained 44 shared containers before and after. No
shared container was restarted, stopped, recreated, or reconfigured. No
`obws-*` disposable resource remained after cleanup.

Still unqualified are delayed/chunked/binary long-running streaming with
bounded-memory/backpressure measurements, cancellation during an active
stream, upstream disconnect recovery, concurrent lifecycle races, Docker API
partial-failure injection, and a complete manager-plus-control-plane Compose
lifecycle run. The isolated Docker-network test is not claimed as full
Compose operational acceptance. Production key storage/rotation persistence,
centralized audit retention/alerting, and backup/recovery remain operational
requirements. No production deployment or Studio/Launcher integration was
performed.
