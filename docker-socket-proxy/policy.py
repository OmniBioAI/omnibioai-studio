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
"""
from __future__ import annotations

import json
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
    if host_path in _DENIED_BIND_EXACT:
        return False
    normalized = host_path.rstrip("/") or "/"
    if normalized == "/":
        return False
    for prefix in allowed_prefixes:
        prefix_norm = prefix.rstrip("/")
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
        src = m.get("Source", "")
        if not _path_is_allowed(src, policy.allowed_bind_prefixes):
            return Decision.deny(
                f"mount source '{src}' is outside the allowed prefixes {policy.allowed_bind_prefixes}"
            )

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
