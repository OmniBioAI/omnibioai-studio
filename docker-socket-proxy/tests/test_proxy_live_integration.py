"""
Live adversarial integration test for the #265 docker-socket-proxy.

Unlike test_policy.py (pure unit tests, no I/O), this starts the REAL
proxy as a subprocess in front of the REAL local Docker daemon and
drives it with the REAL `docker` CLI -- the same rigor as #240's own
Docker-hardening adversarial proof. Every case here was manually run
and observed once during development (see the #265 PR description for
the transcript); this is that same battery, automated and re-runnable.

Skips entirely (not failed) if docker isn't available in this
environment -- this is an opt-in live test, matching the pattern
established elsewhere in this codebase for tests that need a real
Docker daemon (e.g. pdf_report_builder's opt-in live E2E).
"""
from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import time
import uuid
from pathlib import Path

import pytest

PROXY_DIR = Path(__file__).resolve().parent.parent
DOCKER_BIN = shutil.which("docker")
REAL_SOCK = "/var/run/docker.sock"

pytestmark = pytest.mark.skipif(
    DOCKER_BIN is None or not os.path.exists(REAL_SOCK),
    reason="requires a real docker CLI and a real /var/run/docker.sock -- opt-in live test",
)


@pytest.fixture(scope="module")
def proxy_env(tmp_path_factory):
    """Starts the real proxy.py subprocess against the real docker.sock,
    listening on a fresh throwaway unix socket + a fresh throwaway
    allowed-bind-prefix directory. Yields (docker_host_env, workdir)."""
    base = tmp_path_factory.mktemp("docker_proxy_live")
    listen_sock = base / "proxy.sock"
    workdir = base / "workdir"
    workdir.mkdir()

    env = dict(os.environ)
    env["PROXY_LISTEN_SOCKET"] = str(listen_sock)
    env["DOCKER_SOCK_PATH"] = REAL_SOCK
    env["PROXY_ALLOWED_BIND_PREFIXES"] = str(workdir)

    proc = subprocess.Popen(
        [sys.executable, "proxy.py"],
        cwd=str(PROXY_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    # Wait for the listen socket to actually exist and accept connections.
    deadline = time.time() + 10
    while time.time() < deadline:
        if listen_sock.exists():
            try:
                s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                s.connect(str(listen_sock))
                s.close()
                break
            except OSError:
                pass
        time.sleep(0.1)
    else:
        proc.kill()
        raise RuntimeError("proxy did not start listening in time")

    docker_host_env = dict(os.environ)
    docker_host_env["DOCKER_HOST"] = f"unix://{listen_sock}"

    try:
        yield docker_host_env, workdir
    finally:
        proc.kill()
        proc.wait(timeout=5)


def _docker(env, *args, timeout=30):
    return subprocess.run(
        [DOCKER_BIN, *args],
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def _unique_container_name() -> str:
    return f"proxy-live-test-{uuid.uuid4().hex[:12]}"


class TestLegitimateTrafficWorksEndToEnd:
    """Proves the proxy doesn't just evaluate policy correctly in
    isolation (test_policy.py already does that) -- it must also relay
    real Docker API traffic, including streamed/chunked responses,
    without breaking it."""

    def test_docker_ps(self, proxy_env):
        env, _ = proxy_env
        result = _docker(env, "ps")
        assert result.returncode == 0, result.stderr

    def test_run_with_allowed_bind_mount_full_round_trip(self, proxy_env):
        env, workdir = proxy_env
        name = _unique_container_name()
        result = _docker(
            env, "run", "--rm", "--name", name,
            "-v", f"{workdir}:/work",
            "alpine:latest", "sh", "-c",
            "echo hello-from-proxy > /work/out.txt && cat /work/out.txt",
        )
        assert result.returncode == 0, result.stderr
        assert "hello-from-proxy" in result.stdout
        assert (workdir / "out.txt").read_text().strip() == "hello-from-proxy"

    def test_pull_already_present_image(self, proxy_env):
        """Exercises POST /images/create's chunked progress-stream
        response -- a more complex framing case than a plain JSON body."""
        env, _ = proxy_env
        result = _docker(env, "pull", "alpine:latest", timeout=60)
        assert result.returncode == 0, result.stderr

    def test_logs_on_a_running_container(self, proxy_env):
        env, workdir = proxy_env
        name = _unique_container_name()
        try:
            run = _docker(
                env, "run", "-d", "--name", name,
                "-v", f"{workdir}:/work",
                "alpine:latest", "sh", "-c", "echo log-line-1; sleep 10",
            )
            assert run.returncode == 0, run.stderr
            time.sleep(1)
            logs = _docker(env, "logs", name)
            assert logs.returncode == 0, logs.stderr
            assert "log-line-1" in logs.stdout
        finally:
            _docker(env, "rm", "-f", name)


class TestAdversarialRequestsAreBlocked:
    """Each case is a real escape technique from #265's own threat
    model. Every one of these must be rejected by the proxy itself
    (403-style denial) -- never merely fail for some other reason."""

    def test_privileged_blocked(self, proxy_env):
        env, workdir = proxy_env
        result = _docker(
            env, "run", "--rm", "--privileged",
            "-v", f"{workdir}:/work", "alpine:latest", "echo", "pwned",
        )
        assert result.returncode != 0
        assert "denied" in result.stderr.lower()
        assert "privileged" in result.stderr.lower()

    def test_root_bind_mount_blocked(self, proxy_env):
        env, _ = proxy_env
        result = _docker(env, "run", "--rm", "-v", "/:/hostroot", "alpine:latest", "true")
        assert result.returncode != 0
        assert "denied" in result.stderr.lower()

    def test_bind_mount_outside_allowed_prefix_blocked(self, proxy_env):
        env, _ = proxy_env
        result = _docker(env, "run", "--rm", "-v", "/tmp:/hosttmp", "alpine:latest", "true")
        assert result.returncode != 0
        assert "denied" in result.stderr.lower()

    def test_docker_sock_remount_blocked(self, proxy_env):
        """Prevents the exact bypass this proxy exists to close: asking
        the daemon to hand a spawned sibling container the RAW host
        socket, sidestepping the proxy entirely for that container."""
        env, _ = proxy_env
        result = _docker(
            env, "run", "--rm",
            "-v", "/var/run/docker.sock:/var/run/docker.sock",
            "alpine:latest", "true",
        )
        assert result.returncode != 0
        assert "denied" in result.stderr.lower()

    def test_cap_add_blocked(self, proxy_env):
        env, workdir = proxy_env
        result = _docker(
            env, "run", "--rm", "--cap-add", "SYS_ADMIN",
            "-v", f"{workdir}:/work", "alpine:latest", "echo", "pwned",
        )
        assert result.returncode != 0
        assert "denied" in result.stderr.lower()
        assert "capadd" in result.stderr.lower()

    def test_network_host_blocked(self, proxy_env):
        env, workdir = proxy_env
        result = _docker(
            env, "run", "--rm", "--network", "host",
            "-v", f"{workdir}:/work", "alpine:latest", "echo", "pwned",
        )
        assert result.returncode != 0
        assert "denied" in result.stderr.lower()
        assert "networkmode" in result.stderr.lower()

    def test_exec_into_running_container_blocked(self, proxy_env):
        env, workdir = proxy_env
        name = _unique_container_name()
        try:
            run = _docker(
                env, "run", "-d", "--name", name,
                "-v", f"{workdir}:/work", "alpine:latest", "sleep", "30",
            )
            assert run.returncode == 0, run.stderr
            result = _docker(env, "exec", name, "whoami")
            assert result.returncode != 0
            assert "denied" in result.stderr.lower()
            assert "allowlist" in result.stderr.lower()
        finally:
            _docker(env, "rm", "-f", name)


class TestConnectionReuseDoesNotCauseIntermittentFailures:
    """Regression test for the bug found while verifying #58's real
    published image (see _force_connection_close() in proxy.py, and
    test_proxy_connection_handling.py for the pure unit coverage of
    that fix). handle_client() is strictly one request per connection
    -- but the real daemon's own responses (e.g. /_ping) are plain
    HTTP/1.1 and default to persistent when they don't say otherwise,
    which is exactly what they usually don't say. Relaying that
    verbatim let an HTTP/1.1 client's connection pool (Go's net/http,
    used by the `docker` CLI and Docker SDKs) believe a connection was
    reusable and race its next request against this proxy already
    having torn it down.

    A single request/response pair -- what every other test in this
    file exercises -- never surfaces this; it only shows up across a
    *sequence* of calls sharing one client's connection pool, since
    that's what triggers the client's own reuse logic. Each `docker`
    CLI invocation already makes several such calls on one shared Go
    http.Client (2x /_ping, create, attach, wait, start for an allowed
    run); repeating real invocations enough times reliably reproduced
    the pre-fix race -- ~4 of 5 failed with "connection reset by
    peer" / "broken pipe" / "http: server closed idle connection"
    against the real published (pre-fix) image."""

    def test_many_sequential_legitimate_runs_all_succeed(self, proxy_env):
        env, workdir = proxy_env
        for i in range(15):
            result = _docker(
                env, "run", "--rm",
                "-v", f"{workdir}:/work", "alpine:latest",
                "sh", "-c", f"echo seq-{i} > /work/seq-{i}.txt",
            )
            assert result.returncode == 0, f"iteration {i}: {result.stderr}"
            assert "reset" not in result.stderr.lower()
            assert "broken pipe" not in result.stderr.lower()
            assert "closed idle connection" not in result.stderr.lower()
            assert (workdir / f"seq-{i}.txt").read_text().strip() == f"seq-{i}"

    def test_many_sequential_denied_runs_still_get_a_clean_response(self, proxy_env):
        """The pre-fix race hit denied requests exactly as often as
        allowed ones -- the bug was in response framing shared by both
        paths, not in policy logic. Confirms the deny path is equally
        reliable now."""
        env, _ = proxy_env
        for i in range(15):
            result = _docker(env, "run", "--rm", "--privileged", "alpine:latest", "echo", "pwned")
            assert result.returncode != 0
            assert "denied" in result.stderr.lower(), f"iteration {i}: {result.stderr}"
            assert "privileged" in result.stderr.lower(), f"iteration {i}: {result.stderr}"
            assert "reset" not in result.stderr.lower()
            assert "broken pipe" not in result.stderr.lower()

    def test_interleaved_allowed_and_denied_calls_all_clean(self, proxy_env):
        """Alternating allow/deny within one long sequence -- closest
        to real mixed traffic through one long-lived proxy."""
        env, workdir = proxy_env
        for i in range(10):
            legit = _docker(env, "run", "--rm", "-v", f"{workdir}:/work", "alpine:latest", "true")
            assert legit.returncode == 0, f"iteration {i} (allow): {legit.stderr}"
            denied = _docker(env, "run", "--rm", "--network", "host", "alpine:latest", "true")
            assert denied.returncode != 0
            assert "denied" in denied.stderr.lower(), f"iteration {i} (deny): {denied.stderr}"
