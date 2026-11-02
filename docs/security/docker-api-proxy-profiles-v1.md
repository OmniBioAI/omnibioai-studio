# Docker API proxy profiles v1: taking the raw socket away from workflow-bundles

Status: **design, not implemented**. Part 1 of the passwordless-IDE work
(Studio #224 "Phase 2"). Parts 2 (IDE network isolation) and 3 (RStudio and
code-server auth off) are blocked on this. Parts 2 and 3 stay blocked until
this design is deployed on the DGX and a real Nextflow run has passed through
it.

## Why

Passwordless IDEs are only safe if nothing but `nginx-router` can reach
`jupyter:8888`, `rstudio:8787` and `vscode:8080`. Network isolation alone is
not enough while any container can drive the Docker API without limits:

- `POST /containers/{router}/exec` runs code inside the router, which can
  reach the IDEs.
- `POST /networks/ide/connect`, or a create with `NetworkMode=container:<router>`
  or `EndpointsConfig: {ide: {}}`, puts a new container on the IDE network.
- A create with `VolumesFrom: [omnibioai-jupyter]` mounts the IDE homes.
- Bind-mounting the host's `/var/run/docker.sock` regains all of the above.

Today `workflow-bundles` holds the raw `/var/run/docker.sock` read-write. It
also passes the socket on to every per-run `wfrun-*-guard` sidecar it starts
(`omnibioai-workflow-bundles/api/execution_guard/lifecycle.py`, `start()`:
`-v /var/run/docker.sock:/var/run/docker.sock`).

## What the existing proxy enforces (measured 2026-11-02)

`docker-socket-proxy/` is a custom Python proxy that inspects request bodies:
`policy.evaluate_request()` validates `POST /containers/create`. Measured by
calling `evaluate_request()` directly, with allowed prefixes
`/data/bundles, /data/runs, /data/nxf, /usr/bin/docker`:

| Request | Result |
|---|---|
| `Privileged`, `CapAdd`, `NetworkMode=host`, `PidMode=host`, `IpcMode=host`, `Devices`, `SecurityOpt`, `UsernsMode=host` | denied |
| bind outside allowed prefixes (`/etc`, `/var/run/docker.sock`); `Mounts` bind to the socket | denied, but only because `/var/run` isn't in the prefixes. There is no explicit socket deny |
| create with any `?name=` | **allowed**: no name scoping |
| `POST /containers/omnibioai-rstudio/stop`, `DELETE /containers/omnibioai-studio-nginx-router-1`, `GET /containers/omnibioai-jupyter/json` | **allowed**: per-container ops work on any container. Inspect returns its env |
| `VolumesFrom: [omnibioai-jupyter]` | **allowed** |
| `NetworkMode=container:omnibioai-studio-nginx-router-1` | **allowed** |
| `NetworkMode=omnibioai-studio_default`, `EndpointsConfig` to another network | **allowed** |
| `DeviceRequests` (GPU), `CgroupnsMode=host`, `Sysctls` | **allowed** |
| `/networks/*`, `/exec` | denied (workflow-bundles needs some of these) |

The per-run guard (`execution_guard/policy.py`) is stricter on several fields
(it blanks `CgroupnsMode`, `DeviceRequests`, `UTSMode` and others). But it
forbids only `NetworkMode=host`, so `container:<x>` or a named network is
accepted.

All five current clients of the shared proxy (launcher, control-center,
workbench, celery-worker, tes) can use the **allowed** rows today. This design
therefore hardens the shared proxy too, not just the new instance.

## Option considered: OPA Docker authorization plugin

`opa-docker-authz` runs inside dockerd and sees every API call from every
client: compose, the host admin, cadvisor and the proxies. Rejected for now:

- It needs a daemon config change and a dockerd restart (stack-wide blast
  radius).
- A policy bug would block host administration itself.
- The plugin sees requests, not identities. With unix-socket clients it can't
  tell workflow-bundles from compose, so name scoping per client is still
  impossible.

The custom proxy already exists, has unit and live-integration tests
(`docker-socket-proxy/tests/`), and gives per-client scoping through separate
listening sockets.

## Design

### One proxy image, policy profiles, one instance per client class
A unix socket carries no client identity, so a client's identity is the socket
it can reach. `PROXY_PROFILE` selects the policy:

| Instance | Socket (named volume, mounted `:ro` by clients) | Clients | Profile |
|---|---|---|---|
| `docker-socket-proxy` (existing) | `docker-proxy-socket` | launcher, control-center, workbench, celery-worker, tes | `shared` (hardened, below) |
| `wfb-docker-proxy` (new) | `wfb-docker-proxy-socket` | workflow-bundles, its `wfrun-*-guard` sidecars | `workflow-bundles` |

Only the proxy containers mount `/var/run/docker.sock`, as `docker-real.sock`.
No other service mounts it.

### Hardening common to every profile (`check_create_body`)
- **Deny** `VolumesFrom`, `CgroupnsMode=host`, `UTSMode=host`, `Sysctls`,
  `DeviceRequests` (unless the profile allows GPUs; none does today), `Links`,
  `PublishAllPorts`, and `PortBindings` on a `0.0.0.0` host IP.
- **`NetworkMode`:** only `""`, `default`, `bridge`, `none`, or a network the
  profile allows by name. **Deny `container:*`** and every other named network.
- **`NetworkingConfig.EndpointsConfig`:** the same network allowlist.
- **Explicit socket deny:** any bind or `Mounts` source whose realpath ends in
  `docker.sock`, `containerd.sock` or `podman.sock`, or is under `/run/containerd`,
  `/var/lib/docker` or `/var/lib/containerd`, regardless of the prefixes.
- **Bind realpath:** resolve symlinks before the prefix check. The guard already
  does this; the shared proxy normalises, but doesn't resolve.

### Name scoping (both profiles)
- **On create:** `?name=` is required and must match the profile's pattern.
- **On every container-scoped op** (`json`, `logs`, `start`, `stop`, `kill`,
  `wait`, `attach`, `DELETE`, and the profile's `exec` if any): the proxy
  resolves the id or name to the container's name with one upstream
  `GET /containers/{id}/json`, cached briefly, and checks the pattern.
  `GET /containers/json` results are filtered to matching names.
- **Patterns:**
  - `shared`: the launcher's IDE containers (`omnibioai-jupyter`,
    `omnibioai-rstudio`, `omnibioai-vscode`, only `json`/`start`/`stop`), plus
    the exact names workbench, celery-worker and tes create. That inventory is
    the first task of the implementation session.
  - `workflow-bundles`: `^wfrun-[A-Za-z0-9-]+-(guard|runner)$` and `^nxf-[A-Za-z0-9]+$`.

### `workflow-bundles` profile: allowed endpoints
Measured from `lifecycle.py` and `server.py`; Nextflow's calls go through the guard.

| Endpoint | Scope |
|---|---|
| `GET /_ping`, `/version`, `/info` | none |
| `POST /networks/create` | body `Name` must match `^wfrun-[A-Za-z0-9-]+-net$`, `Driver` = `bridge`, `Internal` allowed, no `Options`/`IPAM` overrides |
| `GET /networks`, `GET /networks/{id}`, `DELETE /networks/{id}` | names matching `wfrun-*-net` only |
| `POST /networks/{id}/connect`, `/disconnect` | **denied** (create-time attach only) |
| `POST /containers/create` | name pattern above; `NetworkMode`/`EndpointsConfig` limited to `wfrun-*-net`; binds limited to bundle, run and `nxf_home` roots, `/usr/bin/docker:ro`, and the named volume `wfb-docker-proxy-socket:ro` (guard only); all common denies |
| `GET/POST/DELETE /containers/{id}/...` (json, logs, start, stop, kill, wait, attach, delete) | name pattern above |
| `GET /containers/json` | filtered to the name pattern |
| `GET /images/json`, `GET /images/{name}/json`, `POST /images/create` (pull) | any image (bundles pull many tool images) |
| `exec` | **denied**. The guard readiness probe moves to a container `HEALTHCHECK` polled through `GET /containers/{id}/json` |

### workflow-bundles code changes
1. `lifecycle.start()`: the guard sidecar mounts
   `wfb-docker-proxy-socket:/var/run/upstream:ro` instead of the host socket.
   `proxy_server.py` uses it as its upstream (new env
   `EXECUTION_GUARD_UPSTREAM_SOCKET`, no default to the raw socket: it fails
   closed).
2. Readiness: `--health-cmd` (the existing `_LISTENER_PROBE`) plus polling
   `State.Health.Status`; remove the `docker exec` path.
3. The runner gets `--name wfrun-<run_id>-runner` (today it's unnamed).
4. The service's own CLI uses `DOCKER_HOST=unix:///var/run/wfb-docker-proxy.sock`.
   The raw socket mount is removed from the compose service.
5. `execution_guard/policy.py`: allow `NetworkMode` only `""`, `bridge`,
   `default`, or the run's own network; deny `container:*`; add the explicit
   socket-path deny.

### Studio changes
- `docker-socket-proxy/policy.py`: profiles, common hardening, name scoping
  (with an upstream lookup in `proxy.py`), and the network endpoints for the
  `workflow-bundles` profile.
- `docker-compose.yml`:
  - a new `wfb-docker-proxy` service (same image, `PROXY_PROFILE=workflow-bundles`,
    `PROXY_LISTEN_SOCKET` on the `wfb-docker-proxy-socket` volume, binds and
    names set from env);
  - workflow-bundles loses `/var/run/docker.sock` and mounts the new socket
    volume `:ro`;
  - the shared proxy gets `PROXY_PROFILE=shared`.
- `compose.nas-live.yml` (ecosystem): no change expected. Verify with the
  four-file config before any recreate.

## Test plan (implementation session)
1. **Unit:** every row of the table above becomes a test, in both profiles.
   Name scoping is tested with a fake upstream.
2. **Live integration:** extend `tests/test_proxy_live_integration.py`, using
   throwaway containers only. Prove a client of each profile can't:
   - stop the router;
   - inspect jupyter;
   - use `VolumesFrom` jupyter;
   - join `container:<router>` or the `ide` network;
   - bind the socket.
3. **workflow-bundles:** its unit tests, plus a dry run of `lifecycle.start/stop`
   against a throwaway `wfb-docker-proxy`.
4. **End to end on the DGX:**
   - A real Nextflow bundle run through the new chain: the runner goes through
     the guard, then `wfb-docker-proxy`, then dockerd.
   - Assert that task containers are named `nxf-*`, the run network is removed
     afterwards, and nothing mounts `/var/run/docker.sock` except the two proxy
     containers (`docker ps -q | xargs docker inspect`).
   - Also run one Snakemake bundle and one WDL bundle if any are registered.
5. Recreate order, asking before each, with `--no-deps` and the four-file set:
   1. `wfb-docker-proxy` (new);
   2. the shared `docker-socket-proxy` (hardened profile);
   3. `workflow-bundles`.

   Check each step against its clients before the next.

## Rollback
- **Per service:** restore the compose and policy files from `.pre-proxy-profiles`
  copies (checksum-guarded), then `up -d --no-deps` the affected services.
  Running workflow runs must finish or be cancelled first; the guard sidecars
  hold the old upstream.
- **Script:** `proxy-profiles-rollback.sh` in the ecosystem workspace, written
  before deploy.

## Then, and only then
- **Part 2:** the `ide` network (`nginx-router`, `jupyter`, `rstudio`, `vscode`),
  IDEs off `omnibioai-studio_default`, published IDE ports removed or bound to
  loopback (#225), and Control Center's IDE health checks moved behind
  router-only paths. Prove from tes, toolserver, workflow-bundles and
  celery-worker, and from containers they can create through their proxies,
  that `jupyter:8888`, `rstudio:8787` and `vscode:8080` are unreachable.
- **Part 3:** RStudio `DISABLE_AUTH`/`auth-none` as the `rstudio` user, keeping
  `X-RStudio-Root-Path`; code-server `--auth none`; the router gate stays;
  `RSTUDIO_PASSWORD`/`VSCODE_PASSWORD` leave every container env. Decide on
  in-container sudo first (RStudio `ROOT=TRUE`, Jupyter `GRANT_SUDO=yes`,
  code-server's passwordless sudo), since an unauthenticated IDE is root inside
  its container.
