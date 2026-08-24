"""
policy.py -- request-level allow/deny rules for the Docker socket proxy.

#265: docker.sock is RW-mounted into the workbench container (and every
service dispatching real plugin/workflow Docker jobs). Anything that can
write to it can ask the real host daemon for a --privileged container
with a host-root bind mount -- an unrestricted container-escape path for
any process running inside that container, not just the code that's
*supposed* to use docker.sock.

This module is deliberately pure: no sockets, no I/O. It answers one
question -- "is this specific request (method, path, and, for container
creation, its JSON body) allowed through to the real daemon?" -- so it
can be unit-tested exhaustively without a running Docker daemon at all.
The proxy (proxy.py) is the thin I/O layer that calls this and relays
bytes.

Design intentionally kept to what's actually needed by this codebase's
real docker.sock consumers (grepped and confirmed, see the #265 PR
description): omnibioai/plugin_executor/ml_utils.py's `docker run --rm
-v ... <image> ...` (subprocess "docker" CLI) for ~50 ML plugin
executors, and plugins/workflow_runner/views.py's own `docker run ...`
dispatch. Neither ever needs EXEC, SWARM, SECRETS, PLUGINS, NETWORKS
management, VOLUMES management, BUILD, or COMMIT -- those stay blocked
outright. Both need CONTAINERS create/start/wait/logs/stop/remove and
IMAGES read/pull -- those are allowed, but /containers/create's JSON
body is validated so it can't be used to request the exact capabilities
(--privileged, arbitrary host bind mounts, host networking, added
capabilities) that would turn "create a container" into "escape to the
host" -- the actual mechanism #265 is about, not just an API-shape
allowlist.

Two gaps were caught and closed in review, before this ever merged
(both confirmed exploitable against a real Docker daemon, not just
reasoned about):
  1. Bind-mount source validation was a naive string-prefix check --
     '/app/work/../../../etc' passes it (literally starts with the
     allowed prefix string) but the real daemon resolves '..'
     components, so the effective mount is /etc. Fixed with
     posixpath.normpath() before comparison (_path_is_allowed).
  2. HostConfig.Mounts entries weren't restricted to Type="bind" --
     Type="volume" with an inline VolumeOptions.DriverConfig can
     create an ephemeral bind-backed volume with the dangerous host
     path in DriverConfig.Options.device, not in Source, bypassing the
     Source-based check and never touching the /volumes/create
     endpoint this proxy already blocks. Fixed by requiring every
     Mounts entry to be Type="bind" (check_create_body). Devices,
     SecurityOpt (seccomp/apparmor/no-new-privileges disabling), and
     UsernsMode=host are also validated for the same reason: none of
     this codebase's real consumers need them, so blocking them costs
     no real functionality.
"""
from __future__ import annotations

import json
import posixpath
import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class Decision:
    allowed: bool
    reason: str = ""

    @staticmethod
    def allow() -> "Decision":
        return Decision(True, "")

    @staticmethod
    def deny(reason: str) -> "Decision":
        return Decision(False, reason)


# ---------------------------------------------------------------------------
# Endpoint allowlist
# ---------------------------------------------------------------------------
# (method, compiled path regex) pairs. The Docker Engine API is versioned
# via an optional /vX.YZ prefix (e.g. /v1.43/containers/json) -- the
# real `docker` CLI always sends one. Patterns tolerate an optional
# version prefix so either form matches.

_V = r"(?:/v[0-9]+\.[0-9]+)?"

_ALLOWED_ENDPOINTS = [
    ("GET",    re.compile(rf"^{_V}/_ping$")),
    ("HEAD",   re.compile(rf"^{_V}/_ping$")),
    ("GET",    re.compile(rf"^{_V}/version$")),
    ("GET",    re.compile(rf"^{_V}/info$")),
    ("GET",    re.compile(rf"^{_V}/containers/json$")),
    ("POST",   re.compile(rf"^{_V}/containers/create$")),
    ("GET",    re.compile(rf"^{_V}/containers/[^/]+/json$")),
    ("GET",    re.compile(rf"^{_V}/containers/[^/]+/logs$")),
    ("POST",   re.compile(rf"^{_V}/containers/[^/]+/start$")),
    ("POST",   re.compile(rf"^{_V}/containers/[^/]+/stop$")),
    ("POST",   re.compile(rf"^{_V}/containers/[^/]+/kill$")),
    ("POST",   re.compile(rf"^{_V}/containers/[^/]+/wait$")),
    ("POST",   re.compile(rf"^{_V}/containers/[^/]+/attach$")),
    ("DELETE", re.compile(rf"^{_V}/containers/[^/]+$")),
    ("GET",    re.compile(rf"^{_V}/images/json$")),
    ("GET",    re.compile(rf"^{_V}/images/[^/]+/json$")),
    ("POST",   re.compile(rf"^{_V}/images/create$")),  # `docker pull`
]

# Explicitly enumerated (not just "everything else") so the deny reason
# is legible and intentional, and so a new Docker API surface added in a
# future engine version defaults to DENIED, not silently allowed.
_EXPLICITLY_DENIED_PREFIXES = [
    "/exec", "/containers/prune",
    "/networks", "/volumes", "/secrets", "/configs", "/swarm", "/services",
    "/nodes", "/plugins", "/build", "/commit", "/distribution", "/tasks",
    "/system",  # beyond /info above -- system/df, system/events, etc.
]


def _strip_version_prefix(path: str) -> str:
    return re.sub(r"^/v[0-9]+\.[0-9]+", "", path)


def check_endpoint(method: str, path: str) -> Decision:
    method = method.upper()
    path = path.split("?", 1)[0]  # ignore query string for matching

    bare = _strip_version_prefix(path)
    for prefix in _EXPLICITLY_DENIED_PREFIXES:
        if bare == prefix or bare.startswith(prefix + "/"):
            return Decision.deny(f"endpoint '{method} {path}' is not on the allowlist (explicitly denied category)")

    for allowed_method, pattern in _ALLOWED_ENDPOINTS:
        if method == allowed_method and pattern.match(path):
            return Decision.allow()

    return Decision.deny(f"endpoint '{method} {path}' is not on the allowlist")


# ---------------------------------------------------------------------------
# /containers/create body validation
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CreatePolicy:
    """Configurable so the allowed bind-mount prefixes match this
    deployment's real WORK_DIR/cache paths, not hardcoded here."""

    allowed_bind_prefixes: tuple = field(default_factory=tuple)


_DENIED_BIND_EXACT = {"/", ""}


def _bind_source(bind_entry: str) -> Optional[str]:
    """A Binds entry is 'host_path:container_path[:mode]'. Returns the
    host_path, or None if the entry doesn't parse as expected."""
    if not isinstance(bind_entry, str) or not bind_entry:
        return None
    parts = bind_entry.split(":")
    if len(parts) < 2:
        return None
    return parts[0]


def _path_is_allowed(host_path: str, allowed_prefixes: tuple) -> bool:
    """Caught in review, before this PR merged: a naive rstrip-only
    comparison passes a source like '/app/work/../../../etc' because it
    literally STARTS WITH the allowed prefix string -- but the real
    daemon (via the underlying mount(2) call) resolves '..' components
    exactly like a shell `cd` would, so the *effective* mount source is
    '/etc', well outside the allowed directory. Confirmed live: a proxy
    running the pre-fix version of this function let `docker run -v
    <allowed_dir>/../../etc:/hostetc` through, and it really did mount
    the host's real /etc. posixpath.normpath() lexically collapses '..'
    /'.'/redundant slashes (pure string manipulation, no filesystem
    access -- exactly right here, since this proxy never has the real
    host filesystem mounted to do a true realpath resolution) BEFORE the
    prefix comparison, closing that specific bypass.

    Deliberately NOT closed by this (or any purely lexical check): a
    symlink already present *inside* an allowed directory pointing
    somewhere outside it (e.g. an attacker who already has some other
    write primitive into WORK_DIR plants allowed_dir/evil -> /etc, then
    requests a bind of allowed_dir/evil). Lexical normalization can't
    see that without resolving symlinks against the real host
    filesystem, which this proxy intentionally doesn't have access to.
    That's a real, harder residual risk, not silently unclosed --
    tracked in #54 alongside this proxy's other documented gaps. For
    now it depends on the allowed directories (WORK_DIR, the ML cache
    dir, the model registry root) only ever being written to by
    trusted, first-party code, not attacker-controlled input.
    """
    if host_path in _DENIED_BIND_EXACT:
        return False
    if not host_path.startswith("/"):
        return False
    normalized = posixpath.normpath(host_path)
    if normalized == "/":
        return False
    for prefix in allowed_prefixes:
        prefix_norm = posixpath.normpath(prefix)
        if normalized == prefix_norm or normalized.startswith(prefix_norm + "/"):
            return True
    return False


def check_create_body(raw_body: bytes, policy: CreatePolicy) -> Decision:
    if not raw_body:
        return Decision.allow()  # a create call must have a body in practice; nothing to inspect

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return Decision.deny("/containers/create body is not valid JSON")

    if not isinstance(payload, dict):
        return Decision.deny("/containers/create body must be a JSON object")

    host_config = payload.get("HostConfig") or {}
    if not isinstance(host_config, dict):
        return Decision.deny("HostConfig must be an object")

    if host_config.get("Privileged"):
        return Decision.deny("Privileged containers are not allowed")

    cap_add = host_config.get("CapAdd") or []
    if cap_add:
        return Decision.deny(f"CapAdd is not allowed (requested: {cap_add})")

    network_mode = str(host_config.get("NetworkMode") or "").lower()
    if network_mode == "host":
        return Decision.deny("NetworkMode=host is not allowed")

    pid_mode = str(host_config.get("PidMode") or "").lower()
    if pid_mode == "host":
        return Decision.deny("PidMode=host is not allowed")

    ipc_mode = str(host_config.get("IpcMode") or "").lower()
    if ipc_mode == "host":
        return Decision.deny("IpcMode=host is not allowed")

    if host_config.get("Binds"):
        for entry in host_config["Binds"]:
            src = _bind_source(entry)
            if src is None:
                return Decision.deny(f"unparseable Binds entry: {entry!r}")
            if not _path_is_allowed(src, policy.allowed_bind_prefixes):
                return Decision.deny(
                    f"bind mount source '{src}' is outside the allowed prefixes {policy.allowed_bind_prefixes}"
                )

    mounts = host_config.get("Mounts") or []
    for m in mounts:
        if not isinstance(m, dict):
            return Decision.deny(f"unparseable Mounts entry: {m!r}")
        mount_type = str(m.get("Type") or "bind").lower()
        if mount_type != "bind":
            # Caught in review: Type="volume" with an inline
            # VolumeOptions.DriverConfig (Name="local", Options={type:
            # none, o: bind, device: <host_path>}) can create an
            # ephemeral bind-backed volume in a single /containers/create
            # call, entirely bypassing the /volumes/create endpoint this
            # proxy already blocks -- and the DANGEROUS host path lives
            # in DriverConfig.Options.device, not in Source, so the
            # Source-based prefix check below wouldn't even see it. In
            # practice a Source that passes the prefix check (must look
            # like an absolute path under an allowed prefix) is always
            # rejected by the real daemon anyway for Type=volume (it
            # requires Source to be a bare volume *name*, no slashes --
            # confirmed live) -- but that's the daemon's incidental
            # behavior, not a guarantee this policy should lean on.
            # ml_utils.py's real docker run never uses anything but
            # plain bind mounts, so there's no real functionality this
            # costs: every Mounts entry must be Type="bind" (or the
            # field omitted, which Docker treats as bind's default).
            return Decision.deny(f"Mounts Type={mount_type!r} is not allowed (only bind mounts are)")
        src = m.get("Source", "")
        if not _path_is_allowed(src, policy.allowed_bind_prefixes):
            return Decision.deny(
                f"mount source '{src}' is outside the allowed prefixes {policy.allowed_bind_prefixes}"
            )

    devices = host_config.get("Devices") or []
    if devices:
        return Decision.deny(f"Devices is not allowed (requested: {devices})")

    security_opt = host_config.get("SecurityOpt") or []
    for opt in security_opt:
        opt_str = str(opt).lower()
        if "seccomp=unconfined" in opt_str or "apparmor=unconfined" in opt_str or "no-new-privileges=false" in opt_str:
            return Decision.deny(f"SecurityOpt entry '{opt}' is not allowed")

    userns_mode = str(host_config.get("UsernsMode") or "").lower()
    if userns_mode == "host":
        return Decision.deny("UsernsMode=host is not allowed")

    return Decision.allow()


def evaluate_request(
    method: str,
    path: str,
    body: bytes,
    policy: CreatePolicy,
) -> Decision:
    """Single entry point the proxy calls per request."""
    endpoint_decision = check_endpoint(method, path)
    if not endpoint_decision.allowed:
        return endpoint_decision

    bare_path = _strip_version_prefix(path.split("?", 1)[0])
    if method.upper() == "POST" and bare_path == "/containers/create":
        return check_create_body(body, policy)

    return Decision.allow()
