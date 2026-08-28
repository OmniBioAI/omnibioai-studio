"""
Adversarial unit tests for policy.py -- the same rigor as #240's own
Docker-hardening adversarial proof, applied here at the socket layer.

Each "must be blocked" test encodes a real escape technique from #265's
own threat model (--privileged, host bind mounts, host networking,
capability grants, direct API access to EXEC/SWARM/SECRETS/etc.).
Each "must still work" test encodes what this codebase's real docker.sock
consumers actually send (grepped and confirmed against
omnibioai/plugin_executor/ml_utils.py's real docker run invocation).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from policy import CreatePolicy, Decision, check_create_body, check_endpoint, evaluate_request  # noqa: E402


POLICY = CreatePolicy(allowed_bind_prefixes=("/app/work", "/home/user/.cache/omnibioai"))

# #54: separate policy instance with a named-volume allowlist populated,
# for the workflow_runner nested-Docker-in-Docker tests below -- kept
# separate from POLICY (whose named-volume list is empty by default) so
# every existing test above keeps proving named volumes are denied
# unless a deployment explicitly opts a specific volume in.
NAMED_VOLUME_POLICY = CreatePolicy(
    allowed_bind_prefixes=("/app/work",),
    allowed_named_volumes=("docker-proxy-socket",),
)


def _body(d: dict) -> bytes:
    return json.dumps(d).encode()


# ---------------------------------------------------------------------------
# Endpoint allowlist
# ---------------------------------------------------------------------------

class TestEndpointAllowlist:
    def test_containers_json_allowed(self):
        assert check_endpoint("GET", "/containers/json").allowed

    def test_containers_create_allowed(self):
        assert check_endpoint("POST", "/containers/create").allowed

    def test_versioned_path_allowed(self):
        assert check_endpoint("GET", "/v1.43/containers/json").allowed

    def test_images_pull_allowed(self):
        assert check_endpoint("POST", "/images/create").allowed

    def test_container_start_stop_wait_logs_attach_allowed(self):
        for method, path in [
            ("POST", "/containers/abc123/start"),
            ("POST", "/containers/abc123/stop"),
            ("POST", "/containers/abc123/wait"),
            ("GET", "/containers/abc123/logs"),
            ("POST", "/containers/abc123/attach"),
            ("DELETE", "/containers/abc123"),
        ]:
            assert check_endpoint(method, path).allowed, f"{method} {path} should be allowed"

    def test_exec_blocked(self):
        d = check_endpoint("POST", "/containers/abc123/exec")
        assert not d.allowed

    def test_exec_start_blocked(self):
        d = check_endpoint("POST", "/exec/abc123/start")
        assert not d.allowed

    def test_swarm_blocked(self):
        assert not check_endpoint("POST", "/swarm/init").allowed

    def test_secrets_blocked(self):
        assert not check_endpoint("GET", "/secrets").allowed
        assert not check_endpoint("POST", "/secrets/create").allowed

    def test_networks_management_blocked(self):
        assert not check_endpoint("POST", "/networks/create").allowed
        assert not check_endpoint("DELETE", "/networks/abc").allowed

    def test_volumes_management_blocked(self):
        assert not check_endpoint("POST", "/volumes/create").allowed

    def test_plugins_blocked(self):
        assert not check_endpoint("GET", "/plugins").allowed

    def test_build_blocked(self):
        assert not check_endpoint("POST", "/build").allowed

    def test_nodes_blocked(self):
        assert not check_endpoint("GET", "/nodes").allowed

    def test_unknown_endpoint_defaults_denied(self):
        """A future Docker Engine API surface not on the allowlist must
        default to denied, not silently allowed."""
        assert not check_endpoint("POST", "/some/brand/new/v2/endpoint").allowed

    def test_deny_reason_is_legible(self):
        d = check_endpoint("POST", "/swarm/init")
        assert "swarm" in d.reason.lower() or "not on the allowlist" in d.reason.lower()


# ---------------------------------------------------------------------------
# /containers/create body validation -- the actual escape-vector checks
# ---------------------------------------------------------------------------

class TestPrivilegedBlocked:
    def test_privileged_true_blocked(self):
        d = check_create_body(_body({"Image": "alpine", "HostConfig": {"Privileged": True}}), POLICY)
        assert not d.allowed
        assert "privileged" in d.reason.lower()

    def test_privileged_false_allowed(self):
        d = check_create_body(_body({"Image": "alpine", "HostConfig": {"Privileged": False}}), POLICY)
        assert d.allowed

    def test_privileged_absent_allowed(self):
        d = check_create_body(_body({"Image": "alpine", "HostConfig": {}}), POLICY)
        assert d.allowed


class TestHostBindMountBlocked:
    def test_dotdot_traversal_out_of_allowed_prefix_blocked(self):
        """Caught in review, before merge: a naive string-prefix check
        lets '/app/work/../../../etc' through because it literally
        STARTS WITH the allowed prefix string -- but the real daemon
        resolves '..' components, so the effective mount source is
        '/etc'. Confirmed live against a real daemon before this fix:
        `docker run -v <allowed_dir>/../../etc:/hostetc` really did
        mount the host's real /etc."""
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Binds": ["/app/work/../../../etc:/hostetc"]
            }}), POLICY
        )
        assert not d.allowed

    def test_dotdot_traversal_stopping_exactly_at_prefix_boundary_blocked(self):
        """'/app/work/foo/../../evil' normalizes to '/app/evil' --
        outside /app/work -- must still be blocked even though the
        traversal doesn't go all the way to a well-known sensitive path."""
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Binds": ["/app/work/foo/../../evil:/x"]
            }}), POLICY
        )
        assert not d.allowed

    def test_dotdot_traversal_that_stays_inside_prefix_allowed(self):
        """Legitimate use of '..' that never actually leaves the
        allowed directory must not be penalized just for containing
        '..' syntactically."""
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Binds": ["/app/work/sub/../other:/x"]
            }}), POLICY
        )
        assert d.allowed

    def test_relative_bind_source_blocked(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"Binds": ["relative/path:/x"]}}), POLICY
        )
        assert not d.allowed

    def test_root_bind_mount_blocked(self):
        """The textbook #265 escape: -v /:/hostroot."""
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"Binds": ["/:/hostroot"]}}), POLICY
        )
        assert not d.allowed
        assert "outside the allowed prefixes" in d.reason

    def test_etc_bind_mount_blocked(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"Binds": ["/etc:/hostetc"]}}), POLICY
        )
        assert not d.allowed

    def test_home_bind_mount_blocked(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"Binds": ["/home:/hosthome"]}}), POLICY
        )
        assert not d.allowed

    def test_docker_sock_bind_mount_blocked(self):
        """Prevents the exact re-mount-docker.sock-into-a-sibling
        pattern that would hand a spawned container unrestricted socket
        access, bypassing this proxy entirely."""
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Binds": ["/var/run/docker.sock:/var/run/docker.sock"]
            }}), POLICY
        )
        assert not d.allowed

    def test_sibling_path_outside_prefix_blocked(self):
        """/app/workspace is NOT /app/work -- a naive startswith("/app/work")
        check without the trailing-slash/exact-match guard would wrongly
        allow this."""
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"Binds": ["/app/workspace_evil:/x"]}}), POLICY
        )
        assert not d.allowed

    def test_allowed_prefix_bind_mount_allowed(self):
        """This is what ml_utils.py's real docker run actually sends --
        the run's own work_dir under WORK_DIR/plugin_executor."""
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Binds": ["/app/work/plugin_executor/run-123:/work"]
            }}), POLICY
        )
        assert d.allowed

    def test_exact_prefix_dir_itself_allowed(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"Binds": ["/app/work:/work"]}}), POLICY
        )
        assert d.allowed

    def test_mounts_form_validated_same_as_binds(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Mounts": [{"Type": "bind", "Source": "/", "Target": "/hostroot"}]
            }}), POLICY
        )
        assert not d.allowed

    def test_mounts_form_allowed_prefix(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Mounts": [{"Type": "bind", "Source": "/app/work/run-1", "Target": "/work"}]
            }}), POLICY
        )
        assert d.allowed

    def test_no_binds_no_mounts_allowed(self):
        d = check_create_body(_body({"Image": "alpine", "HostConfig": {}}), POLICY)
        assert d.allowed


class TestNamedVolumeBindsAllowlist:
    """#54: workflow_runner's nested Docker-in-Docker dispatch needs its
    spawned sibling container to reach THIS proxy's own exposed socket,
    the same way its parent container already does -- via the
    'docker-proxy-socket' named volume, not a raw host path. Uses
    NAMED_VOLUME_POLICY (POLICY's own allowed_named_volumes stays empty
    throughout this file, so every test above keeps proving named
    volumes are denied by default)."""

    def test_allowlisted_named_volume_allowed(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Binds": ["docker-proxy-socket:/var/run/proxy-socket:ro"]
            }}), NAMED_VOLUME_POLICY
        )
        assert d.allowed

    def test_named_volume_not_on_allowlist_blocked(self):
        """A caller can't reach some OTHER named volume this deployment
        happens to have (e.g. mysql_data) just because docker-proxy-
        socket is allowed -- exact match, not 'any named volume'."""
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Binds": ["mysql_data:/var/lib/mysql"]
            }}), NAMED_VOLUME_POLICY
        )
        assert not d.allowed
        assert "not on the allowed volume list" in d.reason

    def test_named_volume_blocked_when_allowlist_empty(self):
        """Same source as the test above, but against POLICY (no named-
        volume allowlist configured at all) -- must still be denied,
        not fall through to "no prefixes configured means unrestricted"."""
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Binds": ["docker-proxy-socket:/var/run/proxy-socket:ro"]
            }}), POLICY
        )
        assert not d.allowed

    def test_similar_looking_volume_name_not_prefix_matched(self):
        """Exact match, not startswith -- 'docker-proxy-socket-evil' must
        not slip through as if it were the real allowlisted volume."""
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Binds": ["docker-proxy-socket-evil:/var/run/proxy-socket:ro"]
            }}), NAMED_VOLUME_POLICY
        )
        assert not d.allowed

    def test_absolute_path_source_unaffected_by_named_volume_allowlist(self):
        """A real host-path Binds entry still goes through the ordinary
        prefix check even when a named-volume allowlist is configured --
        the two checks are independent, not "either one passes"."""
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"Binds": ["/etc:/hostetc"]}}),
            NAMED_VOLUME_POLICY,
        )
        assert not d.allowed


class TestNamedVolumeMustBeReadOnly:
    """#54 follow-up: confirmed exploitable live before this check
    existed -- a plain `-v docker-proxy-socket:/x` (Docker's own rw
    default, no mode segment at all) was ALLOWED through, giving full
    read-write access to the real live socket file from a container
    spawned by an already-running, legitimately proxied container.
    Nothing legitimate ever needs to WRITE to the socket file itself,
    only dial it -- so this is enforced centrally here, not left to
    each client's own docker_cmd construction."""

    def test_no_mode_segment_at_all_blocked(self):
        """Docker's own default when no mode segment is present is rw --
        this is exactly the shape the pre-fix exploit used."""
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Binds": ["docker-proxy-socket:/var/run/proxy-socket"]
            }}), NAMED_VOLUME_POLICY
        )
        assert not d.allowed
        assert "must be mounted read-only" in d.reason

    def test_explicit_rw_blocked(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Binds": ["docker-proxy-socket:/var/run/proxy-socket:rw"]
            }}), NAMED_VOLUME_POLICY
        )
        assert not d.allowed
        assert "must be mounted read-only" in d.reason

    def test_ro_combined_with_rw_blocked(self):
        """A malicious/malformed mode string can't smuggle 'rw' in
        alongside 'ro' and have the 'ro' substring match win."""
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Binds": ["docker-proxy-socket:/var/run/proxy-socket:ro,rw"]
            }}), NAMED_VOLUME_POLICY
        )
        assert not d.allowed

    def test_plain_ro_allowed(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Binds": ["docker-proxy-socket:/var/run/proxy-socket:ro"]
            }}), NAMED_VOLUME_POLICY
        )
        assert d.allowed

    def test_ro_combined_with_selinux_relabel_allowed(self):
        """Docker accepts comma-separated mode options (e.g. SELinux
        relabeling flags) -- 'ro,Z' must still count as read-only."""
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Binds": ["docker-proxy-socket:/var/run/proxy-socket:ro,Z"]
            }}), NAMED_VOLUME_POLICY
        )
        assert d.allowed

    def test_readonly_enforcement_does_not_apply_to_absolute_path_binds(self):
        """Real host-path binds (WORK_DIR, etc.) legitimately need rw --
        this new check must not spill over onto allowed_bind_prefixes."""
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Binds": ["/app/work:/work"]
            }}), NAMED_VOLUME_POLICY
        )
        assert d.allowed


class TestVolumeTypeMountBlocked:
    """Caught in review, before merge: a Type='volume' Mounts entry can
    embed the real host path in VolumeOptions.DriverConfig.Options.device
    instead of Source -- a decoy Source that passes the prefix check
    doesn't stop the DriverConfig from doing the actual bind. Only
    Type='bind' is allowed; that's all ml_utils.py's real docker run
    ever sends anyway."""

    def test_volume_type_with_bind_driveropts_blocked_even_with_decoy_source(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"Mounts": [{
                "Type": "volume",
                "Source": "/app/work/decoy",  # would pass the Source prefix check alone
                "Target": "/hostetc",
                "VolumeOptions": {"DriverConfig": {
                    "Name": "local", "Options": {"type": "none", "o": "bind", "device": "/etc"}
                }},
            }]}}), POLICY
        )
        assert not d.allowed
        assert "type" in d.reason.lower()

    def test_tmpfs_type_blocked(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"Mounts": [
                {"Type": "tmpfs", "Target": "/tmp/x"}
            ]}}), POLICY
        )
        assert not d.allowed

    def test_bind_type_still_allowed(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"Mounts": [
                {"Type": "bind", "Source": "/app/work/run-1", "Target": "/work"}
            ]}}), POLICY
        )
        assert d.allowed

    def test_missing_type_defaults_to_bind_and_is_allowed(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"Mounts": [
                {"Source": "/app/work/run-1", "Target": "/work"}
            ]}}), POLICY
        )
        assert d.allowed


class TestDevicesSecurityOptUsernsBlocked:
    def test_devices_blocked(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {
                "Devices": [{"PathOnHost": "/dev/sda", "PathInContainer": "/dev/sda", "CgroupPermissions": "rwm"}]
            }}), POLICY
        )
        assert not d.allowed

    def test_no_devices_allowed(self):
        d = check_create_body(_body({"Image": "alpine", "HostConfig": {"Devices": []}}), POLICY)
        assert d.allowed

    def test_seccomp_unconfined_blocked(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"SecurityOpt": ["seccomp=unconfined"]}}), POLICY
        )
        assert not d.allowed

    def test_apparmor_unconfined_blocked(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"SecurityOpt": ["apparmor=unconfined"]}}), POLICY
        )
        assert not d.allowed

    def test_no_new_privileges_false_blocked(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"SecurityOpt": ["no-new-privileges=false"]}}), POLICY
        )
        assert not d.allowed

    def test_benign_security_opt_allowed(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"SecurityOpt": ["no-new-privileges=true"]}}), POLICY
        )
        assert d.allowed

    def test_userns_mode_host_blocked(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"UsernsMode": "host"}}), POLICY
        )
        assert not d.allowed


class TestCapAddBlocked:
    def test_cap_add_sys_admin_blocked(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"CapAdd": ["SYS_ADMIN"]}}), POLICY
        )
        assert not d.allowed
        assert "capadd" in d.reason.lower()

    def test_empty_cap_add_allowed(self):
        d = check_create_body(_body({"Image": "alpine", "HostConfig": {"CapAdd": []}}), POLICY)
        assert d.allowed


class TestHostNamespacesBlocked:
    def test_network_mode_host_blocked(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"NetworkMode": "host"}}), POLICY
        )
        assert not d.allowed
        assert "networkmode" in d.reason.lower()

    def test_network_mode_bridge_allowed(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"NetworkMode": "bridge"}}), POLICY
        )
        assert d.allowed

    def test_pid_mode_host_blocked(self):
        d = check_create_body(_body({"Image": "alpine", "HostConfig": {"PidMode": "host"}}), POLICY)
        assert not d.allowed

    def test_ipc_mode_host_blocked(self):
        d = check_create_body(_body({"Image": "alpine", "HostConfig": {"IpcMode": "host"}}), POLICY)
        assert not d.allowed


class TestMalformedBody:
    def test_invalid_json_blocked(self):
        d = check_create_body(b"{not valid json", POLICY)
        assert not d.allowed

    def test_non_object_json_blocked(self):
        d = check_create_body(b"[1, 2, 3]", POLICY)
        assert not d.allowed

    def test_empty_body_allowed(self):
        # In practice /containers/create always has a body from a real
        # client; an empty body isn't itself a way to request anything
        # dangerous, so this fails open here rather than blocking
        # legitimate malformed-but-harmless edge cases -- the endpoint
        # allowlist plus the daemon's own validation are the backstop.
        d = check_create_body(b"", POLICY)
        assert d.allowed

    def test_non_dict_host_config_blocked(self):
        d = check_create_body(_body({"Image": "alpine", "HostConfig": "not-a-dict"}), POLICY)
        assert not d.allowed

    def test_unparseable_bind_entry_blocked(self):
        d = check_create_body(
            _body({"Image": "alpine", "HostConfig": {"Binds": ["no-colon-here"]}}), POLICY
        )
        assert not d.allowed


# ---------------------------------------------------------------------------
# Full evaluate_request() integration (endpoint + body together)
# ---------------------------------------------------------------------------

class TestEvaluateRequest:
    def test_realistic_ml_utils_create_call_allowed(self):
        """Mirrors omnibioai/plugin_executor/ml_utils.py's real
        `docker run --rm --gpus all -v run_dir:/work -v cache_dir:/root/.cache/torch
        ... <image> python /opt/scripts/run.py` -- translated to the
        equivalent /containers/create JSON body the docker CLI sends."""
        body = _body({
            "Image": "man4ish/omnibioai-variant-classifier-finetuner:1.0.0",
            "Cmd": ["python", "/opt/scripts/run.py"],
            "HostConfig": {
                "Binds": [
                    "/app/work/plugin_executor/run-abc123:/work",
                    "/home/user/.cache/omnibioai/torch:/root/.cache/torch",
                ],
                "AutoRemove": True,
            },
        })
        d = evaluate_request("POST", "/v1.43/containers/create", body, POLICY)
        assert d.allowed

    def test_privileged_escape_attempt_blocked_end_to_end(self):
        body = _body({
            "Image": "alpine",
            "Cmd": ["sh"],
            "HostConfig": {"Privileged": True, "Binds": ["/:/hostroot"]},
        })
        d = evaluate_request("POST", "/v1.43/containers/create", body, POLICY)
        assert not d.allowed

    def test_exec_into_running_container_blocked_end_to_end(self):
        d = evaluate_request("POST", "/v1.43/containers/some-id/exec", b"", POLICY)
        assert not d.allowed

    def test_non_create_endpoint_body_not_inspected(self):
        """A body on /containers/{id}/start (which real clients don't
        send, but nothing should crash if one arrived) doesn't trigger
        /containers/create's body validation."""
        d = evaluate_request("POST", "/v1.43/containers/abc/start", b"{not json", POLICY)
        assert d.allowed
