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

WORKSPACE_MANAGER=Existing `omnibioai-launcher` is the current manager boundary, but its v1 workspace API is still a shared-container controller. A new per-workspace manager or a replacement implementation in that repository is required.

IAM_OWNERSHIP=PARTIAL. IAM validation and permission checks exist; owner and organization checks exist for manifests. They are not yet applied to runtime IDs, proxy sessions, durable records, and cleanup because those resources do not exist.

PERSISTENCE=FAIL. Workspace manifests are stored in a process-local JavaScript `Map` and are lost on restart.

LOCAL_DOCKER_BACKEND=NOT QUALIFIED. The existing path inspects/updates/starts fixed containers. It has not qualified per-user Docker create, named volumes, networks, failure recovery, cleanup, or concurrent launch behavior.

PER_USER_ISOLATION=FAIL. Fixed container names, fixed ports, shared host mounts, and static routes remain.

RESOURCE_ENFORCEMENT=PARTIAL. Server-side CPU/memory bounds, Docker update translation, architecture inspection, and explicit GPU checks exist. They apply to shared containers and do not yet implement per-workspace create/recreate semantics.

WORKSPACE_PROXY=FAIL. Static reverse-proxy routes are not workspace/session scoped.

JUPYTERLAB=PARTIAL. Existing shared service only; no isolated runtime qualification.

RSTUDIO=PARTIAL. Existing shared service only; no isolated runtime qualification.

VSCODE=PARTIAL. Existing shared service only; no isolated runtime qualification.

TERMINAL=PARTIAL. It aliases the shared VS Code Server integrated terminal and is not an isolated terminal runtime.

MULTI_USER_E2E=FAIL. Not run because the required backend is not implemented and the safety request forbids restarting shared Studio services.

SECURITY_TESTS=PARTIAL. Existing launcher unit tests cover IAM fail-closed behavior, owner/org manifest lookup, request validation, image architecture, GPU inspection, and resource translation. They do not cover per-workspace Docker or proxy isolation.

REGRESSION_TESTS=PASS for the read-only audit; existing Studio tests were not modified or run against live shared services. Full qualification remains blocked on the new backend.

ROOT_CAUSE_SHARED_CONTAINER=The legacy Launcher owns three Compose services with hard-coded container names, host ports, shared host mounts, and static proxy routes. The v1 API added identity and validation around that topology but did not replace the topology.

REMAINING_BLOCKERS=Implement and wire the durable per-workspace manager in `omnibioai-launcher`; extend the socket proxy allowlist with a constrained create/inspect/start/stop/update/remove policy; add workspace-scoped proxy/session routing; integrate authorized Artifact/Project attachment contracts; add disposable Docker integration tests; and only then replace the Studio Code UI's legacy shared-service flow.

WORKTREE_CLEAN=YES in the isolated clone at `/private/tmp/omnibioai-per-user-workspace-isolation-v1`; the source checkout contains only the mirrored deliverable plus its pre-existing `omnibioai-cli/` change.

PUSH_PERFORMED=NO  
DEPLOYMENT_PERFORMED=NO

## Safety record

- No shared Studio service was started, stopped, restarted, or recreated.
- No storage data, quota mode, or Storage P0 integration branch was changed.
- No Docker socket was exposed to a workspace container.
- No production deployment or push was performed.
- The repository's `.git` directory was not writable for linked-worktree registration, so the work was performed in an independent local clone under `/private/tmp` rather than a registered linked worktree.
