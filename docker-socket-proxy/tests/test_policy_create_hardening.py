"""
Create-body hardening: VolumesFrom, NetworkMode=container:/named networks,
create-time network attachment, Sysctls, CgroupnsMode=host, and binds that
are or resolve to a Docker/containerd socket.

None of the shared proxy's clients (launcher, control-center, workbench,
celery-worker, tes) uses any of these: checked against their code and every
container on the DGX (2026-11-02). The "still allowed" cases encode what they
do send: the default bridge, --network=none, and plain binds under the
allowed prefixes (including data/work, which is itself a symlink to the NAS).
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from policy import CreatePolicy, evaluate_request  # noqa: E402

PREFIXES = ("/data/work", "/data", "/usr/bin/docker", "/run/munge/munge.socket.2", "/var/lib/singularity")


def _resolver(links):
    """Fake host filesystem: exact-path symlinks, everything else unchanged."""
    return lambda path: links.get(os.path.normpath(path), os.path.normpath(path))


POLICY = CreatePolicy(allowed_bind_prefixes=PREFIXES, resolve_path=_resolver({}))


def create(host_config=None, networking=None, policy=POLICY, name=None):
    body = {"Image": "alpine", "HostConfig": host_config or {}}
    if networking is not None:
        body["NetworkingConfig"] = networking
    path = "/v1.43/containers/create" + (f"?name={name}" if name else "")
    return evaluate_request("POST", path, json.dumps(body).encode(), policy)


def denied(decision, fragment):
    assert not decision.allowed, "expected a deny"
    assert fragment.lower() in decision.reason.lower(), decision.reason


# --- VolumesFrom -------------------------------------------------------------

def test_volumes_from_another_container_is_denied():
    denied(create({"VolumesFrom": ["omnibioai-jupyter"]}), "VolumesFrom")


def test_volumes_from_read_only_is_still_denied():
    denied(create({"VolumesFrom": ["omnibioai-jupyter:ro"]}), "VolumesFrom")


def test_empty_volumes_from_is_allowed():
    assert create({"VolumesFrom": []}).allowed


# --- NetworkMode -------------------------------------------------------------

def test_network_mode_container_is_denied():
    denied(create({"NetworkMode": "container:omnibioai-studio-nginx-router-1"}), "container")


def test_network_mode_container_is_denied_case_insensitively():
    denied(create({"NetworkMode": "Container:abc123"}), "container")


def test_named_network_is_denied():
    denied(create({"NetworkMode": "omnibioai-studio_default"}), "NetworkMode")


def test_ide_network_is_denied():
    denied(create({"NetworkMode": "ide"}), "NetworkMode")


def test_host_network_is_still_denied():
    denied(create({"NetworkMode": "host"}), "host")


def test_default_bridge_and_none_are_allowed():
    for mode in ("", "default", "bridge", "none", "NONE"):
        assert create({"NetworkMode": mode}).allowed, mode


# --- Network attachment at create time --------------------------------------

def test_endpoints_config_for_another_network_is_denied():
    denied(create({}, {"EndpointsConfig": {"omnibioai-studio_default": {}}}), "attaching network")


def test_endpoints_config_mixing_default_and_another_network_is_denied():
    denied(create({}, {"EndpointsConfig": {"bridge": {}, "ide": {}}}), "attaching network")


def test_endpoints_config_with_alias_on_another_network_is_denied():
    denied(create({}, {"EndpointsConfig": {"wfrun-1-net": {"Aliases": ["dockerguard"]}}}), "attaching network")


def test_endpoints_config_for_default_or_none_is_allowed():
    for net in ("bridge", "default", "none"):
        assert create({"NetworkMode": net}, {"EndpointsConfig": {net: {}}}).allowed, net


def test_empty_networking_config_is_allowed():
    assert create({}, {}).allowed
    assert create({}, {"EndpointsConfig": {}}).allowed


def test_malformed_networking_config_is_denied():
    denied(create({}, ["bridge"]), "NetworkingConfig")
    denied(create({}, {"EndpointsConfig": ["bridge"]}), "EndpointsConfig")


# --- Sysctls / CgroupnsMode ---------------------------------------------------

def test_sysctls_are_denied():
    denied(create({"Sysctls": {"net.ipv4.ip_forward": "1"}}), "Sysctls")


def test_empty_sysctls_are_allowed():
    assert create({"Sysctls": {}}).allowed


def test_host_cgroup_namespace_is_denied():
    denied(create({"CgroupnsMode": "host"}), "CgroupnsMode")
    denied(create({"CgroupnsMode": "HOST"}), "CgroupnsMode")


def test_private_cgroup_namespace_is_allowed():
    assert create({"CgroupnsMode": "private"}).allowed
    assert create({"CgroupnsMode": ""}).allowed


# --- Daemon sockets (Binds and Mounts) ---------------------------------------

def test_docker_socket_bind_is_denied_even_if_a_prefix_would_allow_it():
    permissive = CreatePolicy(allowed_bind_prefixes=("/var/run", "/run"), resolve_path=_resolver({}))
    denied(create({"Binds": ["/var/run/docker.sock:/var/run/docker.sock"]}, policy=permissive), "socket")
    denied(create({"Binds": ["/run/docker.sock:/s:ro"]}, policy=permissive), "socket")


def test_containerd_and_podman_sockets_are_denied():
    permissive = CreatePolicy(allowed_bind_prefixes=("/run", "/var/run"), resolve_path=_resolver({}))
    denied(create({"Binds": ["/run/containerd/containerd.sock:/c"]}, policy=permissive), "socket")
    denied(create({"Binds": ["/run/podman/podman.sock:/p"]}, policy=permissive), "socket")


def test_socket_parent_directories_are_denied():
    permissive = CreatePolicy(allowed_bind_prefixes=("/run", "/var"), resolve_path=_resolver({}))
    denied(create({"Binds": ["/run:/hostrun"]}, policy=permissive), "socket")
    denied(create({"Binds": ["/var/run:/hostrun"]}, policy=permissive), "socket")


def test_daemon_state_directories_are_denied():
    permissive = CreatePolicy(allowed_bind_prefixes=("/var/lib",), resolve_path=_resolver({}))
    denied(create({"Binds": ["/var/lib/docker/volumes:/v"]}, policy=permissive), "socket")
    denied(create({"Binds": ["/var/lib/containerd:/c"]}, policy=permissive), "socket")


def test_socket_by_any_name_is_denied():
    denied(create({"Binds": ["/data/work/run1/docker.sock:/s"]}), "socket")


def test_dot_dot_to_socket_is_denied():
    permissive = CreatePolicy(allowed_bind_prefixes=("/data", "/var/run"), resolve_path=_resolver({}))
    denied(create({"Binds": ["/data/work/../../var/run/docker.sock:/s"]}, policy=permissive), "socket")


def test_socket_outside_prefixes_keeps_the_prefix_reason():
    denied(create({"Binds": ["/var/run/docker.sock:/s"]}), "outside the allowed prefixes")


def test_symlink_inside_allowed_dir_to_socket_is_denied():
    planted = CreatePolicy(
        allowed_bind_prefixes=PREFIXES,
        resolve_path=_resolver({"/data/work/evil": "/var/run/docker.sock"}),
    )
    denied(create({"Binds": ["/data/work/evil:/var/run/docker.sock"]}, policy=planted), "socket")


def test_symlinked_directory_to_run_is_denied():
    planted = CreatePolicy(
        allowed_bind_prefixes=PREFIXES,
        resolve_path=_resolver({"/data/work/hostrun": "/run"}),
    )
    denied(create({"Binds": ["/data/work/hostrun:/x:ro"]}, policy=planted), "socket")


def test_mounts_bind_to_socket_is_denied():
    permissive = CreatePolicy(allowed_bind_prefixes=("/var/run",), resolve_path=_resolver({}))
    denied(create({"Mounts": [{"Type": "bind", "Source": "/var/run/docker.sock", "Target": "/s"}]}, policy=permissive), "socket")


def test_mounts_symlink_to_socket_is_denied():
    planted = CreatePolicy(
        allowed_bind_prefixes=PREFIXES,
        resolve_path=_resolver({"/data/x": "/run/containerd/containerd.sock"}),
    )
    denied(create({"Mounts": [{"Type": "bind", "Source": "/data/x", "Target": "/s"}]}, policy=planted), "socket")


def test_real_symlink_on_disk_to_socket_is_denied(tmp_path):
    allowed = tmp_path / "work"
    allowed.mkdir()
    (allowed / "evil").symlink_to("/var/run/docker.sock")
    real = CreatePolicy(allowed_bind_prefixes=(str(allowed),))  # default resolver: os.path.realpath
    denied(create({"Binds": [f"{allowed}/evil:/var/run/docker.sock"]}, policy=real), "socket")


def test_real_symlink_on_disk_to_ordinary_dir_is_still_allowed(tmp_path):
    target = tmp_path / "nas-work"
    target.mkdir()
    allowed = tmp_path / "data"
    allowed.mkdir()
    (allowed / "work").symlink_to(target)
    real = CreatePolicy(allowed_bind_prefixes=(str(allowed),))
    assert create({"Binds": [f"{allowed}/work/run1:/work"]}, policy=real).allowed


# --- What the current clients send keeps working -------------------------------

def test_data_work_symlinked_to_nas_is_still_allowed():
    """data/work is a symlink to /mnt/nas/omnibioai/work on the DGX; the
    prefix check stays on the spelled path, the socket check sees the NAS
    target, and neither denies."""
    nas = CreatePolicy(
        allowed_bind_prefixes=PREFIXES,
        resolve_path=_resolver({"/data/work/run1": "/mnt/nas/omnibioai/work/run1"}),
    )
    assert create({"Binds": ["/data/work/run1:/work"]}, policy=nas).allowed


def test_workbench_plugin_executor_shape_is_allowed():
    """omnibioai-workbench plugins/*/executor.py: docker run --rm --network=none -v <work>:/work."""
    assert create({"NetworkMode": "none", "Binds": ["/data/work/plugin/run1:/work:rw"], "AutoRemove": True},
                  {"EndpointsConfig": {"none": {}}}).allowed


def test_tes_runner_shape_is_allowed():
    """omnibioai-tes execution/adapters/local.py: no --network (default bridge), tool binds."""
    assert create({
        "Binds": [
            "/data/work/tes/run1:/data/work/tes/run1",
            "/usr/bin/docker:/usr/bin/docker:ro",
            "/run/munge/munge.socket.2:/run/munge/munge.socket.2",
            "/var/lib/singularity:/var/lib/singularity",
        ],
    }).allowed


def test_periodic_redis_safety_test_shape_is_allowed():
    """omnibioai-security-audit tests/test_redis_acl_safety.py, run every 6 h:
    docker run -d --rm --name p15-safety-test-<hex> -p 127.0.0.1::6379 redis:7-alpine."""
    assert create({"AutoRemove": True, "PortBindings": {"6379/tcp": [{"HostIp": "127.0.0.1", "HostPort": ""}]}},
                  name="p15-safety-test-abcd1234").allowed
